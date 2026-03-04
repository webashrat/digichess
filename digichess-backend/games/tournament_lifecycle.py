import math
from collections import defaultdict
from typing import Dict, List, Optional, Sequence, Tuple

import chess
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Game, Tournament, TournamentGame, TournamentParticipant

OPEN_GAME_STATUSES = [Game.STATUS_PENDING, Game.STATUS_ACTIVE]


def _participant_ids(tournament: Tournament) -> List[int]:
    return list(
        tournament.participants.order_by("joined_at").values_list("user_id", flat=True)
    )


def _participant_username_map(tournament: Tournament) -> Dict[int, str]:
    return {
        p.user_id: p.user.username
        for p in tournament.participants.select_related("user")
    }


def _round_has_any_games(tournament: Tournament, round_number: int) -> bool:
    return TournamentGame.objects.filter(
        tournament=tournament, round_number=round_number
    ).exists()


def _round_has_open_games(tournament: Tournament, round_number: int) -> bool:
    return TournamentGame.objects.filter(
        tournament=tournament,
        round_number=round_number,
        game__status__in=OPEN_GAME_STATUSES,
    ).exists()


def _game_points(result: str, player_is_white: bool) -> float:
    if result == Game.RESULT_DRAW:
        return 0.5
    if player_is_white and result == Game.RESULT_WHITE:
        return 1.0
    if (not player_is_white) and result == Game.RESULT_BLACK:
        return 1.0
    return 0.0


def _create_tournament_game(
    tournament: Tournament,
    white_id: int,
    black_id: int,
    round_number: int,
) -> int:
    game = Game.objects.create(
        creator=tournament.creator,
        white_id=white_id,
        black_id=black_id,
        rated=tournament.rated,
        time_control=tournament.time_control,
        initial_time_seconds=tournament.initial_time_seconds,
        increment_seconds=tournament.increment_seconds,
        white_time_seconds=tournament.initial_time_seconds,
        black_time_seconds=tournament.initial_time_seconds,
        white_increment_seconds=tournament.increment_seconds,
        black_increment_seconds=tournament.increment_seconds,
        white_time_left=tournament.initial_time_seconds,
        black_time_left=tournament.initial_time_seconds,
        current_fen=chess.STARTING_FEN,
        status=Game.STATUS_ACTIVE,
        started_at=timezone.now(),
        last_move_at=timezone.now(),
    )
    TournamentGame.objects.create(
        tournament=tournament, game=game, round_number=round_number
    )
    return game.id


def _choose_colors(
    user_a: int,
    user_b: int,
    color_balance: Dict[int, int],
) -> Tuple[int, int]:
    balance_a = color_balance.get(user_a, 0)
    balance_b = color_balance.get(user_b, 0)
    if balance_a > balance_b:
        return user_b, user_a
    if balance_b > balance_a:
        return user_a, user_b
    return (user_a, user_b) if user_a < user_b else (user_b, user_a)


def _score_table_standard(
    tournament: Tournament,
) -> Tuple[Dict[int, float], Dict[int, List[int]]]:
    participant_ids = _participant_ids(tournament)
    scores = {uid: 0.0 for uid in participant_ids}
    opponents = {uid: [] for uid in participant_ids}
    games = tournament.tournament_games.select_related("game").filter(
        game__status=Game.STATUS_FINISHED
    )
    for tg in games:
        game = tg.game
        scores[game.white_id] = scores.get(game.white_id, 0.0) + _game_points(
            game.result, True
        )
        scores[game.black_id] = scores.get(game.black_id, 0.0) + _game_points(
            game.result, False
        )
        opponents.setdefault(game.white_id, []).append(game.black_id)
        opponents.setdefault(game.black_id, []).append(game.white_id)
    return scores, opponents


