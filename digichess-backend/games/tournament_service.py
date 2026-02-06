import math
import random
from datetime import timedelta

from django.db import transaction
from django.db.models import Max
from django.utils import timezone
import chess

from .models import Game, Tournament, TournamentParticipant, TournamentGame


RATING_FIELD_MAP = {
    Game.TIME_BULLET: "rating_bullet",
    Game.TIME_BLITZ: "rating_blitz",
    Game.TIME_RAPID: "rating_rapid",
    Game.TIME_CLASSICAL: "rating_classical",
}


def list_participants(tournament: Tournament):
    return list(
        tournament.participants.filter(withdrawn_at__isnull=True)
        .select_related("user")
        .order_by("joined_at", "id")
    )


def _get_rating(user, time_control: str) -> int:
    field = RATING_FIELD_MAP.get(time_control, "rating_blitz")
    return getattr(user, field, 800)


def _active_user_ids_in_tournament(tournament: Tournament) -> set[int]:
    active_games = tournament.tournament_games.filter(game__status=Game.STATUS_ACTIVE).select_related("game")
    ids: set[int] = set()
    for tg in active_games:
        ids.add(tg.game.white_id)
        ids.add(tg.game.black_id)
    return ids


def _color_counts(tournament: Tournament) -> dict[int, dict[str, int]]:
    counts: dict[int, dict[str, int]] = {}
    games = tournament.tournament_games.select_related("game")
    for tg in games:
        g = tg.game
        counts.setdefault(g.white_id, {"white": 0, "black": 0})
        counts.setdefault(g.black_id, {"white": 0, "black": 0})
        counts[g.white_id]["white"] += 1
        counts[g.black_id]["black"] += 1
    return counts


def _choose_colors(a_id: int, b_id: int, counts: dict[int, dict[str, int]]):
    a_counts = counts.get(a_id, {"white": 0, "black": 0})
    b_counts = counts.get(b_id, {"white": 0, "black": 0})
    score_a_white = abs((a_counts["white"] + 1) - a_counts["black"]) + abs(
        (b_counts["black"] + 1) - b_counts["white"]
    )
    score_b_white = abs((a_counts["black"] + 1) - a_counts["white"]) + abs(
        (b_counts["white"] + 1) - b_counts["black"]
    )
    return score_a_white <= score_b_white


def create_tournament_game(tournament: Tournament, white, black, round_number: int):
    with transaction.atomic():
        game = Game.objects.create(
            creator=tournament.creator,
            white=white,
            black=black,
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
            rated=tournament.rated,
        )
        game.start()
        TournamentGame.objects.create(tournament=tournament, game=game, round_number=round_number)
    return game


def round_complete(tournament: Tournament, round_number: int) -> bool:
    if round_number <= 0:
        return False
    qs = tournament.tournament_games.filter(round_number=round_number).select_related("game")
    if not qs.exists():
        return False
    return not qs.filter(game__status__in=[Game.STATUS_ACTIVE, Game.STATUS_PENDING]).exists()


def compute_standard_scores(tournament: Tournament) -> dict[int, float]:
    participants = list_participants(tournament)
    scores = {p.user_id: 0.0 for p in participants}
    games = tournament.tournament_games.select_related("game")
    for tg in games:
        g = tg.game
        scores.setdefault(g.white_id, 0.0)
        scores.setdefault(g.black_id, 0.0)
        if g.result == Game.RESULT_WHITE:
            scores[g.white_id] = scores.get(g.white_id, 0.0) + 1
        elif g.result == Game.RESULT_BLACK:
            scores[g.black_id] = scores.get(g.black_id, 0.0) + 1
        elif g.result == Game.RESULT_DRAW:
            scores[g.white_id] = scores.get(g.white_id, 0.0) + 0.5
            scores[g.black_id] = scores.get(g.black_id, 0.0) + 0.5
    return scores


