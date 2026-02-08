import os

from games import stockfish_utils


def test_system_stockfish_path_accepted_when_working(monkeypatch):
    monkeypatch.setattr(stockfish_utils.platform, "system", lambda: "Linux")
    monkeypatch.setattr(stockfish_utils.Path, "exists", lambda self: True)
    monkeypatch.setattr(stockfish_utils.os, "access", lambda *args, **kwargs: True)
    monkeypatch.setattr(stockfish_utils, "_test_stockfish", lambda path: True)

    ok, _message, path = stockfish_utils.ensure_stockfish_works("/usr/local/bin/stockfish")

    assert ok is True
    assert path.endswith("/usr/local/bin/stockfish")
    assert os.environ.get("STOCKFISH_PATH") == "/usr/local/bin/stockfish"
