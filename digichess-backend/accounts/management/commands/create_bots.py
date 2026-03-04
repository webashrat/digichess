"""
Management command to create chess bots with different skill levels.
Usage: python manage.py create_bots
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from accounts.models import User
import os

# (name, rating, avatar, engine, play_style, bio)
# avatar: image path served from frontend public/ OR emoji for legacy bots
# engine: "maia" (human-like NN) or "stockfish" (engine-strong)
BOTS = [
    # --- Beginner Tier (800-1200) — Maia engine ---
    ("Pawn-zilla", 800,
     "/chessbots/04_Pawn-zilla.png",
     "maia", "Aggressive",
     "Tiny but fierce! Bites off more than it can chew."),
    ("Castling Cat", 950,
     "/chessbots/13_Castling_Cat.png",
     "maia", "Defensive",
     "Meows its way across the board. Loves to castle early."),
    ("Rusty Rook", 1100,
     "/chessbots/01_Rusty_Rook.png",
     "maia", "Solid",
     "An old steampunk rook. Creaky but determined."),
    ("Bishop Byte", 1200,
     "/chessbots/02_Bishop_Byte.png",
     "maia", "Positional",
     "A digital bishop learning the diagonals."),

    # --- Intermediate Tier (1300-1600) — Maia engine ---
    ("Clockwork Carl", 1300,
     "/chessbots/08_Clockwork_Carl.png",
     "maia", "Solid",
     "Methodical and precise. Ticks like a clock."),
    ("Tactic Troll", 1400,
     "/chessbots/11_Tactic_Troll.png",
     "maia", "Tactical",
     "Sets sneaky traps. Don't feed the troll."),
    ("Sir Mate-a-Lot", 1500,
     "/chessbots/03_Sir_Mate-a-Lot.png",
     "maia", "Aggressive",
     "A noble knight who mates... a lot."),
    ("Mate-in-One Mike", 1600,
     "/chessbots/14_Mate-in-One_Mike.png",
     "maia", "Tactical",
     "Sees simple mates. Miss one and you're done."),

    # --- Advanced Tier (1700-1900) — Maia engine ---
    ("En Passant Entity", 1700,
     "/chessbots/12_En_Passant_Entity.png",
     "maia", "Positional",
     "A mysterious force that never misses en passant."),
    ("Gambit Ghost", 1800,
     "/chessbots/09_Gambit_Ghost.png",
     "maia", "Aggressive",
     "Sacrifices pieces for ghostly attacks."),
    ("Checkmate Chimp", 1900,
     "/chessbots/06_Checkmate_Chimp.png",
     "maia", "Tactical",
     "Analytical genius. Studies the board through a magnifying glass."),

    # --- Expert Tier (2000-2400) — Stockfish engine ---
    ("JDR", 2000, "\U0001f3a4", "stockfish", "Solid",
     "Precise calculation, no mercy."),
    ("RAJ", 2100, "\U0001f3a7", "stockfish", "Tactical",
     "Sharp tactics and relentless pressure."),
    ("Neon Nimzowitsch", 2200,
     "/chessbots/10_Neon_Nimzowitsch.png",
     "stockfish", "Positional",
     "Cyberpunk positional master. Controls the board from the shadows."),
    ("Queen Nebula", 2350,
     "/chessbots/07_Queen_Nebula.png",
     "stockfish", "Universal",
     "Cosmic queen with galactic power. Rules the universe of 64 squares."),
    ("DIGI", 2400, "\U0001f3b0", "stockfish", "Universal",
     "The house always wins."),

    # --- Master Tier (2600-2800) — Stockfish engine ---
    ("Grandmaster Glitch", 2600,
     "/chessbots/05_Grandmaster_Glitch.png",
     "stockfish", "Universal",
     "A glitched-out grandmaster. Pixelated perfection."),
    ("The Oracle", 2800,
     "/chessbots/15_The_Oracle.png",
     "stockfish", "Universal",
     "Sees everything. The all-knowing final boss."),
]


class Command(BaseCommand):
    help = 'Create chess bots with different skill levels'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0

        for name, rating, avatar, engine, play_style, bio in BOTS:
            email = f"bot_{name.lower().replace(' ', '_').replace('-', '_')}@digichess.bot"
            username = f"Bot_{name.replace(' ', '_')}"

            profile_pic_url = avatar if avatar.startswith('/') else None
            if name == "DIGI":
                media_bots_dir = os.path.join(settings.MEDIA_ROOT, 'bots')
                pic_path = os.path.join(media_bots_dir, 'digibot.jpg')
                if os.path.exists(pic_path):
                    api_base = getattr(settings, 'API_BASE_URL', 'http://localhost:8000')
                    profile_pic_url = f"{api_base.rstrip('/')}{settings.MEDIA_URL.rstrip('/')}/bots/digibot.jpg"

            bot_defaults = {
                'username': username,
                'first_name': name,
                'is_bot': True,
                'is_active': True,
                'bot_avatar': avatar,
                'bot_engine': engine,
                'bot_play_style': play_style,
                'bio': bio,
                'rating_bullet': rating,
                'rating_blitz': rating,
                'rating_rapid': rating,
                'rating_classical': rating,
                'rating_bullet_rd': 350.0,
                'rating_blitz_rd': 350.0,
                'rating_rapid_rd': 350.0,
                'rating_classical_rd': 350.0,
                'rating_bullet_vol': 0.06,
                'rating_blitz_vol': 0.06,
                'rating_rapid_vol': 0.06,
                'rating_classical_vol': 0.06,
                'country': 'BOT',
            }

            if profile_pic_url:
                bot_defaults['profile_pic'] = profile_pic_url

            bot, created = User.objects.update_or_create(
                email=email,
                defaults=bot_defaults
            )

            if created:
                bot.set_password(f"bot_{name.lower()}_password_{rating}")
                bot.save()
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Created bot: {name} (Rating: {rating}, Engine: {engine})'
                    )
                )
            else:
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'Updated bot: {name} (Rating: {rating}, Engine: {engine})'
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f'\nCompleted! Created: {created_count}, Updated: {updated_count}'
            )
        )
