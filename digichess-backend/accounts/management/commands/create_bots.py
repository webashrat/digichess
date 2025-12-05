"""
Management command to create chess bots with different skill levels
Usage: python manage.py create_bots
"""
from django.core.management.base import BaseCommand
from accounts.models import User

# Bot definitions: name, rating, avatar emoji (chess.com style)
# Chess.com uses various emojis for bots: 🎭, 🎪, 🎨, 🎯, 🎲, 🎸, 🎹, 🎺, 🎻, 🎤, 🎧, 🎬, 🎮, 🎰, 🎲
BOTS = [
    # Beginner bots (800-1000)
    ("Nelson", 800, "🎭"),
    ("Wally", 850, "🎪"),
    ("Sven", 900, "🎨"),
    ("Jake", 950, "🎯"),
    ("Antonio", 1000, "🎲"),
    
    # Intermediate bots (1000-1500)
    ("Marcus", 1050, "🎸"),
    ("Lucas", 1100, "🎹"),
    ("Alex", 1150, "🎺"),
    ("Diana", 1200, "🎻"),
    ("Ethan", 1250, "🎤"),
    ("Fiona", 1300, "🎧"),
    ("George", 1350, "🎬"),
    ("Hannah", 1400, "🎮"),
    ("Ian", 1450, "🎰"),
    ("Julia", 1500, "🎲"),
    
    # Advanced bots (1500-2000)
    ("Kyle", 1550, "🎭"),
    ("Luna", 1600, "🎪"),
    ("Max", 1650, "🎨"),
    ("Nina", 1700, "🎯"),
    ("Oscar", 1750, "🎲"),
    ("Paula", 1800, "🎸"),
    ("Quinn", 1850, "🎹"),
    ("Rosa", 1900, "🎺"),
    ("Sam", 1950, "🎻"),
    ("JDR", 2000, "🎤"),  # Specific bot requested
    
    # Expert bots (2000-2500)
    ("RAJ", 2100, "🎧"),  # Specific bot requested
    ("Tina", 2200, "🎬"),
    ("Victor", 2300, "🎮"),
    ("DIGI", 2400, "🎰"),  # Specific bot requested
    ("Master", 2500, "🎲"),
]


class Command(BaseCommand):
    help = 'Create chess bots with different skill levels'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        
        for i, (name, rating, avatar) in enumerate(BOTS):
            # Use avatar from bot definition
            bot_avatar = avatar
            
            # Create unique email and username for bot
            email = f"bot_{name.lower()}@digichess.bot"
            username = f"Bot_{name}"
            
            bot, created = User.objects.update_or_create(
                email=email,
                defaults={
                    'username': username,
                    'first_name': name,
                    'is_bot': True,
                    'is_active': True,
                    'bot_avatar': bot_avatar,
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
                    'bio': f'Chess bot with {rating} rating',
                }
            )
            
            # Set a random password (bots don't need to login)
            if created:
                bot.set_password(f"bot_{name.lower()}_password_{rating}")
                bot.save()
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Created bot: {name} (Rating: {rating})')
                )
            else:
                updated_count += 1
                self.stdout.write(
                    self.style.WARNING(f'Updated bot: {name} (Rating: {rating})')
                )
        
        self.stdout.write(
            self.style.SUCCESS(
                f'\nCompleted! Created: {created_count}, Updated: {updated_count}'
            )
        )