def compute_arena_scores(tournament: Tournament) -> tuple[dict[int, int], dict[int, int]]:
    participants = list_participants(tournament)
    scores = {p.user_id: 0 for p in participants}
    streaks = {p.user_id: 0 for p in participants}
    games = (
        tournament.tournament_games.select_related("game")
        .filter(game__status=Game.STATUS_FINISHED)
        .order_by("game__finished_at", "game__created_at", "id")
    )
    for tg in games:
        g = tg.game
        scores.setdefault(g.white_id, 0)
        scores.setdefault(g.black_id, 0)
        streaks.setdefault(g.white_id, 0)
        streaks.setdefault(g.black_id, 0)
        if g.result == Game.RESULT_WHITE:
            streaks[g.white_id] = streaks.get(g.white_id, 0) + 1
            streaks[g.black_id] = 0
            points = 4 if streaks[g.white_id] >= 2 else 2
            scores[g.white_id] = scores.get(g.white_id, 0) + points
        elif g.result == Game.RESULT_BLACK:
            streaks[g.black_id] = streaks.get(g.black_id, 0) + 1
            streaks[g.white_id] = 0
            points = 4 if streaks[g.black_id] >= 2 else 2
            scores[g.black_id] = scores.get(g.black_id, 0) + points
        elif g.result == Game.RESULT_DRAW:
            streaks[g.white_id] = 0
            streaks[g.black_id] = 0
            scores[g.white_id] = scores.get(g.white_id, 0) + 1
            scores[g.black_id] = scores.get(g.black_id, 0) + 1
    return scores, streaks


def compute_standings(tournament: Tournament):
    participants = list_participants(tournament)
    users_by_id = {p.user_id: p.user for p in participants}
    games = tournament.tournament_games.select_related("game", "game__white", "game__black")
    for tg in games:
        g = tg.game
        if g.white_id not in users_by_id and g.white:
            users_by_id[g.white_id] = g.white
        if g.black_id not in users_by_id and g.black:
            users_by_id[g.black_id] = g.black
    if tournament.type == Tournament.TYPE_ARENA:
        scores, streaks = compute_arena_scores(tournament)
        sort_ids = sorted(scores.keys(), key=lambda x: (-scores.get(x, 0), x))
        return [
            {
                "user_id": uid,
                "username": users_by_id[uid].username,
                "country": getattr(users_by_id[uid], "country", None),
                "score": scores.get(uid, 0),
                "streak": streaks.get(uid, 0),
            }
            for uid in sort_ids
            if uid in users_by_id
        ]

    scores = compute_standard_scores(tournament)
    opponents: dict[int, list[int]] = {p.user_id: [] for p in participants}
    for tg in games:
        g = tg.game
        opponents.setdefault(g.white_id, [])
        opponents.setdefault(g.black_id, [])
        if g.result == Game.RESULT_WHITE:
            opponents[g.white_id].append(g.black_id)
            opponents[g.black_id].append(g.white_id)
        elif g.result == Game.RESULT_BLACK:
            opponents[g.white_id].append(g.black_id)
            opponents[g.black_id].append(g.white_id)
        elif g.result == Game.RESULT_DRAW:
            opponents[g.white_id].append(g.black_id)
            opponents[g.black_id].append(g.white_id)

    buchholz = {}
    median_buchholz = {}
    for uid, opps in opponents.items():
        opp_score = sum(scores.get(oid, 0) for oid in opps)
        buchholz[uid] = opp_score
        if len(opps) < 3:
            median_buchholz[uid] = opp_score
        else:
            opp_scores = sorted([scores.get(oid, 0) for oid in opps])
            trimmed = opp_scores[1:-1]
            median_buchholz[uid] = sum(trimmed)

    sort_ids = sorted(
        scores.keys(),
        key=lambda x: (
            -scores.get(x, 0),
            -buchholz.get(x, 0),
            -median_buchholz.get(x, 0),
            x,
        ),
    )
    result = []
    for uid in sort_ids:
        if uid not in users_by_id:
            continue
        row = {
            "user_id": uid,
            "username": users_by_id[uid].username,
            "country": getattr(users_by_id[uid], "country", None),
            "score": scores.get(uid, 0),
        }
        if tournament.type == Tournament.TYPE_SWISS:
            row["buchholz"] = buchholz.get(uid, 0)
            row["median_buchholz"] = median_buchholz.get(uid, 0)
        result.append(row)
    return result


