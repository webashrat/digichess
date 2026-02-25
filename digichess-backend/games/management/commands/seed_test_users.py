from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone
from rest_framework.authtoken.models import Token

User = get_user_model()


class Command(BaseCommand):
    help = "Create/update active users for e2e, stress, and load tests."

    def add_arguments(self, parser):
        parser.add_argument(
            "--prefix",
            type=str,
            default="testuser",
            help="Username prefix (default: testuser).",
        )
        parser.add_argument(
            "--domain",
            type=str,
            default="load.test",
            help="Email domain (default: load.test).",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=20,
            help="How many users to seed (default: 20).",
        )
        parser.add_argument(
            "--password",
            type=str,
            default="Pass1234!",
            help="Password for all seeded users.",
        )
        parser.add_argument(
            "--include-creator",
            action="store_true",
            help="Also create/update a dedicated creator account '<prefix>_creator'.",
        )

    def _upsert_user(self, username: str, email: str, password: str):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "is_active": True,
            },
        )
        if created:
            user.set_password(password)
            user.is_active = True
            user.is_online = False
            user.last_seen_at = timezone.now()
            user.save(
                update_fields=["password", "is_active", "is_online", "last_seen_at"]
            )
        else:
            updates = []
            if user.email != email:
                user.email = email
                updates.append("email")
            if not user.is_active:
                user.is_active = True
                updates.append("is_active")
            user.set_password(password)
            updates.append("password")
            if updates:
                user.save(update_fields=updates)
        token, _ = Token.objects.get_or_create(user=user)
        return user, token

    def handle(self, *args, **options):
        prefix = options["prefix"].strip()
        domain = options["domain"].strip()
        count = max(1, options["count"])
        password = options["password"]
        include_creator = options["include_creator"]

        created_count = 0
        updated_count = 0
        rows = []

        if include_creator:
            creator_username = f"{prefix}_creator"
            creator_email = f"{creator_username}@{domain}"
            creator, creator_token = self._upsert_user(
                creator_username, creator_email, password
            )
            rows.append((creator.username, creator.email, creator_token.key))

        for index in range(1, count + 1):
            username = f"{prefix}_{index:03d}"
            email = f"{username}@{domain}"
            existed = User.objects.filter(username=username).exists()
            user, token = self._upsert_user(username, email, password)
            rows.append((user.username, user.email, token.key))
            if existed:
                updated_count += 1
            else:
                created_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded users. created={created_count} updated={updated_count} total={len(rows)}"
            )
        )
        self.stdout.write("username,email,token")
        for username, email, token in rows:
            self.stdout.write(f"{username},{email},{token}")
