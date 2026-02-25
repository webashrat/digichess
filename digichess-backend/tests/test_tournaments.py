import pytest
from datetime import timedelta
from django.utils import timezone

from games.models import Game, Tournament, TournamentGame, TournamentParticipant
from games.tasks import (
    check_tournament_finish,
    check_tournament_start,
    pair_arena_idle_players,
    swiss_pairings,
)


@pytest.mark.django_db
def test_tournament_create_register_start(auth_client, create_user):
    creator = create_user(email="creator@example.com", username="creator")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena Test",
            "description": "Test arena",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    assert create_resp.status_code == 201
    tournament_id = create_resp.data["id"]

    user_a = create_user(email="ta@example.com", username="ta")
    user_b = create_user(email="tb@example.com", username="tb")
    auth_client(user_a)[0].post(f"/api/games/tournaments/{tournament_id}/register/", {}, format="json")
    auth_client(user_b)[0].post(f"/api/games/tournaments/{tournament_id}/register/", {}, format="json")

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament_id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    assert start_resp.data["status"] == Tournament.STATUS_ACTIVE


@pytest.mark.django_db
def test_tournament_start_requires_creator(auth_client, create_user):
    creator = create_user(email="creator2@example.com", username="creator2")
    other = create_user(email="other@example.com", username="other")
    creator_client, _ = auth_client(creator)
    other_client, _ = auth_client(other)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Swiss Test",
            "description": "Test swiss",
            "type": Tournament.TYPE_SWISS,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "swiss_rounds": 3,
            "rated": True,
        },
        format="json",
    )
    tournament_id = create_resp.data["id"]

    start_resp = other_client.post(f"/api/games/tournaments/{tournament_id}/start/", {}, format="json")
    assert start_resp.status_code == 403


@pytest.mark.django_db
def test_tournament_register_closed_when_started(auth_client, create_user):
    creator = create_user(email="creator3@example.com", username="creator3")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Knockout Test",
            "description": "Test knockout",
            "type": Tournament.TYPE_KNOCKOUT,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament_id = create_resp.data["id"]
    tournament = Tournament.objects.get(id=tournament_id)
    tournament.status = Tournament.STATUS_ACTIVE
    tournament.save(update_fields=["status"])

    user = create_user(email="late@example.com", username="late")
    late_client, _ = auth_client(user)
    resp = late_client.post(f"/api/games/tournaments/{tournament_id}/register/", {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_tournament_late_registration_arena_swiss(auth_client, create_user):
    creator = create_user(email="creator4@example.com", username="creator4")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    arena_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena Late",
            "description": "Late arena",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    arena_id = arena_resp.data["id"]
    arena = Tournament.objects.get(id=arena_id)
    arena.status = Tournament.STATUS_ACTIVE
    arena.save(update_fields=["status"])

    late_user = create_user(email="latearena@example.com", username="latearena")
    late_client, _ = auth_client(late_user)
    resp = late_client.post(f"/api/games/tournaments/{arena_id}/register/", {}, format="json")
    assert resp.status_code == 200

    swiss_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Swiss Late",
            "description": "Late swiss",
            "type": Tournament.TYPE_SWISS,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "swiss_rounds": 3,
            "rated": True,
        },
        format="json",
    )
    swiss_id = swiss_resp.data["id"]
    swiss = Tournament.objects.get(id=swiss_id)
    swiss.status = Tournament.STATUS_ACTIVE
    swiss.save(update_fields=["status"])

    late_user2 = create_user(email="lateswiss@example.com", username="lateswiss")
    late_client2, _ = auth_client(late_user2)
    resp2 = late_client2.post(f"/api/games/tournaments/{swiss_id}/register/", {}, format="json")
    assert resp2.status_code == 200


