import csv
import io
import re
from typing import Iterable, Optional

import chess
import chess.pgn
from django.db import transaction

from .cheat_detection import run_cheat_analysis_from_sequence
from .models import Game, IrwinTrainingData

_RESULT_TOKENS = {"1-0", "0-1", "1/2-1/2", "*"}
_MOVE_NUMBER_RE = re.compile(r"\d+\.(?:\.\.)?")


def normalize_start_fen(start_fen: Optional[str]) -> str:
    resolved = (start_fen or "").strip() or Game.START_FEN
    try:
        chess.Board(resolved)
    except ValueError as exc:
        raise ValueError(f"Invalid start FEN: {exc}") from exc
    return resolved


def parse_move_times_seconds(raw_value, *, expected_count: Optional[int] = None) -> list[float]:
    if raw_value in (None, "", []):
        return []

    if isinstance(raw_value, list):
        tokens = raw_value
    else:
        tokens = [token for token in re.split(r"[\s,]+", str(raw_value).strip()) if token]

    values = []
    for idx, token in enumerate(tokens, start=1):
        try:
            value = float(token)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid move time at position {idx}: {token}") from exc
        if value < 0:
            raise ValueError(f"Move time must be non-negative at position {idx}.")
        values.append(round(value, 3))

    if expected_count is not None and values and len(values) != expected_count:
        raise ValueError(
            f"Move times count ({len(values)}) must match move count ({expected_count})."
        )

    return values


def parse_moves_text(
    moves_text: str,
    *,
    start_fen: Optional[str] = None,
    move_format: str = IrwinTrainingData.FORMAT_AUTO,
) -> tuple[list[str], str, str]:
    if not (moves_text or "").strip():
        raise ValueError("Game moves are required.")

    explicit_start_fen = normalize_start_fen(start_fen)
    requested_format = (move_format or IrwinTrainingData.FORMAT_AUTO).lower().strip()
    allowed_formats = {
        IrwinTrainingData.FORMAT_AUTO,
        IrwinTrainingData.FORMAT_PGN,
        IrwinTrainingData.FORMAT_SAN,
        IrwinTrainingData.FORMAT_UCI,
    }
    if requested_format not in allowed_formats:
        raise ValueError(f"Unsupported move format: {move_format}")

    attempts = []
    if requested_format == IrwinTrainingData.FORMAT_AUTO:
        attempts = [
            IrwinTrainingData.FORMAT_UCI,
            IrwinTrainingData.FORMAT_PGN,
            IrwinTrainingData.FORMAT_SAN,
        ]
    else:
        attempts = [requested_format]

    last_error = None
    for candidate in attempts:
        try:
            if candidate == IrwinTrainingData.FORMAT_PGN:
                san_moves, effective_start = _try_parse_pgn(moves_text, explicit_start_fen)
            elif candidate == IrwinTrainingData.FORMAT_UCI:
                san_moves, effective_start = _try_parse_uci(moves_text, explicit_start_fen)
            else:
                san_moves, effective_start = _try_parse_san(moves_text, explicit_start_fen)
            return san_moves, effective_start, candidate
        except ValueError as exc:
            last_error = exc

    raise ValueError(str(last_error or "Could not parse moves input."))


def save_single_import_sample(
    *,
    labeled_by,
    moves_text: str,
    suspect_color: str,
    label: str,
    move_times_seconds=None,
    start_fen: Optional[str] = None,
    move_format: str = IrwinTrainingData.FORMAT_AUTO,
    source_ref: str = "",
    external_id: str = "",
    notes: str = "",
    source_type: str = IrwinTrainingData.SOURCE_SINGLE_IMPORT,
    import_job=None,
    import_row_number: Optional[int] = None,
):
    suspect_color = (suspect_color or "").strip().lower()
    if suspect_color not in {IrwinTrainingData.COLOR_WHITE, IrwinTrainingData.COLOR_BLACK}:
        raise ValueError("Suspect color must be white or black.")

    normalized_label = (label or "").strip().lower()
    if normalized_label not in {"clean", "cheat"}:
        raise ValueError("Label must be clean or cheat.")

    normalized_external_id = (external_id or "").strip()
    if normalized_external_id:
        existing = IrwinTrainingData.objects.filter(external_id=normalized_external_id)
        if import_job is not None and import_row_number is not None:
            existing = existing.exclude(import_job=import_job, import_row_number=import_row_number)
        if existing.exists():
            raise ValueError("A training sample with this external ID already exists.")

    san_moves, resolved_start_fen, detected_format = parse_moves_text(
        moves_text,
        start_fen=start_fen,
        move_format=move_format,
    )
    parsed_times = parse_move_times_seconds(
        move_times_seconds,
        expected_count=len(san_moves),
    )
    move_times_ms = [int(round(value * 1000)) for value in parsed_times]

    analysis = run_cheat_analysis_from_sequence(
        san_moves,
        player_is_white=suspect_color == IrwinTrainingData.COLOR_WHITE,
        move_times_ms=move_times_ms,
        start_fen=resolved_start_fen,
        player_rating=800,
    )

    with transaction.atomic():
        sample = IrwinTrainingData.objects.create(
            game=None,
            player=None,
            label=normalized_label == "cheat",
            tensor_data=analysis["tensor_data"],
            source_type=source_type,
            suspect_color=suspect_color,
            moves_text=(moves_text or "").strip(),
            start_fen=resolved_start_fen,
            move_times_seconds=parsed_times,
            move_format=detected_format,
            source_ref=(source_ref or "").strip(),
            external_id=normalized_external_id,
            notes=(notes or "").strip(),
            import_job=import_job,
            import_row_number=import_row_number,
            labeled_by=labeled_by,
        )
    return sample


