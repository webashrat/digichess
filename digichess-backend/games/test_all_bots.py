"""
Test that every bot can generate a valid move.
Run with: pytest games/test_all_bots.py -v -s
"""
import chess
import pytest
from django.core.management import call_command
from accounts.models import User
from games.bot_utils import get_bot_move, get_bot_move_with_error

MIDGAME_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
ENDGAME_FEN = "8/5pk1/6p1/8/8/2R5/5PPP/6K1 w - - 0 1"


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    with django_db_blocker.unblock():
        call_command("create_bots")


def get_all_bots():
    return list(
        User.objects.filter(is_bot=True, is_active=True)
        .order_by('rating_blitz')
    )


@pytest.mark.django_db
class TestAllBotsRespondToMoves:

    def test_all_18_bots_created(self):
        bots = get_all_bots()
        print(f"\n  Found {len(bots)} bots:")
        for b in bots:
            print(f"    {b.first_name:<22} {b.rating_blitz:>5}  engine={b.bot_engine}")
        assert len(bots) >= 18, f"Expected at least 18 bots, got {len(bots)}"

    def test_starting_position(self):
        board = chess.Board()
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            move = get_bot_move(board, b.rating_blitz, engine=engine)
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}): illegal move {move}"
            )
            print(f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  [{engine:<9}]  start -> {move}")

    def test_midgame_position(self):
        board = chess.Board(MIDGAME_FEN)
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            move = get_bot_move(board, b.rating_blitz, engine=engine, ply_count=7)
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}): illegal move {move} in midgame"
            )
            print(f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  [{engine:<9}]  mid   -> {move}")

    def test_endgame_position(self):
        board = chess.Board(ENDGAME_FEN)
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            move = get_bot_move(board, b.rating_blitz, engine=engine, ply_count=60)
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}): illegal move {move} in endgame"
            )
            print(f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  [{engine:<9}]  end   -> {move}")

    def test_error_wrapper(self):
        board = chess.Board()
        for b in get_all_bots():
            engine = b.bot_engine or 'maia'
            move = get_bot_move_with_error(board, b.rating_blitz, engine=engine)
            assert move in board.legal_moves, (
                f"{b.first_name} ({b.rating_blitz}, {engine}): error wrapper illegal move {move}"
            )
            print(f"  PASS  {b.first_name:<22} {b.rating_blitz:>5}  [{engine:<9}]  err   -> {move}")
