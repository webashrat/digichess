import pytest
from datetime import timedelta
from django.utils import timezone

from games.models import Game, Tournament, TournamentGame, TournamentParticipant


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
