from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0006_tournament_arena_swiss_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="TournamentGame",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("round_number", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("game", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tournament_entry", to="games.game")),
                ("tournament", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tournament_games", to="games.tournament")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
