"""
Test every bot generates a valid move quickly for every time control.
Run with: pytest games/test_all_bots.py -v -s
"""
import chess
import time
import pytest
from django.core.management import call_command
from accounts.models import User
from games.bot_utils import get_bot_move, get_bot_move_with_error, get_stockfish_config

MIDGAME_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
TIME_CONTROLS = ["bullet", "blitz", "rapid", "classical"]

# Total time = engine startup (~2s) + think time + buffer.
# First Stockfish call in a cold container can take ~10-15s (process init + JIT),
# subsequent calls are ~2-3s.  Generous limits to avoid cold-start flakes.
MAX_MOVE_TIME = {
    "bullet": 16.0,
    "blitz": 16.0,
    "rapid": 16.0,
    "classical": 16.0,
}


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        call_command("create_bots")


def get_all_bots():
    return list(
        User.objects.filter(is_bot=True, is_active=True).order_by('rating_blitz')
    )


@pytest.mark.django_db
class TestAllBotsCreated:

    def test_18_bots_exist(self):
        bots = get_all_bots()
        print(f"\n  Found {len(bots)} bots:")
        for b in bots:
            print(f"    {b.first_name:<22} {b.rating_blitz:>5}  engine={b.bot_engine}")
        assert len(bots) >= 18


@pytest.mark.django_db
class TestStockfishConfigTimings:
    """Verify config think-time scales correctly per time control."""

    @pytest.mark.parametrize("tc", TIME_CONTROLS)
    def test_bullet_is_fastest(self, tc):
        for rating in [2000, 2200, 2400, 2600, 2800]:
            cfg = get_stockfish_config(rating, tc)
            bullet_cfg = get_stockfish_config(rating, "bullet")
            assert bullet_cfg['time'] <= cfg['time'], (
                f"Bullet should be <= {tc} for rating {rating}"
            )
            print(f"  {rating}  {tc:<10} {cfg['time']*1000:.0f}ms  bullet={bullet_cfg['time']*1000:.0f}ms")


@pytest.mark.django_db
class TestAllBotsAllFormats:
    """Every bot must return a legal move within the time budget for each format."""

    @pytest.mark.parametrize("tc", TIME_CONTROLS)
    def test_starting_position(self, tc):
        board = chess.Board()
        deadline = MAX_MOVE_TIME[tc]
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            t0 = time.time()
            move = get_bot_move(board, b.rating_blitz, time_control=tc, engine=engine)
            elapsed = time.time() - t0
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): illegal {move}"
            )
            assert elapsed < deadline, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): "
                f"took {elapsed:.2f}s, limit {deadline}s"
            )
            print(
                f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  "
                f"[{engine:<9}]  {tc:<10}  {move}  {elapsed*1000:.0f}ms"
            )

    @pytest.mark.parametrize("tc", TIME_CONTROLS)
    def test_midgame_position(self, tc):
        board = chess.Board(MIDGAME_FEN)
        deadline = MAX_MOVE_TIME[tc]
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            t0 = time.time()
            move = get_bot_move(
                board, b.rating_blitz, time_control=tc, engine=engine, ply_count=7
            )
            elapsed = time.time() - t0
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): illegal {move} mid"
            )
            assert elapsed < deadline, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): "
                f"took {elapsed:.2f}s, limit {deadline}s"
            )
            print(
                f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  "
                f"[{engine:<9}]  {tc:<10}  {move}  {elapsed*1000:.0f}ms"
            )

    @pytest.mark.parametrize("tc", TIME_CONTROLS)
    def test_error_wrapper(self, tc):
        board = chess.Board()
        deadline = MAX_MOVE_TIME[tc]
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            t0 = time.time()
            move = get_bot_move_with_error(
                board, b.rating_blitz, time_control=tc, engine=engine
            )
            elapsed = time.time() - t0
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): "
                f"error wrapper illegal {move}"
            )
            assert elapsed < deadline, (
                f"{b.first_name} ({b.rating_blitz}, {engine}, {tc}): "
                f"took {elapsed:.2f}s, limit {deadline}s"
            )
            print(
                f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  "
                f"[{engine:<9}]  {tc:<10}  err->{move}  {elapsed*1000:.0f}ms"
            )
