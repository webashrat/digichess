from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0012_game_rating_deltas"),
    ]

    operations = [
        migrations.AddField(
            model_name="game",
            name="rematch_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
