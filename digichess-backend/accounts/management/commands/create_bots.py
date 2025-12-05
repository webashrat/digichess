"""
Management command to create chess bots with different skill levels
Usage: python manage.py create_bots
"""
from django.core.management.base import BaseCommand
from django.conf import settings
from accounts.models import User
import os

# Bot definitions: name, rating, avatar emoji, profile_pic (optional)
# Only the three main bots that are shown in the bot list
BOTS = [
    ("JDR", 2000, "🎤", None),  # Specific bot requested
    ("RAJ", 2100, "🎧", None),  # Specific bot requested
    ("DIGI", 2400, "🎰", "digibot.jpg"),  # Specific bot requested with profile pic
]


class Command(BaseCommand):
    help = 'Create chess bots with different skill levels'

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        
        for i, (name, rating, avatar, profile_pic_file) in enumerate(BOTS):
            # Use avatar from bot definition
            bot_avatar = avatar
            
            # Set profile picture URL if file is provided
            profile_pic_url = None
            if profile_pic_file:
                # Check if file exists in media/bots/ directory
                media_bots_dir = os.path.join(settings.MEDIA_ROOT, 'bots')
                profile_pic_path = os.path.join(media_bots_dir, profile_pic_file)
                
                if os.path.exists(profile_pic_path):
                    # Use media URL for profile picture
                    api_base_url = getattr(settings, 'API_BASE_URL', 'http://localhost:8000')
                    media_url = settings.MEDIA_URL
                    profile_pic_url = f"{api_base_url.rstrip('/')}{media_url.rstrip('/')}/bots/{profile_pic_file}"
                else:
                    self.stdout.write(
                        self.style.WARNING(f'Profile picture not found for {name}: {profile_pic_path}')
                    )
            
            # Create unique email and username for bot
            email = f"bot_{name.lower()}@digichess.bot"
            username = f"Bot_{name}"
            
            bot_defaults = {
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
            
            # Add profile pic if available
            if profile_pic_url:
                bot_defaults['profile_pic'] = profile_pic_url
            
            bot, created = User.objects.update_or_create(
                email=email,
                defaults=bot_defaults
            )
            
            # Set a random password (bots don't need to login)
            if created:
                bot.set_password(f"bot_{name.lower()}_password_{rating}")
                bot.save()
                created_count += 1
                pic_info = f" (Profile pic: {profile_pic_url})" if profile_pic_url else ""
                self.stdout.write(
                    self.style.SUCCESS(f'Created bot: {name} (Rating: {rating}){pic_info}')
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

