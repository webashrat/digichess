"""
Management command to test Maia Chess integration
Usage: python manage.py test_maia
"""
import chess
from django.core.management.base import BaseCommand
from games.maia_integration import get_maia_move, should_use_maia, get_lc0_path, get_maia_model_path


class Command(BaseCommand):
    help = 'Test Maia Chess integration'

    def handle(self, *args, **options):
        self.stdout.write("Testing Maia Chess Integration...")
        self.stdout.write("=" * 50)
        
        # Check lc0 installation
        lc0_path = get_lc0_path()
        if lc0_path:
            self.stdout.write(self.style.SUCCESS(f"✓ lc0 found at: {lc0_path}"))
        else:
            self.stdout.write(
                self.style.WARNING(
                    "✗ lc0 not found. Please install lc0:\n"
                    "  Download from: https://github.com/LeelaChessZero/lc0/releases\n"
                    "  Or build from source: https://github.com/LeelaChessZero/lc0"
                )
            )
        
        # Check models
        self.stdout.write("\nChecking Maia models...")
        test_ratings = [1100, 1500, 1900]
        all_models_exist = True
        for rating in test_ratings:
            model_path = get_maia_model_path(rating)
            if model_path:
                self.stdout.write(self.style.SUCCESS(f"✓ Model for rating {rating}: {model_path.name}"))
            else:
                self.stdout.write(self.style.ERROR(f"✗ Model for rating {rating}: NOT FOUND"))
                all_models_exist = False
        
        if not all_models_exist:
            self.stdout.write(
                self.style.WARNING("\nRun: python manage.py setup_maia --all")
            )
        
        # Test move generation
        if lc0_path and all_models_exist:
            self.stdout.write("\nTesting move generation...")
            board = chess.Board()
            
            # Test ratings across the full Maia range (800-2400)
            test_ratings = [1100, 1500, 1900, 2200, 2400]
            for rating in test_ratings:
                if should_use_maia(rating):
                    self.stdout.write(f"\nTesting Maia for rating {rating}...")
                    try:
                        move = get_maia_move(board, rating)
                        if move:
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"✓ Generated move: {board.san(move)}"
                                )
                            )
                        else:
                            self.stdout.write(
                                self.style.WARNING(
                                    f"✗ Failed to generate move (will use random fallback)"
                                )
                            )
                    except Exception as e:
                        self.stdout.write(
                            self.style.ERROR(f"✗ Error: {e}")
                        )
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Rating {rating} is outside Maia range (800-2400)"
                        )
                    )
        
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("Test complete!")