def start_tournament(tournament: Tournament, started_at=None):
    participants = list_participants(tournament)
    count = len(participants)
    if count < 2:
        raise ValueError("Not enough participants.")

    if tournament.type == Tournament.TYPE_KNOCKOUT:
        power = 2 ** int(math.floor(math.log(count, 2)))
        to_drop = count - power
        if to_drop > 0:
            drop_ids = [p.id for p in participants[-to_drop:]]
            TournamentParticipant.objects.filter(id__in=drop_ids).delete()
            participants = list_participants(tournament)
    elif tournament.type == Tournament.TYPE_ARENA and count < 2:
        raise ValueError("Not enough participants for arena.")
    elif tournament.type == Tournament.TYPE_SWISS and count < 2:
        raise ValueError("Not enough participants for swiss.")

    tournament.status = Tournament.STATUS_ACTIVE
    tournament.started_at = started_at or timezone.now()
    if tournament.type in {Tournament.TYPE_SWISS, Tournament.TYPE_ROUND_ROBIN, Tournament.TYPE_KNOCKOUT}:
        tournament.current_round = 1
    if tournament.type == Tournament.TYPE_ARENA and tournament.arena_duration_minutes > 0:
        tournament.finished_at = tournament.started_at + timedelta(minutes=tournament.arena_duration_minutes)
    tournament.save(update_fields=["status", "started_at", "finished_at", "current_round"])

    if tournament.type == Tournament.TYPE_KNOCKOUT:
        create_knockout_round(tournament, 1)
    elif tournament.type == Tournament.TYPE_SWISS:
        create_swiss_round(tournament, 1)
    elif tournament.type == Tournament.TYPE_ROUND_ROBIN:
        create_round_robin_round(tournament, 1)
    elif tournament.type == Tournament.TYPE_ARENA:
        pair_arena_games(tournament)
    return tournament


def finish_tournament(tournament: Tournament, finished_at=None, winners=None):
    if winners is None:
        if tournament.type == Tournament.TYPE_KNOCKOUT:
            max_round = tournament.tournament_games.aggregate(max_round=Max("round_number")).get("max_round") or 0
            final_games = tournament.tournament_games.filter(round_number=max_round).select_related("game")
            if max_round and final_games.count() == 1:
                g = final_games.first().game
                if g.result == Game.RESULT_WHITE:
                    winners = [g.white.username, g.black.username]
                elif g.result == Game.RESULT_BLACK:
                    winners = [g.black.username, g.white.username]
                elif g.result == Game.RESULT_DRAW:
                    white_rating = _get_rating(g.white, tournament.time_control)
                    black_rating = _get_rating(g.black, tournament.time_control)
                    if white_rating >= black_rating:
                        winners = [g.white.username, g.black.username]
                    else:
                        winners = [g.black.username, g.white.username]
        if winners is None:
            standings = compute_standings(tournament)
            winners = [row["username"] for row in standings[:3]]
    tournament.winners = winners
    tournament.status = Tournament.STATUS_COMPLETED
    tournament.finished_at = finished_at or timezone.now()
    tournament.save(update_fields=["winners", "status", "finished_at"])
    return tournament


