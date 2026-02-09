from django.db import migrations, models
from django.utils import timezone
from django.db.models import F


def backfill_recorded_at(apps, schema_editor):
    RatingHistory = apps.get_model("accounts", "RatingHistory")
    RatingHistory.objects.update(recorded_at=F("created_at"))


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0010_add_bot_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="ratinghistory",
            name="recorded_at",
            field=models.DateTimeField(default=timezone.now),
        ),
        migrations.AddField(
            model_name="ratinghistory",
            name="source",
            field=models.CharField(
                choices=[("game", "Game"), ("daily", "Daily")],
                default="game",
                max_length=20,
            ),
        ),
        migrations.AlterModelOptions(
            name="ratinghistory",
            options={"ordering": ["-recorded_at"]},
        ),
        migrations.AlterUniqueTogether(
            name="ratinghistory",
            unique_together=set(),
        ),
        migrations.AddIndex(
            model_name="ratinghistory",
            index=models.Index(fields=["user", "mode", "-recorded_at"], name="accounts_ra_user_id_mode_recorded_at_idx"),
        ),
        migrations.RunPython(backfill_recorded_at, migrations.RunPython.noop),
    ]
