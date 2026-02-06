from django.apps import AppConfig
from django.conf import settings
from pathlib import Path
import logging
import os
import shutil


logger = logging.getLogger(__name__)


class GamesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "games"

    def ready(self):
        if os.getenv("DISABLE_STARTUP_ENGINE_CHECK", "").lower() in {"1", "true", "yes", "y"}:
            return
        try:
            configured = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH"))
            candidates = []
            if configured:
                candidates.append(configured)
            repo_stockfish = Path(__file__).resolve().parent.parent / "Stockfish" / "src" / "stockfish"
            candidates.append(str(repo_stockfish))
            system_stockfish = shutil.which("stockfish")
            if system_stockfish:
                candidates.append(system_stockfish)
            candidates.append("/usr/local/bin/stockfish")

            found = next((p for p in candidates if p and Path(p).exists()), None)
            if found and os.access(found, os.X_OK):
                message = f"Stockfish detected: {found}"
                logger.info(message)
                print(message, flush=True)
            elif found:
                message = f"Stockfish found but not executable: {found}"
                logger.warning(message)
                print(message, flush=True)
            else:
                message = "Stockfish binary not found. Set STOCKFISH_PATH or install stockfish."
                logger.warning(message)
                print(message, flush=True)
        except Exception as exc:
            message = f"Stockfish startup check failed: {exc}"
            logger.warning(message)
            print(message, flush=True)