@pytest.mark.django_db
def test_tournament_standings_and_pairings(auth_client, create_user):
    creator = create_user(email="creator5@example.com", username="creator5")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    arena_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena Standings",
            "description": "Arena standings",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    arena_id = arena_resp.data["id"]
    arena = Tournament.objects.get(id=arena_id)

    user_a = create_user(email="arena1@example.com", username="arena1")
    user_b = create_user(email="arena2@example.com", username="arena2")
    user_c = create_user(email="arena3@example.com", username="arena3")

    TournamentParticipant.objects.create(tournament=arena, user=user_a)
    TournamentParticipant.objects.create(tournament=arena, user=user_b)
    TournamentParticipant.objects.create(tournament=arena, user=user_c)

    game1 = Game.objects.create(
        creator=creator,
        white=user_a,
        black=user_b,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_WHITE,
    )
    game2 = Game.objects.create(
        creator=creator,
        white=user_b,
        black=user_c,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_WHITE,
    )
    game3 = Game.objects.create(
        creator=creator,
        white=user_a,
        black=user_c,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_DRAW,
    )
    TournamentGame.objects.create(tournament=arena, game=game1, round_number=1)
    TournamentGame.objects.create(tournament=arena, game=game2, round_number=1)
    TournamentGame.objects.create(tournament=arena, game=game3, round_number=1)

    standings = creator_client.get(f"/api/games/tournaments/{arena_id}/standings/")
    assert standings.status_code == 200
    names = [row["username"] for row in standings.data["standings"]]
    assert names[0] == user_a.username
    assert names[1] == user_b.username

    arena.status = Tournament.STATUS_ACTIVE
    arena.current_round = 1
    arena.started_at = timezone.now()
    arena.save(update_fields=["status", "current_round", "started_at"])

    pairings_resp = creator_client.post(f"/api/games/tournaments/{arena_id}/pairings/", {}, format="json")
    assert pairings_resp.status_code == 201
    assert len(pairings_resp.data["pairings"]) >= 1


@pytest.mark.django_db
def test_swiss_standings(auth_client, create_user):
    creator = create_user(email="creator6@example.com", username="creator6")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    swiss_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Swiss Standings",
            "description": "Swiss standings",
            "type": Tournament.TYPE_SWISS,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "swiss_rounds": 2,
            "rated": True,
        },
        format="json",
    )
    swiss_id = swiss_resp.data["id"]
    swiss = Tournament.objects.get(id=swiss_id)

    user_a = create_user(email="swiss1@example.com", username="swiss1")
    user_b = create_user(email="swiss2@example.com", username="swiss2")
    TournamentParticipant.objects.create(tournament=swiss, user=user_a)
    TournamentParticipant.objects.create(tournament=swiss, user=user_b)

    game = Game.objects.create(
        creator=creator,
        white=user_a,
        black=user_b,
        status=Game.STATUS_FINISHED,
        result=Game.RESULT_WHITE,
    )
    TournamentGame.objects.create(tournament=swiss, game=game, round_number=1)

    standings = creator_client.get(f"/api/games/tournaments/{swiss_id}/standings/")
    assert standings.status_code == 200
    assert standings.data["standings"][0]["username"] == user_a.username


@pytest.mark.django_db
def test_tournament_unregister_and_my_game(auth_client, create_user):
    creator = create_user(email="creator7@example.com", username="creator7")
    creator_client, _ = auth_client(creator)
    player = create_user(email="player@example.com", username="player")
    player_client, _ = auth_client(player)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena my-game",
            "description": "my game test",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    tournament_id = create_resp.data["id"]
    tournament = Tournament.objects.get(id=tournament_id)

    TournamentParticipant.objects.create(tournament=tournament, user=player)
    tournament.status = Tournament.STATUS_ACTIVE
    tournament.current_round = 1
    tournament.started_at = timezone.now()
    tournament.save(update_fields=["status", "current_round", "started_at"])

    opponent = create_user(email="opponent@example.com", username="opponent")
    game = Game.objects.create(
        creator=creator,
        white=player,
        black=opponent,
        status=Game.STATUS_PENDING,
    )
    TournamentGame.objects.create(tournament=tournament, game=game, round_number=1)

    my_game_resp = player_client.get(f"/api/games/tournaments/{tournament_id}/my-game/")
    assert my_game_resp.status_code == 200
    assert my_game_resp.data["is_registered"] is True
    assert my_game_resp.data["game_id"] == game.id

    unregister_resp = player_client.post(f"/api/games/tournaments/{tournament_id}/unregister/", {}, format="json")
    assert unregister_resp.status_code == 200

    my_game_resp_after = player_client.get(f"/api/games/tournaments/{tournament_id}/my-game/")
    assert my_game_resp_after.status_code == 200
    assert my_game_resp_after.data["is_registered"] is False
    assert my_game_resp_after.data["game_id"] is None