def iter_csv_rows(csv_content: str) -> Iterable[dict]:
    reader = csv.DictReader(io.StringIO(csv_content or ""))
    if not reader.fieldnames:
        raise ValueError("CSV file must include a header row.")
    required = {"moves", "suspect_color", "label"}
    missing = required.difference({field.strip() for field in reader.fieldnames if field})
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")
    for row in reader:
        normalized = {key.strip(): (value or "") for key, value in row.items() if key}
        if not any(str(value).strip() for value in normalized.values()):
            continue
        yield normalized


def count_csv_rows(csv_content: str) -> int:
    return sum(1 for _ in iter_csv_rows(csv_content))


def _try_parse_pgn(moves_text: str, explicit_start_fen: str) -> tuple[list[str], str]:
    parsed_game = chess.pgn.read_game(io.StringIO(moves_text))
    if not parsed_game:
        raise ValueError("PGN parser could not read the game.")

    header_fen = (parsed_game.headers.get("FEN") or "").strip()
    effective_start_fen = explicit_start_fen or header_fen or Game.START_FEN
    board = chess.Board(effective_start_fen)
    san_moves = []

    try:
        for move in parsed_game.mainline_moves():
            san_moves.append(board.san(move))
            board.push(move)
    except Exception as exc:
        raise ValueError(f"PGN moves are invalid for the given start position: {exc}") from exc

    if not san_moves:
        raise ValueError("PGN does not contain any moves.")
    return san_moves, effective_start_fen


def _try_parse_uci(moves_text: str, explicit_start_fen: str) -> tuple[list[str], str]:
    board = chess.Board(explicit_start_fen)
    tokens = [token.strip() for token in re.split(r"[\s,]+", moves_text.strip()) if token.strip()]
    if not tokens:
        raise ValueError("No UCI moves found.")

    san_moves = []
    for idx, token in enumerate(tokens, start=1):
        if token in _RESULT_TOKENS:
            continue
        try:
            move = chess.Move.from_uci(token)
        except ValueError as exc:
            raise ValueError(f"Invalid UCI move at position {idx}: {token}") from exc
        if move not in board.legal_moves:
            raise ValueError(f"Illegal UCI move at position {idx}: {token}")
        san_moves.append(board.san(move))
        board.push(move)

    if not san_moves:
        raise ValueError("No legal UCI moves found.")
    return san_moves, explicit_start_fen


def _try_parse_san(moves_text: str, explicit_start_fen: str) -> tuple[list[str], str]:
    board = chess.Board(explicit_start_fen)
    cleaned = re.sub(r"\{[^}]*\}", " ", moves_text)
    cleaned = re.sub(r";[^\n]*", " ", cleaned)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\$\d+", " ", cleaned)
    cleaned = _MOVE_NUMBER_RE.sub(" ", cleaned)
    tokens = [token.strip() for token in cleaned.split() if token.strip()]
    if not tokens:
        raise ValueError("No SAN moves found.")

    san_moves = []
    for idx, token in enumerate(tokens, start=1):
        if token in _RESULT_TOKENS:
            continue
        try:
            move = board.parse_san(token)
        except Exception as exc:
            raise ValueError(f"Invalid SAN move at position {idx}: {token}") from exc
        san_moves.append(board.san(move))
        board.push(move)

    if not san_moves:
        raise ValueError("No legal SAN moves found.")
    return san_moves, explicit_start_fen
