"""
Utilities for Stockfish from repository
Uses Stockfish binary from the repo, compiles if needed
"""
import os
import platform
import subprocess
import tempfile
import urllib.request
import zipfile
import tarfile
import shutil
from pathlib import Path
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Lock file path for preventing concurrent Stockfish installations
LOCK_FILE = "/tmp/stockfish_install.lock"


def get_stockfish_path() -> str:
    """
    Get Stockfish path from repo or settings.
    Returns the path to the Stockfish binary.
    """
    # First check if path is configured in settings
    configured_path = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH"))
    system_name = platform.system().lower()
    if configured_path and Path(configured_path).exists():
        return configured_path
    if configured_path and not Path(configured_path).exists():
        logger.warning(f"Configured STOCKFISH_PATH not found: {configured_path}")
    
    repo_root = Path(__file__).parent.parent.parent
    if system_name == "windows":
        repo_windows_bin = repo_root / "Stockfish" / "bin" / "stockfish.exe"
        if repo_windows_bin.exists():
            logger.info(f"Using Stockfish from repo (Windows): {repo_windows_bin}")
            return str(repo_windows_bin.absolute())
        repo_windows_src = repo_root / "Stockfish" / "src" / "stockfish.exe"
        if repo_windows_src.exists():
            logger.info(f"Using Stockfish from repo src (Windows): {repo_windows_src}")
            return str(repo_windows_src.absolute())

    # Use Stockfish from repo (Unix)
    repo_stockfish = repo_root / "Stockfish" / "src" / "stockfish"
    if repo_stockfish.exists():
        logger.info(f"Using Stockfish from repo: {repo_stockfish}")
        return str(repo_stockfish.absolute())

    # If repo source exists, prefer local target path to allow auto-fix
    stockfish_src_dir = repo_root / "Stockfish" / "src"
    if stockfish_src_dir.exists():
        if system_name == "windows":
            return str((repo_root / "Stockfish" / "bin" / "stockfish.exe").absolute())
        return str(repo_stockfish.absolute())

    # Try system stockfish in PATH
    system_stockfish = shutil.which("stockfish")
    if system_stockfish:
        if system_name == "linux" and system_stockfish.endswith("/usr/local/bin/stockfish"):
            logger.warning("System stockfish points to /usr/local/bin/stockfish; using repo binary instead.")
        else:
            logger.info(f"Using Stockfish from PATH: {system_stockfish}")
            return system_stockfish
    
    # Try to compile from source if binary doesn't exist
    stockfish_src_dir = Path(__file__).parent.parent.parent / "Stockfish" / "src"
    if stockfish_src_dir.exists() and system_name != "windows":
        logger.info("Stockfish binary not found, attempting to compile from source...")
        try:
            result = subprocess.run(
                ["make", "-j", "4", "profile-build"],
                cwd=stockfish_src_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            if result.returncode == 0 and repo_stockfish.exists():
                logger.info(f"Successfully compiled Stockfish: {repo_stockfish}")
                os.chmod(repo_stockfish, 0o755)
                return str(repo_stockfish.absolute())
            logger.error(f"Stockfish compilation failed: {result.stderr}")
        except Exception as e:
            logger.error(f"Error compiling Stockfish: {e}")
    
    # Fallback to default system path
    return "stockfish.exe" if system_name == "windows" else "/usr/local/bin/stockfish"


def _compile_stockfish_repo(repo_root: Path) -> tuple[bool, str, str]:
    stockfish_src_dir = repo_root / "Stockfish" / "src"
    if not stockfish_src_dir.exists():
        return False, "Stockfish source not found in repo.", ""
    if not shutil.which("make"):
        return False, "Make is not available on this system.", ""
    try:
        result = subprocess.run(
            ["make", "-j", "4", "profile-build"],
            cwd=stockfish_src_dir,
            capture_output=True,
            text=True,
            timeout=300
        )
        repo_stockfish = stockfish_src_dir / "stockfish"
        if result.returncode == 0 and repo_stockfish.exists():
            os.chmod(repo_stockfish, 0o755)
            return True, "Stockfish compiled successfully.", str(repo_stockfish.absolute())
        return False, f"Stockfish compilation failed: {result.stderr}", ""
    except Exception as exc:
        return False, f"Stockfish compilation error: {exc}", ""


def _download_stockfish_linux_x64(target_path: Path) -> tuple[bool, str]:
    url = os.getenv(
        "STOCKFISH_LINUX_URL",
        "https://sourceforge.net/projects/stockfish.mirror/files/sf_16.1/stockfish-ubuntu-x86-64.tar/download",
    )
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmpdir:
            archive_path = Path(tmpdir) / "stockfish.download"
            urllib.request.urlretrieve(url, str(archive_path))
            extracted = False
            try:
                with zipfile.ZipFile(archive_path, "r") as zip_ref:
                    zip_ref.extractall(tmpdir)
                    extracted = True
            except zipfile.BadZipFile:
                extracted = False
            if not extracted:
                try:
                    with tarfile.open(archive_path, "r:*") as tar_ref:
                        tar_ref.extractall(tmpdir)
                        extracted = True
                except tarfile.TarError:
                    return False, "Downloaded archive is not a zip/tar file"
            binary_path = None
            for root, _, files in os.walk(tmpdir):
                if "stockfish" in files:
                    binary_path = Path(root) / "stockfish"
                    break
            if not binary_path:
                return False, "Downloaded archive did not contain stockfish binary"
            shutil.copy2(binary_path, target_path)
            os.chmod(target_path, 0o755)
            return True, f"Downloaded Stockfish to {target_path}"
    except Exception as exc:
        return False, f"Failed to download Stockfish for Linux: {exc}"


def _download_stockfish_windows(target_path: Path) -> tuple[bool, str]:
    """
    Download a Windows Stockfish binary and install it at target_path.
    """
    url = os.getenv(
        "STOCKFISH_WINDOWS_URL",
        "https://sourceforge.net/projects/stockfish.mirror/files/sf_16/stockfish-windows-x86-64.zip/download",
    )
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = Path(tmpdir) / "stockfish.zip"
            urllib.request.urlretrieve(url, str(zip_path))
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(tmpdir)
            binary_path = None
            for root, _, files in os.walk(tmpdir):
                if "stockfish.exe" in files:
                    binary_path = Path(root) / "stockfish.exe"
                    break
            if not binary_path:
                return False, "Downloaded archive did not contain stockfish.exe"
            shutil.copy2(binary_path, target_path)
            return True, f"Downloaded Stockfish to {target_path}"
    except Exception as exc:
        return False, f"Failed to download Stockfish for Windows: {exc}"


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


def ensure_stockfish_works(engine_path: str = None) -> tuple[bool, str, str]:
    """
    Ensure Stockfish is available and working.
    Uses Stockfish from repo, compiles if needed.
    
    Returns (success: bool, message: str)
    """
    if not engine_path:
        engine_path = get_stockfish_path()

    resolved_path = engine_path
    repo_root = Path(__file__).parent.parent.parent
    system_name = platform.system().lower()

    # Preemptively prefer repo binaries over a potentially mismatched system binary.
    if system_name == "windows":
        repo_bin = repo_root / "Stockfish" / "bin" / "stockfish.exe"
        if not repo_bin.exists():
            _download_stockfish_windows(repo_bin)
        if repo_bin.exists():
            engine_path = str(repo_bin.absolute())
            resolved_path = engine_path
            os.environ["STOCKFISH_PATH"] = engine_path
    elif system_name == "linux" and str(engine_path).endswith("/usr/local/bin/stockfish"):
        if Path(engine_path).exists() and _test_stockfish(engine_path):
            os.environ["STOCKFISH_PATH"] = engine_path
            return True, "Stockfish is working", engine_path
        repo_bin = repo_root / "Stockfish" / "bin" / "stockfish"
        compiled = False
        if not repo_bin.exists():
            ok, _, compiled_path = _compile_stockfish_repo(repo_root)
            if ok and compiled_path and _test_stockfish(compiled_path):
                engine_path = compiled_path
                resolved_path = compiled_path
                os.environ["STOCKFISH_PATH"] = compiled_path
                compiled = True
            else:
                ok, _ = _download_stockfish_linux_x64(repo_bin)
                if ok and _test_stockfish(str(repo_bin)):
                    engine_path = str(repo_bin.absolute())
                    resolved_path = engine_path
                    os.environ["STOCKFISH_PATH"] = engine_path
                    compiled = True
        elif _test_stockfish(str(repo_bin)):
            engine_path = str(repo_bin.absolute())
            resolved_path = engine_path
            os.environ["STOCKFISH_PATH"] = engine_path
            compiled = True
        if not compiled:
            return False, (
                "Stockfish installation failed. Remove STOCKFISH_PATH=/usr/local/bin/stockfish "
                "or install a compatible binary in digichess-backend/Stockfish/bin/stockfish."
            ), resolved_path
    
    if not engine_path:
        return False, "STOCKFISH_PATH not configured and repo Stockfish not available"
    
    if not Path(engine_path).exists():
        if system_name == "windows":
            target = repo_root / "Stockfish" / "bin" / "stockfish.exe"
            ok, message = _download_stockfish_windows(target)
            if ok and _test_stockfish(str(target)):
                return True, message, str(target)
            return False, message, resolved_path
        if system_name == "linux":
            ok, message, compiled_path = _compile_stockfish_repo(repo_root)
            if ok and _test_stockfish(compiled_path):
                return True, message, compiled_path
            target = repo_root / "Stockfish" / "bin" / "stockfish"
            ok, message = _download_stockfish_linux_x64(target)
            if ok and _test_stockfish(str(target)):
                return True, message, str(target)
            return False, message, resolved_path
        return False, f"Stockfish not found at {engine_path}", resolved_path
    
    if not os.access(engine_path, os.X_OK):
        # Try to make it executable
        try:
            os.chmod(engine_path, 0o755)
        except Exception as e:
            return False, f"Stockfish is not executable at {engine_path}: {e}", resolved_path
    
    # Test if Stockfish works
    try:
        import chess.engine
        with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
            import chess
            limit = chess.engine.Limit(time=0.1)
            result = engine.analyse(chess.Board(), limit)
            if result:
                return True, "Stockfish is working", resolved_path
    except OSError as e:
        if e.errno == 8:  # Exec format error - architecture mismatch
            system_arch = platform.machine()
            if system_name == "windows":
                target = repo_root / "Stockfish" / "bin" / "stockfish.exe"
                ok, message = _download_stockfish_windows(target)
                if ok and _test_stockfish(str(target)):
                    os.environ["STOCKFISH_PATH"] = str(target)
                    return True, f"Stockfish fixed ({message})", str(target)
                return False, message, resolved_path
            if system_name == "linux":
                ok, message, compiled_path = _compile_stockfish_repo(repo_root)
                if ok and _test_stockfish(compiled_path):
                    os.environ["STOCKFISH_PATH"] = compiled_path
                    return True, f"Stockfish fixed ({message})", compiled_path
                target = repo_root / "Stockfish" / "bin" / "stockfish"
                ok, message = _download_stockfish_linux_x64(target)
                if ok and _test_stockfish(str(target)):
                    os.environ["STOCKFISH_PATH"] = str(target)
                    return True, f"Stockfish fixed ({message})", str(target)
                return False, message, resolved_path
            return False, (
                f"Stockfish architecture mismatch. System: {system_arch}, "
                f"Binary: {engine_path}. Please compile Stockfish for your architecture. "
                f"Run: cd digichess-backend/Stockfish/src && make -j4 profile-build"
            ), resolved_path
        return False, f"Failed to start Stockfish: {str(e)}", resolved_path
    except Exception as e:
        return False, f"Stockfish error: {str(e)}", resolved_path
    
    return False, "Stockfish test failed", resolved_path