@pytest.mark.django_db
def test_arena_uses_lichess_scoring_and_streak_bonus(auth_client, create_user):
    creator = create_user(email="creator8@example.com", username="creator8")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena streak",
            "description": "streak test",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    tournament_id = create_resp.data["id"]
    tournament = Tournament.objects.get(id=tournament_id)

    user_a = create_user(email="streaka@example.com", username="streaka")
    user_b = create_user(email="streakb@example.com", username="streakb")
    TournamentParticipant.objects.create(tournament=tournament, user=user_a)
    TournamentParticipant.objects.create(tournament=tournament, user=user_b)

    for round_no in (1, 2, 3):
        game = Game.objects.create(
            creator=creator,
            white=user_a,
            black=user_b,
            status=Game.STATUS_FINISHED,
            result=Game.RESULT_WHITE,
        )
        TournamentGame.objects.create(tournament=tournament, game=game, round_number=round_no)

    standings_resp = creator_client.get(f"/api/games/tournaments/{tournament_id}/standings/")
    assert standings_resp.status_code == 200
    first = standings_resp.data["standings"][0]
    assert first["username"] == user_a.username
    assert first["score"] == 8
    assert first["streak"] == 3


@pytest.mark.django_db
def test_swiss_pairings_task_generates_games(auth_client, create_user):
    creator = create_user(email="creator9@example.com", username="creator9")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Swiss task",
            "description": "swiss task",
            "type": Tournament.TYPE_SWISS,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "swiss_rounds": 2,
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    users = [
        create_user(email="swissa@example.com", username="swissa"),
        create_user(email="swissb@example.com", username="swissb"),
        create_user(email="swissc@example.com", username="swissc"),
        create_user(email="swissd@example.com", username="swissd"),
    ]
    for user in users:
        TournamentParticipant.objects.create(tournament=tournament, user=user)
    tournament.status = Tournament.STATUS_ACTIVE
    tournament.current_round = 1
    tournament.started_at = timezone.now()
    tournament.save(update_fields=["status", "current_round", "started_at"])

    created = swiss_pairings(tournament.id)
    assert len(created) == 2
    assert TournamentGame.objects.filter(tournament=tournament, round_number=1).count() == 2


@pytest.mark.django_db
def test_auto_start_and_finish_tasks(auth_client, create_user):
    creator = create_user(email="creator10@example.com", username="creator10")
    start_at = timezone.now() - timedelta(minutes=1)
    tournament = Tournament.objects.create(
        name="RR auto",
        description="auto lifecycle",
        creator=creator,
        type=Tournament.TYPE_ROUND_ROBIN,
        time_control=Game.TIME_BLITZ,
        initial_time_seconds=300,
        increment_seconds=0,
        start_at=start_at,
        rated=True,
    )
    user_a = create_user(email="rra@example.com", username="rra")
    user_b = create_user(email="rrb@example.com", username="rrb")
    TournamentParticipant.objects.create(tournament=tournament, user=user_a)
    TournamentParticipant.objects.create(tournament=tournament, user=user_b)

    start_result = check_tournament_start()
    assert tournament.id in start_result["started"]

    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_ACTIVE
    first_round_game = TournamentGame.objects.filter(tournament=tournament, round_number=1).first()
    assert first_round_game is not None

    first_round_game.game.status = Game.STATUS_FINISHED
    first_round_game.game.result = Game.RESULT_WHITE
    first_round_game.game.finished_at = timezone.now()
    first_round_game.game.save(update_fields=["status", "result", "finished_at"])

    finish_result = check_tournament_finish()
    assert tournament.id in finish_result["completed"]
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_COMPLETED