def _score_table_arena(
    tournament: Tournament,
) -> Tuple[Dict[int, int], Dict[int, int], Dict[int, int], Dict[int, int], Dict[int, int]]:
    participant_ids = _participant_ids(tournament)
    scores = {uid: 0 for uid in participant_ids}
    current_streak = {uid: 0 for uid in participant_ids}
    max_streak = {uid: 0 for uid in participant_ids}
    wins = {uid: 0 for uid in participant_ids}
    draws = {uid: 0 for uid in participant_ids}
    losses = {uid: 0 for uid in participant_ids}

    games = (
        tournament.tournament_games.select_related("game")
        .filter(game__status=Game.STATUS_FINISHED)
        .order_by("game__finished_at", "id")
    )

    def apply_win(user_id: int):
        wins[user_id] = wins.get(user_id, 0) + 1
        current_streak[user_id] = current_streak.get(user_id, 0) + 1
        max_streak[user_id] = max(max_streak.get(user_id, 0), current_streak[user_id])
        points = 2
        if current_streak[user_id] >= 3:
            points += 2
        scores[user_id] = scores.get(user_id, 0) + points

    def apply_non_win(user_id: int):
        current_streak[user_id] = 0

    for tg in games:
        game = tg.game
        white_id = game.white_id
        black_id = game.black_id
        if game.result == Game.RESULT_WHITE:
            apply_win(white_id)
            losses[black_id] = losses.get(black_id, 0) + 1
            apply_non_win(black_id)
        elif game.result == Game.RESULT_BLACK:
            apply_win(black_id)
            losses[white_id] = losses.get(white_id, 0) + 1
            apply_non_win(white_id)
        elif game.result == Game.RESULT_DRAW:
            draws[white_id] = draws.get(white_id, 0) + 1
            draws[black_id] = draws.get(black_id, 0) + 1
            scores[white_id] = scores.get(white_id, 0) + 1
            scores[black_id] = scores.get(black_id, 0) + 1
            apply_non_win(white_id)
            apply_non_win(black_id)

    return scores, current_streak, max_streak, wins, draws, losses


def build_tournament_standings(tournament: Tournament) -> List[dict]:
    username_map = _participant_username_map(tournament)
    participant_ids = list(username_map.keys())
    if tournament.type == Tournament.TYPE_ARENA:
        scores, streak, max_streak, wins, draws, losses = _score_table_arena(tournament)
        ranked = sorted(
            participant_ids,
            key=lambda uid: (
                -scores.get(uid, 0),
                -wins.get(uid, 0),
                -max_streak.get(uid, 0),
                uid,
            ),
        )
        return [
            {
                "user_id": uid,
                "username": username_map[uid],
                "score": scores.get(uid, 0),
                "wins": wins.get(uid, 0),
                "draws": draws.get(uid, 0),
                "losses": losses.get(uid, 0),
                "streak": streak.get(uid, 0),
                "max_streak": max_streak.get(uid, 0),
            }
            for uid in ranked
        ]

    scores, opponents = _score_table_standard(tournament)
    if tournament.type == Tournament.TYPE_SWISS:
        buchholz = {}
        median_buchholz = {}
        for uid in participant_ids:
            opps = opponents.get(uid, [])
            opp_scores = [scores.get(opp_uid, 0.0) for opp_uid in opps]
            buchholz[uid] = sum(opp_scores)
            if len(opp_scores) <= 2:
                median_buchholz[uid] = buchholz[uid]
            else:
                median_buchholz[uid] = sum(sorted(opp_scores)[1:-1])
        ranked = sorted(
            participant_ids,
            key=lambda uid: (
                -scores.get(uid, 0.0),
                -buchholz.get(uid, 0.0),
                -median_buchholz.get(uid, 0.0),
                uid,
            ),
        )
        return [
            {
                "user_id": uid,
                "username": username_map[uid],
                "score": scores.get(uid, 0.0),
                "buchholz": buchholz.get(uid, 0.0),
                "median_buchholz": median_buchholz.get(uid, 0.0),
            }
            for uid in ranked
        ]

    ranked = sorted(participant_ids, key=lambda uid: (-scores.get(uid, 0.0), uid))
    return [
        {
            "user_id": uid,
            "username": username_map[uid],
            "score": scores.get(uid, 0.0),
        }
        for uid in ranked
    ]


