import pytest
from django.utils import timezone

from games.models import Game, GameAnalysis


@pytest.mark.django_db
def test_full_analysis_runs_sync(api_client, create_game, auth_client, monkeypatch):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    def fake_run_full_analysis(game, prefer_lichess, time_per_move, depth, max_moves, allow_lichess_fallback):
        return (
            {"summary": {"total_moves": 0, "analyzed_moves": 0}, "moves": []},
            "local_stockfish",
            "/usr/local/bin/stockfish",
        )

    monkeypatch.setattr("games.views_analysis.run_full_analysis", fake_run_full_analysis)

    response = api_client.post(f"/api/games/{game.id}/analysis/full/", {}, format="json")
    assert response.status_code == 200
    assert response.data["status"] == GameAnalysis.STATUS_COMPLETED
    assert response.data["analysis"]["summary"]["total_moves"] == 0

    analysis_record = GameAnalysis.objects.get(game=game)
    assert analysis_record.status == GameAnalysis.STATUS_COMPLETED
    assert analysis_record.completed_at is not None


@pytest.mark.django_db
def test_full_analysis_returns_cached_when_complete(api_client, create_game, auth_client, monkeypatch):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    analysis_record = GameAnalysis.objects.create(
        game=game,
        status=GameAnalysis.STATUS_COMPLETED,
        source="local_stockfish",
        analysis={"summary": {"total_moves": 0, "analyzed_moves": 0}, "moves": []},
        completed_at=timezone.now(),
    )

    def should_not_run(*args, **kwargs):
        raise AssertionError("run_full_analysis should not be called for cached analysis")

    monkeypatch.setattr("games.views_analysis.run_full_analysis", should_not_run)

    response = api_client.post(f"/api/games/{game.id}/analysis/full/", {}, format="json")
    assert response.status_code == 200
    assert response.data["status"] == GameAnalysis.STATUS_COMPLETED
    assert response.data["analysis"]["summary"]["total_moves"] == 0

    analysis_record.refresh_from_db()
    assert analysis_record.status == GameAnalysis.STATUS_COMPLETED


@pytest.mark.django_db
def test_full_analysis_force_returns_cached(api_client, create_game, auth_client, monkeypatch):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    GameAnalysis.objects.create(
        game=game,
        status=GameAnalysis.STATUS_COMPLETED,
        source="local_stockfish",
        analysis={"summary": {"total_moves": 0, "analyzed_moves": 0}, "moves": []},
        completed_at=timezone.now(),
    )

    def should_not_run(*args, **kwargs):
        raise AssertionError("run_full_analysis should not be called for cached analysis")

    monkeypatch.setattr("games.views_analysis.run_full_analysis", should_not_run)

    response = api_client.post(
        f"/api/games/{game.id}/analysis/full/",
        {"force": True},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["analysis"]["summary"]["total_moves"] == 0


@pytest.mark.django_db
def test_full_analysis_fails_when_incomplete(api_client, create_game, auth_client, monkeypatch):
    game_data, challenger, opponent = create_game(preferred_color="white")
    auth_client(opponent)[0].post(f"/api/games/{game_data['id']}/accept/")
    game = Game.objects.get(id=game_data["id"])
    game.finish(Game.RESULT_DRAW)

    def fake_run_full_analysis(game, prefer_lichess, time_per_move, depth, max_moves, allow_lichess_fallback):
        return (
            {"summary": {"total_moves": 2, "analyzed_moves": 1}, "moves": [{"move": "e4"}]},
            "local_stockfish",
            "/usr/local/bin/stockfish",
        )

    monkeypatch.setattr("games.views_analysis.run_full_analysis", fake_run_full_analysis)

    response = api_client.post(f"/api/games/{game.id}/analysis/full/", {}, format="json")
    assert response.status_code == 503
    assert response.data["status"] == GameAnalysis.STATUS_FAILED
    assert "Analysis incomplete" in (response.data["error"] or "")
