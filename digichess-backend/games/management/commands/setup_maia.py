"""
Management command to download and set up Maia Chess models
Usage: python manage.py setup_maia [--model-rating RATING] [--all]
"""
import os
import requests
from pathlib import Path
from django.core.management.base import BaseCommand
from django.conf import settings

# Maia model download URLs
MAIA_DOWNLOAD_URLS = {
    1100: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1100.pb.gz",
    1200: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1200.pb.gz",
    1300: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1300.pb.gz",
    1400: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1400.pb.gz",
    1500: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1500.pb.gz",
    1600: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1600.pb.gz",
    1700: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1700.pb.gz",
    1800: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1800.pb.gz",
    1900: "https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz",
}


class Command(BaseCommand):
    help = 'Download and set up Maia Chess models for human-like bot play'

    def add_arguments(self, parser):
        parser.add_argument(
            '--model-rating',
            type=int,
            help='Download specific model rating (1100, 1200, ..., 1900)',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Download all Maia models',
        )

    def handle(self, *args, **options):
        # Get model directory
        maia_dir = getattr(settings, "MAIA_MODELS_DIR", None)
        if not maia_dir:
            maia_dir = Path(__file__).parent.parent.parent / "maia_models"
        else:
            maia_dir = Path(maia_dir)
        
        maia_dir.mkdir(parents=True, exist_ok=True)
        self.stdout.write(f"Maia models directory: {maia_dir}")
        
        # Determine which models to download
        models_to_download = []
        if options['all']:
            models_to_download = list(MAIA_DOWNLOAD_URLS.keys())
        elif options['model_rating']:
            if options['model_rating'] not in MAIA_DOWNLOAD_URLS:
                self.stdout.write(
                    self.style.ERROR(
                        f"Invalid model rating. Available: {list(MAIA_DOWNLOAD_URLS.keys())}"
                    )
                )
                return
            models_to_download = [options['model_rating']]
        else:
            # Default: download most commonly used models
            models_to_download = [1100, 1500, 1900]
            self.stdout.write(
                self.style.WARNING(
                    "No specific model requested. Downloading default models: 1100, 1500, 1900"
                )
            )
            self.stdout.write("Use --all to download all models or --model-rating RATING for specific model")
        
        # Download models
        for rating in models_to_download:
            model_filename = f"maia-{rating}.pb.gz"
            model_path = maia_dir / model_filename
            
            if model_path.exists():
                self.stdout.write(
                    self.style.WARNING(f"Model {model_filename} already exists. Skipping...")
                )
                continue
            
            url = MAIA_DOWNLOAD_URLS[rating]
            self.stdout.write(f"Downloading {model_filename} from {url}...")
            
            try:
                response = requests.get(url, stream=True, timeout=300)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                
                with open(model_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                percent = (downloaded / total_size) * 100
                                self.stdout.write(f"\rProgress: {percent:.1f}%", ending='')
                
                self.stdout.write(
                    self.style.SUCCESS(f"\n✓ Successfully downloaded {model_filename}")
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"\n✗ Failed to download {model_filename}: {e}")
                )
                if model_path.exists():
                    model_path.unlink()  # Remove partial download
        
        self.stdout.write(
            self.style.SUCCESS(
                "\nMaia models setup complete! "
                "Make sure lc0 is installed: https://github.com/LeelaChessZero/lc0"
            )
        )