@pytest.mark.django_db
def test_private_tournament_requires_password(auth_client, create_user):
    creator = create_user(email="creator11@example.com", username="creator11")
    creator_client, _ = auth_client(creator)
    participant = create_user(email="privatep@example.com", username="privatep")
    participant_client, _ = auth_client(participant)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Private Arena",
            "description": "private",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 15,
            "rated": True,
            "password": "letmein",
        },
        format="json",
    )
    tournament_id = create_resp.data["id"]

    resp_no_password = participant_client.post(f"/api/games/tournaments/{tournament_id}/register/", {}, format="json")
    assert resp_no_password.status_code == 400

    resp_wrong_password = participant_client.post(
        f"/api/games/tournaments/{tournament_id}/register/",
        {"password": "wrong"},
        format="json",
    )
    assert resp_wrong_password.status_code == 400

    resp_ok = participant_client.post(
        f"/api/games/tournaments/{tournament_id}/register/",
        {"password": "letmein"},
        format="json",
    )
    assert resp_ok.status_code == 200


@pytest.mark.django_db
def test_registration_closed_when_start_time_passed(auth_client, create_user):
    creator = create_user(email="creator12@example.com", username="creator12")
    creator_client, _ = auth_client(creator)
    late_user = create_user(email="late2@example.com", username="late2")
    late_client, _ = auth_client(late_user)
    start_at = timezone.now() + timedelta(minutes=10)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Time Gate",
            "description": "start gate",
            "type": Tournament.TYPE_KNOCKOUT,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    tournament.start_at = timezone.now() - timedelta(minutes=1)
    tournament.save(update_fields=["start_at"])

    resp = late_client.post(f"/api/games/tournaments/{tournament.id}/register/", {}, format="json")
    assert resp.status_code == 400