def create_swiss_round(tournament: Tournament, round_number: int):
    if tournament.tournament_games.filter(round_number=round_number).exists():
        return []
    participants = list_participants(tournament)
    if len(participants) < 2:
        return []
    scores = compute_standard_scores(tournament)
    opponents: dict[int, set[int]] = {p.user_id: set() for p in participants}
    games = tournament.tournament_games.select_related("game")
    for tg in games:
        g = tg.game
        opponents[g.white_id].add(g.black_id)
        opponents[g.black_id].add(g.white_id)
    color_counts = _color_counts(tournament)
    ordered = sorted(participants, key=lambda p: (-scores.get(p.user_id, 0), p.joined_at, p.user_id))
    used: set[int] = set()
    pairings = []
    for p in ordered:
        if p.user_id in used:
            continue
        opponent = None
        for cand in ordered:
            if cand.user_id in used or cand.user_id == p.user_id:
                continue
            if cand.user_id not in opponents[p.user_id]:
                opponent = cand
                break
        if opponent is None:
            for cand in ordered:
                if cand.user_id in used or cand.user_id == p.user_id:
                    continue
                opponent = cand
                break
        if opponent is None:
            used.add(p.user_id)
            continue
        used.add(p.user_id)
        used.add(opponent.user_id)
        a_white = _choose_colors(p.user_id, opponent.user_id, color_counts)
        white = p.user if a_white else opponent.user
        black = opponent.user if a_white else p.user
        color_counts.setdefault(white.id, {"white": 0, "black": 0})
        color_counts.setdefault(black.id, {"white": 0, "black": 0})
        color_counts[white.id]["white"] += 1
        color_counts[black.id]["black"] += 1
        pairings.append((white, black))
    created = []
    for white, black in pairings:
        created.append(create_tournament_game(tournament, white, black, round_number))
    return created


def _round_robin_rounds(users: list):
    players = list(users)
    if len(players) < 2:
        return []
    if len(players) % 2 == 1:
        players.append(None)
    n = len(players)
    rounds = n - 1
    rotation = players[1:]
    output = []
    for r in range(rounds):
        left = [players[0]] + rotation[: (n // 2 - 1)]
        right = rotation[(n // 2 - 1) :][::-1]
        pairs = []
        for i in range(n // 2):
            a = left[i]
            b = right[i]
            if a is None or b is None:
                continue
            if r % 2 == 0:
                pairs.append((a, b))
            else:
                pairs.append((b, a))
        output.append(pairs)
        rotation = rotation[1:] + rotation[:1]
    return output


def create_round_robin_round(tournament: Tournament, round_number: int):
    if tournament.tournament_games.filter(round_number=round_number).exists():
        return []
    participants = list_participants(tournament)
    users = [p.user for p in participants]
    rounds = _round_robin_rounds(users)
    if round_number < 1 or round_number > len(rounds):
        return []
    created = []
    for white, black in rounds[round_number - 1]:
        created.append(create_tournament_game(tournament, white, black, round_number))
    return created


def create_knockout_round(tournament: Tournament, round_number: int, winners=None):
    if tournament.tournament_games.filter(round_number=round_number).exists():
        return []
    participants = list_participants(tournament)
    if round_number == 1:
        users = [p.user for p in participants]
    else:
        users = winners or []
    if len(users) < 2:
        return []
    pairings = []
    for i in range(0, len(users), 2):
        if i + 1 >= len(users):
            break
        a = users[i]
        b = users[i + 1]
        pairings.append((a, b))
    created = []
    for white, black in pairings:
        created.append(create_tournament_game(tournament, white, black, round_number))
    return created


def get_knockout_winners(tournament: Tournament, round_number: int):
    games = tournament.tournament_games.filter(round_number=round_number).select_related("game")
    winners = []
    for tg in games:
        g = tg.game
        if g.result == Game.RESULT_WHITE:
            winners.append(g.white)
        elif g.result == Game.RESULT_BLACK:
            winners.append(g.black)
        elif g.result == Game.RESULT_DRAW:
            white_rating = _get_rating(g.white, tournament.time_control)
            black_rating = _get_rating(g.black, tournament.time_control)
            if white_rating >= black_rating:
                winners.append(g.white)
            else:
                winners.append(g.black)
    return winners


def pair_arena_games(tournament: Tournament):
    if tournament.finished_at and timezone.now() >= tournament.finished_at:
        return []
    participants = list_participants(tournament)
    if len(participants) < 2:
        return []
    active_ids = _active_user_ids_in_tournament(tournament)
    available = [p.user for p in participants if p.user_id not in active_ids]
    random.shuffle(available)
    created = []
    while len(available) >= 2:
        white = available.pop(0)
        black = available.pop(0)
        created.append(create_tournament_game(tournament, white, black, tournament.current_round or 1))
    return created
