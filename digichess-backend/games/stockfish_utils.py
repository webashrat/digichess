"""
Utilities for Stockfish from repository
Uses Stockfish binary from the repo, compiles if needed
"""
import os
import platform
import subprocess
from pathlib import Path
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def get_stockfish_path() -> str:
    """
    Get Stockfish path from repo or settings.
    Returns the path to the Stockfish binary.
    """
    # First check if path is configured in settings
    configured_path = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH"))
    if configured_path and Path(configured_path).exists():
        return configured_path
    
    # Use Stockfish from repo
    repo_stockfish = Path(__file__).parent.parent.parent / "Stockfish" / "src" / "stockfish"
    if repo_stockfish.exists():
        logger.info(f"Using Stockfish from repo: {repo_stockfish}")
        return str(repo_stockfish.absolute())
    
    # Try to compile from source if binary doesn't exist
    stockfish_src_dir = Path(__file__).parent.parent.parent / "Stockfish" / "src"
    if stockfish_src_dir.exists():
        logger.info("Stockfish binary not found, attempting to compile from source...")
        try:
            # Compile Stockfish
            result = subprocess.run(
                ["make", "-j", "4", "profile-build"],
                cwd=stockfish_src_dir,
                capture_output=True,
                text=True,
                timeout=300  # 5 minutes timeout
            )
            if result.returncode == 0 and repo_stockfish.exists():
                logger.info(f"Successfully compiled Stockfish: {repo_stockfish}")
                os.chmod(repo_stockfish, 0o755)
                return str(repo_stockfish.absolute())
            else:
                logger.error(f"Stockfish compilation failed: {result.stderr}")
        except Exception as e:
            logger.error(f"Error compiling Stockfish: {e}")
    
    # Fallback to configured path even if it doesn't exist (will return error later)
    return configured_path or "/usr/local/bin/stockfish"


def _old_auto_fix_stockfish(engine_path: str) -> bool:
    """
    Automatically fix Stockfish architecture mismatch by downloading correct binary.
    This runs on the server side automatically when needed.
    
    Returns True if fix was successful, False otherwise.
    """
    system_arch = platform.machine()
    
    # Only auto-fix for x86_64 Linux (most common case)
    # For other architectures, user should compile from source
    if system_arch not in ["x86_64", "amd64"]:
        logger.warning(f"Auto-fix not supported for architecture: {system_arch}")
        return False
    
    # Check if we're already installing (lock file exists)
    if os.path.exists(LOCK_FILE):
        logger.info("Stockfish installation already in progress, waiting...")
        # Wait a bit and check if it completed
        import time
        for _ in range(30):  # Wait up to 30 seconds
            time.sleep(1)
            if not os.path.exists(LOCK_FILE):
                # Installation completed, check if binary works
                return _test_stockfish(engine_path)
        return False
    
    try:
        # Create lock file
        Path(LOCK_FILE).touch()
        
        logger.info(f"Auto-fixing Stockfish for {system_arch}...")
        logger.info(f"Downloading Stockfish 16 for x86_64 Linux...")
        
        url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_linux_x64_bmi2.zip"
        
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "stockfish.zip")
            
            # Download
            logger.info(f"Downloading from {url}...")
            urllib.request.urlretrieve(url, zip_path)
            
            # Extract
            logger.info("Extracting...")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(tmpdir)
            
            # Find binary
            binary_path = os.path.join(tmpdir, "stockfish_16_linux_x64_bmi2", "stockfish")
            if not os.path.exists(binary_path):
                logger.error("Downloaded file doesn't contain expected binary")
                return False
            
            # Backup old binary if exists
            if os.path.exists(engine_path):
                backup_path = f"{engine_path}.backup"
                try:
                    shutil.move(engine_path, backup_path)
                    logger.info(f"Backed up old binary to {backup_path}")
                except Exception as e:
                    logger.warning(f"Could not backup old binary: {e}")
            
            # Install new binary
            shutil.copy2(binary_path, engine_path)
            os.chmod(engine_path, 0o755)
            
            logger.info(f"✅ Installed Stockfish to {engine_path}")
            
            # Test it
            if _test_stockfish(engine_path):
                logger.info("✅ Stockfish verified and working!")
                return True
            else:
                logger.error("❌ Stockfish installation failed verification")
                # Restore backup if exists
                backup_path = f"{engine_path}.backup"
                if os.path.exists(backup_path):
                    shutil.move(backup_path, engine_path)
                return False
                
    except Exception as e:
        logger.error(f"Failed to auto-fix Stockfish: {e}", exc_info=True)
        return False
    finally:
        # Remove lock file
        if os.path.exists(LOCK_FILE):
            os.remove(LOCK_FILE)


def _test_stockfish(engine_path: str) -> bool:
    """Test if Stockfish binary works"""
    try:
        import chess.engine
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            import chess
            limit = chess.engine.Limit(time=0.1)
            result = engine.analyse(chess.Board(), limit)
            return result is not None
    except Exception:
        return False


def ensure_stockfish_works(engine_path: str = None) -> tuple[bool, str]:
    """
    Ensure Stockfish is available and working.
    Uses Stockfish from repo, compiles if needed.
    
    Returns (success: bool, message: str)
    """
    if not engine_path:
        engine_path = get_stockfish_path()
    
    if not engine_path:
        return False, "STOCKFISH_PATH not configured and repo Stockfish not available"
    
    if not Path(engine_path).exists():
        return False, f"Stockfish not found at {engine_path}"
    
    if not os.access(engine_path, os.X_OK):
        # Try to make it executable
        try:
            os.chmod(engine_path, 0o755)
        except Exception as e:
            return False, f"Stockfish is not executable at {engine_path}: {e}"
    
    # Test if Stockfish works
    try:
        import chess.engine
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            import chess
            limit = chess.engine.Limit(time=0.1)
            result = engine.analyse(chess.Board(), limit)
            if result:
                return True, "Stockfish is working"
    except OSError as e:
        if e.errno == 8:  # Exec format error - architecture mismatch
            system_arch = platform.machine()
            return False, (
                f"Stockfish architecture mismatch. System: {system_arch}, "
                f"Binary: {engine_path}. Please compile Stockfish for your architecture. "
                f"Run: cd digichess-backend/Stockfish/src && make -j4 profile-build"
            )
        else:
            return False, f"Failed to start Stockfish: {str(e)}"
    except Exception as e:
        return False, f"Stockfish error: {str(e)}"
    
    return False, "Stockfish test failed"