@pytest.mark.django_db
def test_start_round_robin_creates_first_round_games(auth_client, create_user):
    creator = create_user(email="creator13@example.com", username="creator13")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "RR Start",
            "description": "rr start",
            "type": Tournament.TYPE_ROUND_ROBIN,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    players = [
        create_user(email="rrs1@example.com", username="rrs1"),
        create_user(email="rrs2@example.com", username="rrs2"),
        create_user(email="rrs3@example.com", username="rrs3"),
        create_user(email="rrs4@example.com", username="rrs4"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_ACTIVE
    assert tournament.current_round == 1
    assert TournamentGame.objects.filter(tournament=tournament, round_number=1).count() == 2


@pytest.mark.django_db
def test_start_knockout_trims_to_power_of_two_and_creates_round(auth_client, create_user):
    creator = create_user(email="creator14@example.com", username="creator14")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "KO Trim",
            "description": "ko trim",
            "type": Tournament.TYPE_KNOCKOUT,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    players = [
        create_user(email="kot1@example.com", username="kot1"),
        create_user(email="kot2@example.com", username="kot2"),
        create_user(email="kot3@example.com", username="kot3"),
        create_user(email="kot4@example.com", username="kot4"),
        create_user(email="kot5@example.com", username="kot5"),
        create_user(email="kot6@example.com", username="kot6"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    tournament.refresh_from_db()
    assert tournament.participants.count() == 4
    assert tournament.current_round == 1
    assert TournamentGame.objects.filter(tournament=tournament, round_number=1).count() == 2


@pytest.mark.django_db
def test_check_tournament_finish_progresses_swiss_rounds_and_completes(auth_client, create_user):
    creator = create_user(email="creator15@example.com", username="creator15")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Swiss Lifecycle",
            "description": "swiss lifecycle",
            "type": Tournament.TYPE_SWISS,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "swiss_rounds": 2,
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    players = [
        create_user(email="swl1@example.com", username="swl1"),
        create_user(email="swl2@example.com", username="swl2"),
        create_user(email="swl3@example.com", username="swl3"),
        create_user(email="swl4@example.com", username="swl4"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    round1 = list(TournamentGame.objects.filter(tournament=tournament, round_number=1).select_related("game"))
    assert len(round1) == 2
    for tg in round1:
        tg.game.status = Game.STATUS_FINISHED
        tg.game.result = Game.RESULT_WHITE
        tg.game.finished_at = timezone.now()
        tg.game.save(update_fields=["status", "result", "finished_at"])

    check_tournament_finish()
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_ACTIVE
    assert tournament.current_round == 2
    round2 = list(TournamentGame.objects.filter(tournament=tournament, round_number=2).select_related("game"))
    assert len(round2) == 2

    for tg in round2:
        tg.game.status = Game.STATUS_FINISHED
        tg.game.result = Game.RESULT_BLACK
        tg.game.finished_at = timezone.now()
        tg.game.save(update_fields=["status", "result", "finished_at"])

    finish_result = check_tournament_finish()
    assert tournament.id in finish_result["completed"]
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_COMPLETED
    assert len(tournament.winners) >= 1


@pytest.mark.django_db
def test_check_tournament_finish_progresses_round_robin_and_completes(auth_client, create_user):
    creator = create_user(email="creator16@example.com", username="creator16")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "RR Lifecycle",
            "description": "rr lifecycle",
            "type": Tournament.TYPE_ROUND_ROBIN,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    players = [
        create_user(email="rrl1@example.com", username="rrl1"),
        create_user(email="rrl2@example.com", username="rrl2"),
        create_user(email="rrl3@example.com", username="rrl3"),
        create_user(email="rrl4@example.com", username="rrl4"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200

    for round_no in (1, 2, 3):
        current_round_games = list(
            TournamentGame.objects.filter(tournament=tournament, round_number=round_no).select_related("game")
        )
        assert len(current_round_games) == 2
        for tg in current_round_games:
            tg.game.status = Game.STATUS_FINISHED
            tg.game.result = Game.RESULT_WHITE
            tg.game.finished_at = timezone.now()
            tg.game.save(update_fields=["status", "result", "finished_at"])
        check_tournament_finish()
        tournament.refresh_from_db()

    assert tournament.status == Tournament.STATUS_COMPLETED


@pytest.mark.django_db
def test_check_tournament_finish_progresses_knockout_and_sets_winner(auth_client, create_user):
    creator = create_user(email="creator17@example.com", username="creator17")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "KO Lifecycle",
            "description": "ko lifecycle",
            "type": Tournament.TYPE_KNOCKOUT,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    players = [
        create_user(email="kol1@example.com", username="kol1"),
        create_user(email="kol2@example.com", username="kol2"),
        create_user(email="kol3@example.com", username="kol3"),
        create_user(email="kol4@example.com", username="kol4"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    round1 = list(TournamentGame.objects.filter(tournament=tournament, round_number=1).select_related("game"))
    assert len(round1) == 2
    winners = []
    for tg in round1:
        tg.game.status = Game.STATUS_FINISHED
        tg.game.result = Game.RESULT_WHITE
        tg.game.finished_at = timezone.now()
        tg.game.save(update_fields=["status", "result", "finished_at"])
        winners.append(tg.game.white.username)

    check_tournament_finish()
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_ACTIVE
    assert tournament.current_round == 2
    final_games = list(TournamentGame.objects.filter(tournament=tournament, round_number=2).select_related("game"))
    assert len(final_games) == 1

    final = final_games[0].game
    final.status = Game.STATUS_FINISHED
    final.result = Game.RESULT_WHITE
    final.finished_at = timezone.now()
    final.save(update_fields=["status", "result", "finished_at"])

    finish_result = check_tournament_finish()
    assert tournament.id in finish_result["completed"]
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_COMPLETED
    assert tournament.winners[0] in winners


@pytest.mark.django_db
def test_check_tournament_start_cancels_invalid_tournaments(auth_client, create_user):
    creator = create_user(email="creator18@example.com", username="creator18")
    tournament = Tournament.objects.create(
        name="KO invalid",
        description="invalid auto start",
        creator=creator,
        type=Tournament.TYPE_KNOCKOUT,
        time_control=Game.TIME_BLITZ,
        initial_time_seconds=300,
        increment_seconds=0,
        start_at=timezone.now() - timedelta(minutes=1),
        rated=True,
    )
    lone_player = create_user(email="lone@example.com", username="lone")
    TournamentParticipant.objects.create(tournament=tournament, user=lone_player)

    start_result = check_tournament_start()
    assert tournament.id in start_result["cancelled"]
    tournament.refresh_from_db()
    assert tournament.status == Tournament.STATUS_COMPLETED


@pytest.mark.django_db
def test_pair_arena_idle_players_creates_new_games_after_previous_finish(auth_client, create_user):
    creator = create_user(email="creator19@example.com", username="creator19")
    creator_client, _ = auth_client(creator)
    start_at = timezone.now() + timedelta(hours=1)

    create_resp = creator_client.post(
        "/api/games/tournaments/",
        {
            "name": "Arena Pair Loop",
            "description": "arena pair loop",
            "type": Tournament.TYPE_ARENA,
            "time_control": "blitz",
            "initial_time_seconds": 300,
            "increment_seconds": 0,
            "start_at": start_at.isoformat(),
            "arena_duration_minutes": 30,
            "rated": True,
        },
        format="json",
    )
    tournament = Tournament.objects.get(id=create_resp.data["id"])
    user_a = create_user(email="apl1@example.com", username="apl1")
    user_b = create_user(email="apl2@example.com", username="apl2")
    TournamentParticipant.objects.create(tournament=tournament, user=user_a)
    TournamentParticipant.objects.create(tournament=tournament, user=user_b)

    start_resp = creator_client.post(f"/api/games/tournaments/{tournament.id}/start/", {}, format="json")
    assert start_resp.status_code == 200
    first_games = list(TournamentGame.objects.filter(tournament=tournament).select_related("game"))
    assert len(first_games) == 1

    no_new = pair_arena_idle_players()
    assert tournament.id not in no_new

    first_game = first_games[0].game
    first_game.status = Game.STATUS_FINISHED
    first_game.result = Game.RESULT_WHITE
    first_game.finished_at = timezone.now()
    first_game.save(update_fields=["status", "result", "finished_at"])

    created = pair_arena_idle_players()
    assert tournament.id in created
    assert len(created[tournament.id]) == 1
    assert TournamentGame.objects.filter(tournament=tournament).count() == 2


@pytest.mark.django_db
def test_swiss_pairings_avoid_repeat_opponents_when_possible(auth_client, create_user):
    creator = create_user(email="creator20@example.com", username="creator20")
    start_at = timezone.now() + timedelta(hours=1)
    tournament = Tournament.objects.create(
        name="Swiss Repeat",
        description="repeat avoidance",
        creator=creator,
        type=Tournament.TYPE_SWISS,
        time_control=Game.TIME_BLITZ,
        initial_time_seconds=300,
        increment_seconds=0,
        start_at=start_at,
        status=Tournament.STATUS_ACTIVE,
        started_at=timezone.now(),
        swiss_rounds=2,
        current_round=1,
        rated=True,
    )
    players = [
        create_user(email="swr1@example.com", username="swr1"),
        create_user(email="swr2@example.com", username="swr2"),
        create_user(email="swr3@example.com", username="swr3"),
        create_user(email="swr4@example.com", username="swr4"),
    ]
    for player in players:
        TournamentParticipant.objects.create(tournament=tournament, user=player)

    swiss_pairings(tournament.id)
    round1_games = list(TournamentGame.objects.filter(tournament=tournament, round_number=1).select_related("game"))
    assert len(round1_games) == 2
    round1_pairs = {
        frozenset((tg.game.white_id, tg.game.black_id))
        for tg in round1_games
    }
    for tg in round1_games:
        tg.game.status = Game.STATUS_FINISHED
        tg.game.result = Game.RESULT_WHITE
        tg.game.finished_at = timezone.now()
        tg.game.save(update_fields=["status", "result", "finished_at"])

    tournament.current_round = 2
    tournament.save(update_fields=["current_round"])
    swiss_pairings(tournament.id)
    round2_games = list(TournamentGame.objects.filter(tournament=tournament, round_number=2).select_related("game"))
    assert len(round2_games) == 2
    round2_pairs = {
        frozenset((tg.game.white_id, tg.game.black_id))
        for tg in round2_games
    }
    assert round1_pairs.isdisjoint(round2_pairs)
