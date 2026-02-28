from __future__ import annotations

import json
import random
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from .models import (
    DigiQuizAnswer,
    DigiQuizParticipation,
    DigiQuizQuestion,
    DigiQuizRatingHistory,
    DigiQuizRound,
    DigiQuizRoundQuestion,
)

User = get_user_model()

IST_TZ = ZoneInfo("Asia/Kolkata")
ROUND_START_IST_TIME = time(hour=23, minute=30)
JOIN_OPEN_DELTA = timedelta(minutes=10)
QUESTION_DURATION_SECONDS = 20
QUESTION_COUNT = 20
WRONG_POINTS = -15
FIRST_OFFICIAL_ROUND_IST = datetime(2026, 3, 1, 23, 30, tzinfo=IST_TZ)


class DigiQuizServiceError(Exception):
    def __init__(self, message: str, *, code: str = "digiquiz_error", status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def _now(now: datetime | None = None) -> datetime:
    value = now or timezone.now()
    if timezone.is_naive(value):
        value = value.replace(tzinfo=dt_timezone.utc)
    return value


def now_ist(now: datetime | None = None) -> datetime:
    return _now(now).astimezone(IST_TZ)


def get_question_bank_path() -> Path:
    configured = getattr(settings, "DIGIQUIZ_QUESTION_BANK_PATH", "")
    if configured:
        return Path(configured)
    return Path(settings.BASE_DIR) / "quiz_10000_questions_pretty.json"


def speed_points_for_latency(latency_ms: int) -> int:
    bucket = max(0, min(19, latency_ms // 1000))
    return 20 - bucket


def _round_start_ist(round_date: date) -> datetime:
    return datetime.combine(round_date, ROUND_START_IST_TIME, tzinfo=IST_TZ)


def _build_round_defaults(round_date: date) -> dict:
    start_ist = _round_start_ist(round_date)
    start_at = start_ist.astimezone(dt_timezone.utc)
    join_open_at = (start_ist - JOIN_OPEN_DELTA).astimezone(dt_timezone.utc)
    end_at = (
        start_ist + timedelta(seconds=QUESTION_COUNT * QUESTION_DURATION_SECONDS)
    ).astimezone(dt_timezone.utc)
    return {
        "join_open_at": join_open_at,
        "start_at": start_at,
        "end_at": end_at,
        "status": DigiQuizRound.STATUS_SCHEDULED,
        "is_official": start_ist >= FIRST_OFFICIAL_ROUND_IST,
        "questions_count": QUESTION_COUNT,
        "question_duration_seconds": QUESTION_DURATION_SECONDS,
    }


def ensure_round_for_date(round_date: date) -> DigiQuizRound:
    defaults = _build_round_defaults(round_date)
    round_obj, _created = DigiQuizRound.objects.get_or_create(
        round_date=round_date,
        defaults=defaults,
    )
    return round_obj


def ensure_today_round(now: datetime | None = None) -> DigiQuizRound:
    return ensure_round_for_date(now_ist(now).date())


def get_phase(round_obj: DigiQuizRound, now: datetime | None = None) -> str:
    current = _now(now)
    if current < round_obj.join_open_at:
        return "upcoming"
    if current < round_obj.start_at:
        return "join_open"
    if current < round_obj.end_at:
        return "live"
    return "results"


def sync_round_status(round_obj: DigiQuizRound, now: datetime | None = None) -> str:
    phase = get_phase(round_obj, now)
    mapped = {
        "upcoming": DigiQuizRound.STATUS_SCHEDULED,
        "join_open": DigiQuizRound.STATUS_JOIN_OPEN,
        "live": DigiQuizRound.STATUS_LIVE,
        "results": DigiQuizRound.STATUS_FINISHED,
    }[phase]
    if round_obj.status != mapped:
        round_obj.status = mapped
        round_obj.save(update_fields=["status"])
    return phase


def _pick_diverse_questions(question_rows: list[dict], count: int) -> list[int]:
    by_tag: dict[str, list[int]] = defaultdict(list)
    for row in question_rows:
        by_tag[row["tag"] or "misc"].append(row["id"])
    for values in by_tag.values():
        random.shuffle(values)
    tags = list(by_tag.keys())
    random.shuffle(tags)

    chosen: list[int] = []
    while len(chosen) < count and tags:
        advanced = False
        for tag in list(tags):
            bucket = by_tag[tag]
            if not bucket:
                tags.remove(tag)
                continue
            chosen.append(bucket.pop())
            advanced = True
            if len(chosen) == count:
                break
        if not advanced:
            break
    if len(chosen) >= count:
        return chosen[:count]

    remainder: list[int] = []
    for values in by_tag.values():
        remainder.extend(values)
    random.shuffle(remainder)
    chosen.extend(remainder[: max(0, count - len(chosen))])
    return chosen[:count]


def import_question_bank(question_bank_path: str | None = None) -> dict:
    path = Path(question_bank_path) if question_bank_path else get_question_bank_path()
    if not path.exists():
        raise DigiQuizServiceError(
            f"Question bank file not found: {path}",
            code="question_bank_missing",
            status_code=500,
        )

    with path.open("r", encoding="utf-8") as fp:
        payload = json.load(fp)

    questions = payload.get("questions", [])
    if not isinstance(questions, list):
        raise DigiQuizServiceError(
            "Invalid question bank format: 'questions' must be a list.",
            code="question_bank_invalid",
            status_code=500,
        )

    source_ids: list[str] = []
    normalized: list[dict] = []
    for idx, item in enumerate(questions, start=1):
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("id") or f"Q{idx:05d}")
        tag = str(item.get("tag") or "misc")
        question = str(item.get("question") or "").strip()
        options = item.get("options") or []
        answer_index = int(item.get("answer_index", -1))
        answer_text = str(item.get("answer") or "")
        if not question or not isinstance(options, list) or len(options) < 2:
            continue
        if answer_index < 0 or answer_index >= len(options):
            continue
        source_ids.append(source_id)
        normalized.append(
            {
                "source_id": source_id,
                "tag": tag,
                "question": question,
                "options": options,
                "answer_index": answer_index,
                "answer_text": answer_text or str(options[answer_index]),
                "is_active": True,
            }
        )

    existing_map = {
        q.source_id: q for q in DigiQuizQuestion.objects.filter(source_id__in=source_ids)
    }
    to_create: list[DigiQuizQuestion] = []
    to_update: list[DigiQuizQuestion] = []
    for row in normalized:
        existing = existing_map.get(row["source_id"])
        if existing is None:
            to_create.append(DigiQuizQuestion(**row))
            continue
        changed = False
        for key in ["tag", "question", "options", "answer_index", "answer_text", "is_active"]:
            if getattr(existing, key) != row[key]:
                setattr(existing, key, row[key])
                changed = True
        if changed:
            to_update.append(existing)

    if to_create:
        DigiQuizQuestion.objects.bulk_create(to_create, batch_size=1000)
    if to_update:
        DigiQuizQuestion.objects.bulk_update(
            to_update,
            ["tag", "question", "options", "answer_index", "answer_text", "is_active"],
            batch_size=1000,
        )

    return {
        "loaded": len(normalized),
        "created": len(to_create),
        "updated": len(to_update),
        "path": str(path),
    }


def ensure_question_bank_loaded() -> None:
    if DigiQuizQuestion.objects.exists():
        return
    import_question_bank()


def ensure_round_questions(round_obj: DigiQuizRound) -> int:
    existing_count = round_obj.round_questions.count()
    if existing_count >= round_obj.questions_count:
        return existing_count
    if existing_count:
        raise DigiQuizServiceError(
            "Round has partial question set. Manual intervention required.",
            code="round_question_partial",
            status_code=500,
        )

    ensure_question_bank_loaded()

    used_ids = DigiQuizRoundQuestion.objects.exclude(round=round_obj).values_list(
        "question_id", flat=True
    )
    available_qs = DigiQuizQuestion.objects.filter(is_active=True).exclude(id__in=used_ids)
    available_rows = list(available_qs.values("id", "tag"))
    if len(available_rows) < round_obj.questions_count:
        raise DigiQuizServiceError(
            "Not enough unseen questions available. Increase question bank size.",
            code="question_bank_exhausted",
            status_code=500,
        )

    chosen_ids = _pick_diverse_questions(available_rows, round_obj.questions_count)
    question_map = {
        item.id: item for item in DigiQuizQuestion.objects.filter(id__in=chosen_ids)
    }
    ordered_questions = [question_map[qid] for qid in chosen_ids if qid in question_map]
    if len(ordered_questions) != round_obj.questions_count:
        raise DigiQuizServiceError(
            "Unable to prepare round questions.",
            code="round_question_generation_failed",
            status_code=500,
        )

    entries: list[DigiQuizRoundQuestion] = []
    for idx, question in enumerate(ordered_questions, start=1):
        starts_at = round_obj.start_at + timedelta(
            seconds=(idx - 1) * round_obj.question_duration_seconds
        )
        ends_at = starts_at + timedelta(seconds=round_obj.question_duration_seconds)
        entries.append(
            DigiQuizRoundQuestion(
                round=round_obj,
                question=question,
                question_no=idx,
                starts_at=starts_at,
                ends_at=ends_at,
            )
        )
    DigiQuizRoundQuestion.objects.bulk_create(entries, batch_size=200)

    metadata = round_obj.metadata or {}
    metadata.update(
        {
            "prepared_at": timezone.now().isoformat(),
            "question_bank_path": str(get_question_bank_path()),
            "unseen_pool_before_pick": len(available_rows),
        }
    )
    round_obj.metadata = metadata
    round_obj.save(update_fields=["metadata"])
    return round_obj.questions_count


def current_question_no(round_obj: DigiQuizRound, now: datetime | None = None) -> int:
    phase = get_phase(round_obj, now)
    if phase in {"upcoming", "join_open"}:
        return 0
    if phase == "results":
        return round_obj.questions_count + 1

    elapsed = max(0, int((_now(now) - round_obj.start_at).total_seconds()))
    index = elapsed // round_obj.question_duration_seconds
    return max(1, min(round_obj.questions_count, index + 1))


def _apply_penalties(
    participation: DigiQuizParticipation,
    round_obj: DigiQuizRound,
    question_numbers: list[int],
    *,
    status: str,
    now: datetime | None = None,
) -> int:
    if not question_numbers:
        return 0
    existing = set(
        DigiQuizAnswer.objects.filter(
            participation=participation,
            question_no__in=question_numbers,
        ).values_list("question_no", flat=True)
    )
    missing = [number for number in sorted(set(question_numbers)) if number not in existing]
    if not missing:
        return 0

    rq_map = {
        item.question_no: item
        for item in DigiQuizRoundQuestion.objects.select_related("question")
        .filter(round=round_obj, question_no__in=missing)
        .all()
    }
    entries: list[DigiQuizAnswer] = []
    for question_no in missing:
        round_question = rq_map.get(question_no)
        if not round_question:
            continue
        entries.append(
            DigiQuizAnswer(
                participation=participation,
                round=round_obj,
                question=round_question.question,
                question_no=question_no,
                selected_index=None,
                is_correct=False,
                latency_ms=round_obj.question_duration_seconds * 1000
                if status == DigiQuizAnswer.STATUS_TIMEOUT
                else 0,
                points=WRONG_POINTS,
                status=status,
            )
        )
    if not entries:
        return 0

    DigiQuizAnswer.objects.bulk_create(entries, batch_size=200)
    delta = len(entries)
    participation.total_points += WRONG_POINTS * delta
    participation.wrong_count += delta
    participation.resolved_count += delta
    if status == DigiQuizAnswer.STATUS_TIMEOUT:
        participation.total_answer_time_ms += (
            round_obj.question_duration_seconds * 1000 * delta
        )
    participation.last_answer_at = _now(now)
    participation.save(
        update_fields=[
            "total_points",
            "wrong_count",
            "resolved_count",
            "total_answer_time_ms",
            "last_answer_at",
        ]
    )
    return delta


def materialize_unanswered_penalties(
    participation: DigiQuizParticipation,
    round_obj: DigiQuizRound | None = None,
    *,
    now: datetime | None = None,
) -> int:
    target_round = round_obj or participation.round
    phase = get_phase(target_round, now)
    if phase in {"upcoming", "join_open"}:
        return 0

    if phase == "results":
        cutoff = target_round.questions_count
    else:
        cutoff = max(0, current_question_no(target_round, now) - 1)
    if cutoff < participation.joined_question_no:
        return 0

    qnos = list(range(participation.joined_question_no, cutoff + 1))
    return _apply_penalties(
        participation,
        target_round,
        qnos,
        status=DigiQuizAnswer.STATUS_TIMEOUT,
        now=now,
    )


def _broadcast(round_id: int, payload: dict) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    try:
        async_to_sync(channel_layer.group_send)(
            f"digiquiz_round_{round_id}",
            {
                "type": "digiquiz.event",
                "payload": payload,
            },
        )
    except Exception:
        return


def _serialize_round(round_obj: DigiQuizRound, now: datetime | None = None) -> dict:
    phase = get_phase(round_obj, now)
    current = _now(now)
    if phase in {"upcoming", "join_open"}:
        countdown = max(0, int((round_obj.start_at - current).total_seconds()))
    elif phase == "live":
        countdown = max(0, int((round_obj.end_at - current).total_seconds()))
    else:
        tomorrow = ensure_round_for_date(now_ist(now).date() + timedelta(days=1))
        countdown = max(0, int((tomorrow.start_at - current).total_seconds()))
    return {
        "id": round_obj.id,
        "round_date": round_obj.round_date.isoformat(),
        "status": round_obj.status,
        "phase": phase,
        "join_open_at": round_obj.join_open_at.isoformat(),
        "start_at": round_obj.start_at.isoformat(),
        "end_at": round_obj.end_at.isoformat(),
        "countdown_seconds": countdown,
        "questions_count": round_obj.questions_count,
        "question_duration_seconds": round_obj.question_duration_seconds,
        "is_official": round_obj.is_official,
        "current_question_no": current_question_no(round_obj, now),
        "finalized_at": round_obj.finalized_at.isoformat() if round_obj.finalized_at else None,
    }


def _ordered_participations(round_obj: DigiQuizRound):
    return (
        DigiQuizParticipation.objects.filter(round=round_obj)
        .select_related("user")
        .order_by("-total_points", "-correct_count", "total_answer_time_ms", "joined_at", "id")
    )


def _ranked_rows(round_obj: DigiQuizRound) -> list[dict]:
    rows: list[dict] = []
    for idx, participation in enumerate(_ordered_participations(round_obj), start=1):
        resolved = max(1, participation.resolved_count)
        accuracy = round((participation.correct_count * 100.0) / resolved, 2)
        rows.append(
            {
                "rank": idx,
                "user_id": participation.user_id,
                "username": participation.user.username or participation.user.email,
                "points": participation.total_points,
                "correct": participation.correct_count,
                "wrong": participation.wrong_count,
                "resolved": participation.resolved_count,
                "progress": participation.resolved_count,
                "total_answer_time_ms": participation.total_answer_time_ms,
                "accuracy": accuracy,
                "joined_question_no": participation.joined_question_no,
            }
        )
    return rows


def get_round_state_payload(user: User | None = None, now: datetime | None = None) -> dict:
    current = _now(now)
    round_obj = ensure_today_round(current)
    phase = sync_round_status(round_obj, current)
    if phase in {"join_open", "live", "results"}:
        ensure_round_questions(round_obj)
    if phase == "results" and not round_obj.finalized_at:
        finalize_round(round_obj, now=current)
        round_obj.refresh_from_db()

    payload = {
        "server_time": current.isoformat(),
        "timezone": "Asia/Kolkata",
        "first_official_round_ist": FIRST_OFFICIAL_ROUND_IST.isoformat(),
        "round": _serialize_round(round_obj, current),
        "join_enabled": phase in {"join_open", "live"},
    }

    if user and getattr(user, "is_authenticated", False):
        participation = DigiQuizParticipation.objects.filter(round=round_obj, user=user).first()
        if participation and phase in {"live", "results"}:
            materialize_unanswered_penalties(participation, round_obj, now=current)
            participation.refresh_from_db()
        ranked = _ranked_rows(round_obj)
        your_row = next((row for row in ranked if row["user_id"] == user.id), None)
        payload["user"] = {
            "joined": bool(participation),
            "participation_id": participation.id if participation else None,
            "points": participation.total_points if participation else 0,
            "rank": your_row["rank"] if your_row else None,
            "resolved": participation.resolved_count if participation else 0,
        }
    return payload


def _enforce_play_window(round_obj: DigiQuizRound, now: datetime | None = None) -> str:
    phase = sync_round_status(round_obj, now)
    if phase == "upcoming":
        raise DigiQuizServiceError(
            "Round has not opened for join yet.",
            code="round_not_open",
            status_code=400,
        )
    if phase == "results":
        raise DigiQuizServiceError(
            "Round already finished.",
            code="round_finished",
            status_code=400,
        )
    return phase


@transaction.atomic
def join_round(
    user: User,
    *,
    round_obj: DigiQuizRound | None = None,
    now: datetime | None = None,
) -> tuple[DigiQuizParticipation, bool, str]:
    current = _now(now)
    target_round = round_obj or ensure_today_round(current)
    phase = _enforce_play_window(target_round, current)
    ensure_round_questions(target_round)

    defaults = {"joined_question_no": 1}
    participation, created = DigiQuizParticipation.objects.select_for_update().get_or_create(
        round=target_round,
        user=user,
        defaults=defaults,
    )

    if created and phase == "live":
        active_question_no = max(1, current_question_no(target_round, current))
        participation.joined_question_no = active_question_no
        participation.save(update_fields=["joined_question_no"])
        if active_question_no > 1:
            _apply_penalties(
                participation,
                target_round,
                list(range(1, active_question_no)),
                status=DigiQuizAnswer.STATUS_MISSED_LATE,
                now=current,
            )
    elif not created and phase == "live":
        materialize_unanswered_penalties(participation, target_round, now=current)

    _broadcast(
        target_round.id,
        {
            "type": "participant_joined",
            "round_id": target_round.id,
            "user_id": user.id,
            "username": user.username or user.email,
            "created": created,
        },
    )
    return participation, created, phase


def _safe_option_index(selected_index: int, question: DigiQuizQuestion) -> None:
    if selected_index < 0 or selected_index >= len(question.options):
        raise DigiQuizServiceError(
            "Selected option index is out of range.",
            code="answer_option_invalid",
            status_code=400,
        )


@transaction.atomic
def submit_answer(
    user: User,
    *,
    question_no: int,
    selected_index: int,
    round_obj: DigiQuizRound | None = None,
    now: datetime | None = None,
) -> tuple[DigiQuizAnswer, DigiQuizParticipation, bool]:
    current = _now(now)
    target_round = round_obj or ensure_today_round(current)
    phase = sync_round_status(target_round, current)
    if phase != "live":
        raise DigiQuizServiceError(
            "Round is not live.",
            code="round_not_live",
            status_code=400,
        )
    ensure_round_questions(target_round)

    try:
        participation = DigiQuizParticipation.objects.select_for_update().get(
            round=target_round,
            user=user,
        )
    except DigiQuizParticipation.DoesNotExist as exc:
        raise DigiQuizServiceError(
            "Join the round first.",
            code="not_joined",
            status_code=400,
        ) from exc

    materialize_unanswered_penalties(participation, target_round, now=current)

    active_no = current_question_no(target_round, current)
    if question_no != active_no:
        raise DigiQuizServiceError(
            "Only the current live question can be answered.",
            code="question_not_active",
            status_code=400,
        )

    existing = DigiQuizAnswer.objects.filter(
        participation=participation,
        question_no=question_no,
    ).first()
    if existing:
        return existing, participation, True

    try:
        round_question = DigiQuizRoundQuestion.objects.select_related("question").get(
            round=target_round,
            question_no=question_no,
        )
    except DigiQuizRoundQuestion.DoesNotExist as exc:
        raise DigiQuizServiceError(
            "Question not configured for this round.",
            code="question_missing",
            status_code=500,
        ) from exc

    if current >= round_question.ends_at:
        materialize_unanswered_penalties(participation, target_round, now=current)
        raise DigiQuizServiceError(
            "Question timed out.",
            code="question_timeout",
            status_code=400,
        )

    _safe_option_index(selected_index, round_question.question)
    latency_ms = max(0, int((current - round_question.starts_at).total_seconds() * 1000))
    latency_ms = min(
        latency_ms,
        max(0, target_round.question_duration_seconds * 1000 - 1),
    )
    is_correct = selected_index == round_question.question.answer_index
    points = speed_points_for_latency(latency_ms) if is_correct else WRONG_POINTS
    status_value = (
        DigiQuizAnswer.STATUS_CORRECT if is_correct else DigiQuizAnswer.STATUS_WRONG
    )

    answer = DigiQuizAnswer.objects.create(
        participation=participation,
        round=target_round,
        question=round_question.question,
        question_no=question_no,
        selected_index=selected_index,
        is_correct=is_correct,
        latency_ms=latency_ms,
        points=points,
        status=status_value,
    )

    participation.total_points += points
    participation.resolved_count += 1
    participation.total_answer_time_ms += latency_ms
    participation.last_answer_at = current
    if is_correct:
        participation.correct_count += 1
    else:
        participation.wrong_count += 1
    participation.save(
        update_fields=[
            "total_points",
            "resolved_count",
            "total_answer_time_ms",
            "last_answer_at",
            "correct_count",
            "wrong_count",
        ]
    )

    _broadcast(
        target_round.id,
        {
            "type": "answer_submitted",
            "round_id": target_round.id,
            "question_no": question_no,
            "user_id": user.id,
            "username": user.username or user.email,
            "points_delta": points,
            "total_points": participation.total_points,
            "correct": is_correct,
        },
    )
    return answer, participation, False


def get_live_question_payload(
    user: User,
    *,
    round_obj: DigiQuizRound | None = None,
    now: datetime | None = None,
) -> dict:
    current = _now(now)
    target_round = round_obj or ensure_today_round(current)
    phase = sync_round_status(target_round, current)
    if phase in {"join_open", "live", "results"}:
        ensure_round_questions(target_round)

    try:
        participation = DigiQuizParticipation.objects.get(round=target_round, user=user)
    except DigiQuizParticipation.DoesNotExist as exc:
        raise DigiQuizServiceError(
            "Join the round to access live questions.",
            code="not_joined",
            status_code=400,
        ) from exc

    if phase in {"live", "results"}:
        materialize_unanswered_penalties(participation, target_round, now=current)
        participation.refresh_from_db()

    if phase == "join_open":
        return {
            "phase": phase,
            "round": _serialize_round(target_round, current),
            "seconds_to_start": max(0, int((target_round.start_at - current).total_seconds())),
        }
    if phase == "results":
        finalize_round(target_round, now=current)
        return {
            "phase": phase,
            "round": _serialize_round(target_round, current),
            "message": "Round finished. Check results leaderboard.",
        }
    if phase == "upcoming":
        raise DigiQuizServiceError(
            "Round not open yet.",
            code="round_not_open",
            status_code=400,
        )

    active_no = current_question_no(target_round, current)
    round_question = DigiQuizRoundQuestion.objects.select_related("question").get(
        round=target_round,
        question_no=active_no,
    )
    answer = DigiQuizAnswer.objects.filter(
        participation=participation,
        question_no=active_no,
    ).first()
    question_payload = {
        "question_no": active_no,
        "question": round_question.question.question,
        "options": round_question.question.options,
        "starts_at": round_question.starts_at.isoformat(),
        "ends_at": round_question.ends_at.isoformat(),
        "seconds_left": max(0, int((round_question.ends_at - current).total_seconds())),
        "answered": bool(answer),
    }
    if answer:
        question_payload.update(
            {
                "selected_index": answer.selected_index,
                "is_correct": answer.is_correct,
                "points": answer.points,
                "correct_index": round_question.question.answer_index,
            }
        )

    return {
        "phase": phase,
        "round": _serialize_round(target_round, current),
        "participation": {
            "id": participation.id,
            "points": participation.total_points,
            "correct": participation.correct_count,
            "wrong": participation.wrong_count,
            "resolved": participation.resolved_count,
            "joined_question_no": participation.joined_question_no,
        },
        "question": question_payload,
    }


def get_live_standings_payload(
    *,
    round_obj: DigiQuizRound | None = None,
    user: User | None = None,
    now: datetime | None = None,
    limit: int = 50,
) -> dict:
    current = _now(now)
    target_round = round_obj or ensure_today_round(current)
    phase = sync_round_status(target_round, current)
    if phase in {"join_open", "live", "results"}:
        ensure_round_questions(target_round)
    if user and getattr(user, "is_authenticated", False):
        participation = DigiQuizParticipation.objects.filter(round=target_round, user=user).first()
        if participation and phase in {"live", "results"}:
            materialize_unanswered_penalties(participation, target_round, now=current)
    rows = _ranked_rows(target_round)
    top_rows = rows[: max(1, min(limit, 200))]
    your_row = None
    if user and getattr(user, "is_authenticated", False):
        your_row = next((row for row in rows if row["user_id"] == user.id), None)
    return {
        "phase": phase,
        "round": _serialize_round(target_round, current),
        "total_participants": len(rows),
        "rows": top_rows,
        "your_row": your_row,
    }


def _latest_finished_round(now: datetime | None = None) -> DigiQuizRound | None:
    current = _now(now)
    return (
        DigiQuizRound.objects.filter(end_at__lte=current)
        .order_by("-round_date", "-id")
        .first()
    )


def _parse_limit(value: int | None, *, default: int = 50, max_value: int = 200) -> int:
    try:
        parsed = int(value if value is not None else default)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(max_value, parsed))


def _parse_page(value: int | None, *, default: int = 1) -> int:
    try:
        parsed = int(value if value is not None else default)
    except (TypeError, ValueError):
        parsed = default
    return max(1, parsed)


def get_results_payload(
    *,
    round_date: date | None = None,
    page: int = 1,
    limit: int = 50,
    user: User | None = None,
    now: datetime | None = None,
) -> dict:
    current = _now(now)
    target_round = (
        DigiQuizRound.objects.filter(round_date=round_date).first()
        if round_date
        else _latest_finished_round(current)
    )
    if not target_round:
        return {
            "round": None,
            "total_participants": 0,
            "total_pages": 0,
            "page": 1,
            "limit": _parse_limit(limit),
            "podium": [],
            "rows": [],
            "your_row": None,
        }

    phase = sync_round_status(target_round, current)
    if phase in {"join_open", "live", "results"}:
        ensure_round_questions(target_round)
    if current >= target_round.end_at and not target_round.finalized_at:
        finalize_round(target_round, now=current)
        target_round.refresh_from_db()

    rows = _ranked_rows(target_round)
    limit_value = _parse_limit(limit)
    page_value = _parse_page(page)
    start = (page_value - 1) * limit_value
    end = start + limit_value
    paged_rows = rows[start:end]
    total_pages = (len(rows) + limit_value - 1) // limit_value if rows else 0
    your_row = None
    if user and getattr(user, "is_authenticated", False):
        your_row = next((row for row in rows if row["user_id"] == user.id), None)

    return {
        "round": _serialize_round(target_round, current),
        "total_participants": len(rows),
        "total_pages": total_pages,
        "page": page_value,
        "limit": limit_value,
        "podium": rows[:3],
        "rows": paged_rows,
        "your_row": your_row,
    }


def get_rating_history_payload(user: User, *, limit: int = 90) -> dict:
    limit_value = _parse_limit(limit, default=90, max_value=365)
    entries = (
        DigiQuizRatingHistory.objects.filter(user=user)
        .select_related("round")
        .order_by("-round__start_at")[:limit_value]
    )
    points = [
        {
            "round_id": entry.round_id,
            "round_date": entry.round.round_date.isoformat(),
            "rating_before": entry.rating_before,
            "delta": entry.round_delta,
            "rating_after": entry.rating_after,
            "created_at": entry.created_at.isoformat(),
        }
        for entry in entries
    ]
    points.reverse()
    return {
        "user_id": user.id,
        "username": user.username or user.email,
        "points": points,
        "current_rating": user.rating_digiquiz,
    }


@transaction.atomic
def finalize_round(round_obj: DigiQuizRound, *, now: datetime | None = None) -> bool:
    current = _now(now)
    if current < round_obj.end_at:
        return False
    if round_obj.finalized_at:
        return False

    sync_round_status(round_obj, current)
    ensure_round_questions(round_obj)

    timeout_now = round_obj.end_at + timedelta(milliseconds=1)
    participations = list(
        DigiQuizParticipation.objects.select_for_update()
        .filter(round=round_obj)
        .select_related("user")
    )
    for participation in participations:
        materialize_unanswered_penalties(participation, round_obj, now=timeout_now)

    participations = list(
        DigiQuizParticipation.objects.select_for_update()
        .filter(round=round_obj)
        .select_related("user")
    )
    for participation in participations:
        if participation.rating_applied:
            continue
        user = User.objects.select_for_update().get(id=participation.user_id)
        before = user.rating_digiquiz
        delta = participation.total_points
        after = before + delta
        user.rating_digiquiz = after
        user.digiquiz_correct += participation.correct_count
        user.digiquiz_wrong += participation.wrong_count
        user.save(
            update_fields=[
                "rating_digiquiz",
                "digiquiz_correct",
                "digiquiz_wrong",
            ]
        )
        DigiQuizRatingHistory.objects.get_or_create(
            user=user,
            round=round_obj,
            defaults={
                "participation": participation,
                "rating_before": before,
                "round_delta": delta,
                "rating_after": after,
            },
        )
        participation.rating_applied = True
        participation.save(update_fields=["rating_applied"])

    round_obj.status = DigiQuizRound.STATUS_FINISHED
    round_obj.finalized_at = current
    round_obj.save(update_fields=["status", "finalized_at"])
    _broadcast(
        round_obj.id,
        {
            "type": "round_finalized",
            "round_id": round_obj.id,
            "round_date": round_obj.round_date.isoformat(),
        },
    )
    return True


def tick_rounds(now: datetime | None = None) -> dict:
    current = _now(now)
    today = now_ist(current).date()
    round_dates = [today - timedelta(days=1), today, today + timedelta(days=1)]
    summary = {
        "checked_round_dates": [value.isoformat() for value in round_dates],
        "prepared": [],
        "finalized": [],
    }
    for round_date in round_dates:
        round_obj = ensure_round_for_date(round_date)
        phase = sync_round_status(round_obj, current)
        if phase in {"join_open", "live", "results"}:
            ensure_round_questions(round_obj)
            summary["prepared"].append(round_obj.round_date.isoformat())
        if phase == "results" and not round_obj.finalized_at:
            if finalize_round(round_obj, now=current):
                summary["finalized"].append(round_obj.round_date.isoformat())
    return summary
