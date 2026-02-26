import uuid

from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0011_ratinghistory_recorded_at_source"),
    ]

    operations = [
        migrations.CreateModel(
            name="RefreshSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "revoked_reason",
                    models.CharField(
                        blank=True,
                        choices=[("logout", "Logout"), ("expired", "Expired"), ("inactive", "Inactive")],
                        max_length=16,
                    ),
                ),
                ("user_agent", models.TextField(blank=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="refresh_sessions",
                        to="accounts.user",
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="refreshsession",
            index=models.Index(fields=["user", "revoked_at"], name="accounts_re_user_id_955646_idx"),
        ),
        migrations.AddIndex(
            model_name="refreshsession",
            index=models.Index(fields=["expires_at"], name="accounts_re_expires_cbc72a_idx"),
        ),
        migrations.AddIndex(
            model_name="refreshsession",
            index=models.Index(fields=["last_used_at"], name="accounts_re_last_us_603ffe_idx"),
        ),
    ]