def _normalize_winners(
    tournament: Tournament,
    winners: Optional[Sequence[object]] = None,
) -> List[str]:
    username_map = _participant_username_map(tournament)
    if winners is not None:
        normalized: List[str] = []
        for winner in winners:
            if isinstance(winner, int):
                username = username_map.get(winner)
                if username:
                    normalized.append(username)
            elif winner:
                normalized.append(str(winner))
            if len(normalized) >= 3:
                break
        return normalized[:3]

    standings = build_tournament_standings(tournament)
    return [row["username"] for row in standings[:3]]


def finish_tournament(
    tournament: Tournament,
    winners: Optional[Sequence[object]] = None,
    finished_at=None,
) -> Tournament:
    now = finished_at or timezone.now()
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        locked.winners = _normalize_winners(locked, winners=winners)
        locked.status = Tournament.STATUS_COMPLETED
        locked.finished_at = now
        locked.save(update_fields=["winners", "status", "finished_at"])

        orphaned = TournamentGame.objects.filter(
            tournament=locked,
            game__status__in=OPEN_GAME_STATUSES,
        ).select_related("game")
        for tg in orphaned:
            game = tg.game
            move_count = len((game.moves or "").strip().split()) if game.moves else 0
            if move_count >= 2:
                game.status = Game.STATUS_FINISHED
                game.result = Game.RESULT_DRAW
            else:
                game.status = Game.STATUS_ABORTED
                game.result = Game.RESULT_NONE
            game.finished_at = now
            game.save(update_fields=["status", "result", "finished_at"])

    _broadcast_orphaned_game_finishes(tournament, now)
    tournament.refresh_from_db()
    return tournament


