"""
Management command to check and fix Stockfish installation
Usage: python manage.py check_stockfish [--fix]
"""
import os
import subprocess
import platform
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = 'Check Stockfish installation and optionally fix it'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to download and install correct Stockfish binary',
        )

    def handle(self, *args, **options):
        self.stdout.write("=" * 60)
        self.stdout.write("Stockfish Installation Check")
        self.stdout.write("=" * 60)
        self.stdout.write("")
        
        # Get Stockfish path
        engine_path = getattr(settings, "STOCKFISH_PATH", os.getenv("STOCKFISH_PATH", "/usr/local/bin/stockfish"))
        system_arch = platform.machine()
        
        self.stdout.write(f"System architecture: {system_arch}")
        self.stdout.write(f"Expected Stockfish path: {engine_path}")
        self.stdout.write("")
        
        # Check if file exists
        if not Path(engine_path).exists():
            self.stdout.write(self.style.ERROR(f"❌ Stockfish not found at {engine_path}"))
            if options['fix']:
                self._install_stockfish(engine_path, system_arch)
            else:
                self.stdout.write(self.style.WARNING("\n💡 Run with --fix to install Stockfish"))
            return
        
        # Check file type
        try:
            result = subprocess.run(['file', engine_path], capture_output=True, text=True, timeout=5)
            file_info = result.stdout.strip()
            self.stdout.write(f"📄 File info: {file_info}")
            
            # Check if it mentions wrong architecture
            if system_arch == "x86_64" and ("ARM" in file_info or "aarch64" in file_info or "arm64" in file_info):
                self.stdout.write(self.style.ERROR(f"\n❌ Architecture mismatch! File is ARM but system is x86_64"))
                if options['fix']:
                    self._install_stockfish(engine_path, system_arch)
                else:
                    self.stdout.write(self.style.WARNING("\n💡 Run with --fix to install correct binary"))
                return
            elif (system_arch in ["arm64", "aarch64"]) and ("x86-64" in file_info or "Intel 80386" in file_info):
                self.stdout.write(self.style.ERROR(f"\n❌ Architecture mismatch! File is x86_64 but system is ARM"))
                if options['fix']:
                    self._install_stockfish(engine_path, system_arch)
                else:
                    self.stdout.write(self.style.WARNING("\n💡 Run with --fix to install correct binary"))
                return
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"⚠️  Could not check file type: {e}"))
        
        # Check if executable
        if not os.access(engine_path, os.X_OK):
            self.stdout.write(self.style.ERROR(f"❌ Stockfish is not executable"))
            if options['fix']:
                self.stdout.write(f"🔧 Making executable...")
                os.chmod(engine_path, 0o755)
                self.stdout.write(self.style.SUCCESS("✅ Made executable"))
            else:
                self.stdout.write(self.style.WARNING(f"\n💡 Run: chmod +x {engine_path}"))
        
        # Test Stockfish
        self.stdout.write("")
        self.stdout.write("🧪 Testing Stockfish...")
        try:
            import chess.engine
            with chess.engine.SimpleEngine.popen_uci(engine_path) as engine:
                limit = chess.engine.Limit(time=0.1)
                result = engine.analyse(chess.Board(), limit)
                if result:
                    self.stdout.write(self.style.SUCCESS("✅ Stockfish works correctly!"))
                    self.stdout.write(f"   Depth reached: {result.get('depth', 'N/A')}")
                else:
                    self.stdout.write(self.style.WARNING("⚠️  Stockfish responds but returns no analysis"))
        except OSError as e:
            if e.errno == 8:  # Exec format error
                self.stdout.write(self.style.ERROR(f"\n❌ Exec format error - Architecture mismatch!"))
                self.stdout.write(self.style.ERROR(f"   System: {system_arch}"))
                self.stdout.write(self.style.ERROR(f"   Error: {str(e)}"))
                if options['fix']:
                    self._install_stockfish(engine_path, system_arch)
                else:
                    self.stdout.write(self.style.WARNING("\n💡 Run with --fix to install correct binary"))
            else:
                self.stdout.write(self.style.ERROR(f"❌ Failed to start Stockfish: {str(e)}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Error testing Stockfish: {str(e)}"))
        
        self.stdout.write("")
        self.stdout.write("=" * 60)

    def _install_stockfish(self, engine_path, system_arch):
        """Install Stockfish for the current architecture"""
        self.stdout.write("")
        self.stdout.write("📥 Installing Stockfish...")
        
        if system_arch in ["x86_64", "amd64"]:
            self.stdout.write("   Downloading x86_64 binary...")
            try:
                import urllib.request
                import zipfile
                import tempfile
                import shutil
                
                url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_16/stockfish_16_linux_x64_bmi2.zip"
                
                with tempfile.TemporaryDirectory() as tmpdir:
                    zip_path = os.path.join(tmpdir, "stockfish.zip")
                    urllib.request.urlretrieve(url, zip_path)
                    
                    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                        zip_ref.extractall(tmpdir)
                    
                    binary_path = os.path.join(tmpdir, "stockfish_16_linux_x64_bmi2", "stockfish")
                    if os.path.exists(binary_path):
                        # Backup old binary if exists
                        if os.path.exists(engine_path):
                            backup_path = f"{engine_path}.backup"
                            shutil.move(engine_path, backup_path)
                            self.stdout.write(f"   Backed up old binary to {backup_path}")
                        
                        # Copy new binary
                        shutil.copy2(binary_path, engine_path)
                        os.chmod(engine_path, 0o755)
                        self.stdout.write(self.style.SUCCESS(f"✅ Installed Stockfish to {engine_path}"))
                    else:
                        self.stdout.write(self.style.ERROR("❌ Downloaded file doesn't contain expected binary"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"❌ Failed to install: {str(e)}"))
                self.stdout.write(self.style.WARNING("   Manual installation required - see STOCKFISH_ARCH_FIX.md"))
        else:
            self.stdout.write(self.style.WARNING(f"   Automatic installation not supported for {system_arch}"))
            self.stdout.write(self.style.WARNING("   Please compile Stockfish from source for your architecture"))