def _broadcast_orphaned_game_finishes(tournament: Tournament, finished_at):
    """Send game_finished WebSocket events for games that were force-closed."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from .serializers import GameSerializer

        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        closed_games = TournamentGame.objects.filter(
            tournament=tournament,
            game__finished_at=finished_at,
        ).select_related("game", "game__white", "game__black")

        for tg in closed_games:
            game = tg.game
            if game.status not in (Game.STATUS_FINISHED, Game.STATUS_ABORTED):
                continue
            game_data = GameSerializer(game).data
            reason = "tournament_ended"
            payload = {
                "type": "game_finished",
                "game_id": game.id,
                "result": game.result,
                "reason": reason,
                "game": game_data,
            }
            async_to_sync(channel_layer.group_send)(
                f"game_{game.id}",
                {"type": "game.event", "payload": payload},
            )
            for user_id in (game.white_id, game.black_id):
                async_to_sync(channel_layer.group_send)(
                    f"user_{user_id}",
                    {"type": "game.event", "payload": payload},
                )
    except Exception:
        pass


def _swiss_history(
    tournament: Tournament,
) -> Tuple[Dict[int, set], Dict[int, int]]:
    history = defaultdict(set)
    color_balance = defaultdict(int)
    games = tournament.tournament_games.select_related("game").exclude(
        game__status=Game.STATUS_ABORTED
    )
    for tg in games:
        game = tg.game
        history[game.white_id].add(game.black_id)
        history[game.black_id].add(game.white_id)
        color_balance[game.white_id] += 1
        color_balance[game.black_id] -= 1
    return history, color_balance


def generate_swiss_pairings(
    tournament: Tournament,
    round_number: Optional[int] = None,
) -> List[int]:
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        if locked.type != Tournament.TYPE_SWISS:
            return []
        round_number = round_number or locked.current_round or 1
        if _round_has_open_games(locked, round_number):
            return []
        if _round_has_any_games(locked, round_number):
            return list(
                TournamentGame.objects.filter(
                    tournament=locked, round_number=round_number
                ).values_list("game_id", flat=True)
            )

        participant_ids = _participant_ids(locked)
        if len(participant_ids) < 2:
            return []

        scores, _ = _score_table_standard(locked)
        history, color_balance = _swiss_history(locked)
        ordered = sorted(participant_ids, key=lambda uid: (-scores.get(uid, 0.0), uid))
        unpaired = ordered[:]
        pairings = []

        while len(unpaired) >= 2:
            player_id = unpaired.pop(0)
            best_index = None
            best_key = None
            for idx, candidate_id in enumerate(unpaired):
                replay_penalty = 1 if candidate_id in history.get(player_id, set()) else 0
                score_gap = abs(scores.get(player_id, 0.0) - scores.get(candidate_id, 0.0))
                key = (replay_penalty, score_gap, candidate_id)
                if best_key is None or key < best_key:
                    best_key = key
                    best_index = idx

            if best_index is None:
                break

            opponent_id = unpaired.pop(best_index)
            white_id, black_id = _choose_colors(player_id, opponent_id, color_balance)
            pairings.append((white_id, black_id))
            history[player_id].add(opponent_id)
            history[opponent_id].add(player_id)
            color_balance[white_id] += 1
            color_balance[black_id] -= 1

        created = []
        for white_id, black_id in pairings:
            created.append(
                _create_tournament_game(
                    tournament=locked,
                    white_id=white_id,
                    black_id=black_id,
                    round_number=round_number,
                )
            )
        return created


def _round_robin_total_rounds(player_count: int) -> int:
    if player_count < 2:
        return 0
    slots = player_count if player_count % 2 == 0 else player_count + 1
    return slots - 1


def _round_robin_pairings(
    participant_ids: List[int],
    round_number: int,
) -> List[Tuple[int, int]]:
    players = participant_ids[:]
    if len(players) % 2 == 1:
        players.append(None)
    slots = len(players)
    if slots < 2:
        return []

    rotation = players[:]
    for _ in range(round_number - 1):
        rotation = [rotation[0]] + [rotation[-1]] + rotation[1:-1]

    pairings = []
    for idx in range(slots // 2):
        left = rotation[idx]
        right = rotation[slots - 1 - idx]
        if left is None or right is None:
            continue
        if round_number % 2 == 1:
            white_id, black_id = (left, right) if idx % 2 == 0 else (right, left)
        else:
            white_id, black_id = (right, left) if idx % 2 == 0 else (left, right)
        pairings.append((white_id, black_id))
    return pairings


def create_round_robin_round(
    tournament: Tournament,
    round_number: Optional[int] = None,
) -> List[int]:
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        if locked.type != Tournament.TYPE_ROUND_ROBIN:
            return []
        round_number = round_number or locked.current_round or 1
        if _round_has_open_games(locked, round_number):
            return []
        if _round_has_any_games(locked, round_number):
            return list(
                TournamentGame.objects.filter(
                    tournament=locked, round_number=round_number
                ).values_list("game_id", flat=True)
            )

        participant_ids = _participant_ids(locked)
        total_rounds = _round_robin_total_rounds(len(participant_ids))
        if round_number > total_rounds:
            return []

        pairings = _round_robin_pairings(participant_ids, round_number)
        created = []
        for white_id, black_id in pairings:
            created.append(
                _create_tournament_game(
                    tournament=locked,
                    white_id=white_id,
                    black_id=black_id,
                    round_number=round_number,
                )
            )
        return created


def create_knockout_round(
    tournament: Tournament,
    round_number: Optional[int] = None,
    player_ids: Optional[Sequence[int]] = None,
) -> List[int]:
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        if locked.type != Tournament.TYPE_KNOCKOUT:
            return []
        round_number = round_number or locked.current_round or 1
        if _round_has_open_games(locked, round_number):
            return []
        if _round_has_any_games(locked, round_number):
            return list(
                TournamentGame.objects.filter(
                    tournament=locked, round_number=round_number
                ).values_list("game_id", flat=True)
            )

        ids = list(player_ids) if player_ids is not None else _participant_ids(locked)
        created = []
        for idx in range(0, len(ids) - 1, 2):
            white_id, black_id = ids[idx], ids[idx + 1]
            if idx // 2 % 2 == 1:
                white_id, black_id = black_id, white_id
            created.append(
                _create_tournament_game(
                    tournament=locked,
                    white_id=white_id,
                    black_id=black_id,
                    round_number=round_number,
                )
            )
        return created


def pair_idle_arena_players(tournament: Tournament) -> List[int]:
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        if locked.type != Tournament.TYPE_ARENA:
            return []
        if locked.status != Tournament.STATUS_ACTIVE:
            return []

        participant_ids = _participant_ids(locked)
        if len(participant_ids) < 2:
            return []

        players_with_open_games = set()
        open_games = locked.tournament_games.select_related("game").filter(
            game__status__in=OPEN_GAME_STATUSES
        )
        for tg in open_games:
            players_with_open_games.add(tg.game.white_id)
            players_with_open_games.add(tg.game.black_id)

        available = [
            uid for uid in participant_ids if uid not in players_with_open_games
        ]
        if len(available) < 2:
            return []

        color_balance = defaultdict(int)
        all_games = locked.tournament_games.select_related("game").exclude(
            game__status=Game.STATUS_ABORTED
        )
        for tg in all_games:
            color_balance[tg.game.white_id] += 1
            color_balance[tg.game.black_id] -= 1

        created = []
        for idx in range(0, len(available) - 1, 2):
            player_a = available[idx]
            player_b = available[idx + 1]
            white_id, black_id = _choose_colors(player_a, player_b, color_balance)
            created.append(
                _create_tournament_game(
                    tournament=locked,
                    white_id=white_id,
                    black_id=black_id,
                    round_number=locked.current_round or 1,
                )
            )
            color_balance[white_id] += 1
            color_balance[black_id] -= 1
        return created


def start_tournament(tournament: Tournament) -> Tournament:
    with transaction.atomic():
        locked = Tournament.objects.select_for_update().get(id=tournament.id)
        if locked.status != Tournament.STATUS_PENDING:
            raise ValueError("Tournament already started.")

        participants = list(locked.participants.order_by("joined_at"))
        participant_count = len(participants)
        update_fields = ["status", "started_at", "current_round", "finished_at"]

        if locked.type == Tournament.TYPE_KNOCKOUT:
            if participant_count < 2:
                raise ValueError("Not enough participants for knockout.")
            power = 2 ** int(math.floor(math.log(participant_count, 2)))
            to_drop = participant_count - power
            if to_drop > 0:
                drop_ids = [p.id for p in participants[-to_drop:]]
                TournamentParticipant.objects.filter(id__in=drop_ids).delete()
            locked.current_round = 1
        elif locked.type == Tournament.TYPE_ARENA:
            if participant_count < 2:
                raise ValueError("Not enough participants for arena.")
            if locked.current_round <= 0:
                locked.current_round = 1
        elif locked.type == Tournament.TYPE_SWISS:
            if participant_count < 2:
                raise ValueError("Not enough participants for swiss.")
            if locked.swiss_rounds <= 0:
                raise ValueError("swiss_rounds must be > 0.")
            locked.current_round = 1
        elif locked.type == Tournament.TYPE_ROUND_ROBIN:
            if participant_count < 2:
                raise ValueError("Not enough participants for round robin.")
            locked.current_round = 1

        now = timezone.now()
        locked.status = Tournament.STATUS_ACTIVE
        locked.started_at = now
        if locked.type == Tournament.TYPE_ARENA and locked.arena_duration_minutes > 0:
            locked.finished_at = now + timezone.timedelta(
                minutes=locked.arena_duration_minutes
            )
        else:
            locked.finished_at = None

        locked.save(update_fields=update_fields)

    tournament.refresh_from_db()
    if tournament.type == Tournament.TYPE_SWISS:
        generate_swiss_pairings(tournament, round_number=tournament.current_round)
    elif tournament.type == Tournament.TYPE_ROUND_ROBIN:
        create_round_robin_round(tournament, round_number=tournament.current_round)
    elif tournament.type == Tournament.TYPE_KNOCKOUT:
        create_knockout_round(tournament, round_number=tournament.current_round)
    elif tournament.type == Tournament.TYPE_ARENA:
        pair_idle_arena_players(tournament)
    tournament.refresh_from_db()
    return tournament


def _knockout_round_winners(
    tournament: Tournament,
    round_number: int,
) -> Optional[List[int]]:
    games = TournamentGame.objects.filter(
        tournament=tournament, round_number=round_number
    ).select_related("game")
    winners = []
    for tg in games:
        game = tg.game
        if game.status in OPEN_GAME_STATUSES:
            return None
        if game.result == Game.RESULT_WHITE:
            winners.append(game.white_id)
        elif game.result == Game.RESULT_BLACK:
            winners.append(game.black_id)
        elif game.result == Game.RESULT_DRAW:
            winners.append(game.white_id)
        else:
            winners.append(game.white_id)
    return winners


def advance_tournament(
    tournament: Tournament,
    pair_idle_for_arena: bool = True,
) -> dict:
    if tournament.status != Tournament.STATUS_ACTIVE:
        return {"completed": False, "pairings": []}

    now = timezone.now()
    tournament.refresh_from_db()

    if tournament.type == Tournament.TYPE_ARENA:
        end_at = tournament.finished_at
        if not end_at and tournament.started_at and tournament.arena_duration_minutes > 0:
            end_at = tournament.started_at + timezone.timedelta(
                minutes=tournament.arena_duration_minutes
            )
        if end_at and now >= end_at:
            finish_tournament(tournament, finished_at=now)
            return {"completed": True, "pairings": []}
        pairings = pair_idle_arena_players(tournament) if pair_idle_for_arena else []
        return {"completed": False, "pairings": pairings}

    current_round = tournament.current_round or 1

    if tournament.type == Tournament.TYPE_SWISS:
        if _round_has_open_games(tournament, current_round):
            return {"completed": False, "pairings": []}
        if not _round_has_any_games(tournament, current_round):
            pairings = generate_swiss_pairings(tournament, round_number=current_round)
            return {"completed": False, "pairings": pairings}
        if current_round >= tournament.swiss_rounds:
            finish_tournament(tournament, finished_at=now)
            return {"completed": True, "pairings": []}
        tournament.current_round = current_round + 1
        tournament.save(update_fields=["current_round"])
        pairings = generate_swiss_pairings(
            tournament, round_number=tournament.current_round
        )
        return {"completed": False, "pairings": pairings}

    if tournament.type == Tournament.TYPE_ROUND_ROBIN:
        participant_count = tournament.participants.count()
        total_rounds = _round_robin_total_rounds(participant_count)
        if _round_has_open_games(tournament, current_round):
            return {"completed": False, "pairings": []}
        if not _round_has_any_games(tournament, current_round):
            pairings = create_round_robin_round(
                tournament, round_number=current_round
            )
            return {"completed": False, "pairings": pairings}
        if current_round >= total_rounds:
            finish_tournament(tournament, finished_at=now)
            return {"completed": True, "pairings": []}
        tournament.current_round = current_round + 1
        tournament.save(update_fields=["current_round"])
        pairings = create_round_robin_round(
            tournament, round_number=tournament.current_round
        )
        return {"completed": False, "pairings": pairings}

    if tournament.type == Tournament.TYPE_KNOCKOUT:
        if _round_has_open_games(tournament, current_round):
            return {"completed": False, "pairings": []}
        if not _round_has_any_games(tournament, current_round):
            pairings = create_knockout_round(tournament, round_number=current_round)
            return {"completed": False, "pairings": pairings}
        winners = _knockout_round_winners(tournament, current_round)
        if winners is None:
            return {"completed": False, "pairings": []}
        if len(winners) <= 1:
            finish_tournament(tournament, winners=winners, finished_at=now)
            return {"completed": True, "pairings": []}
        tournament.current_round = current_round + 1
        tournament.save(update_fields=["current_round"])
        pairings = create_knockout_round(
            tournament,
            round_number=tournament.current_round,
            player_ids=winners,
        )
        return {"completed": False, "pairings": pairings}

    return {"completed": False, "pairings": []}


def find_user_open_game(tournament: Tournament, user_id: int) -> Optional[int]:
    tg = (
        TournamentGame.objects.select_related("game")
        .filter(
            tournament=tournament,
            game__status__in=OPEN_GAME_STATUSES,
        )
        .filter(Q(game__white_id=user_id) | Q(game__black_id=user_id))
        .order_by("-created_at")
        .first()
    )
    return tg.game_id if tg else None
