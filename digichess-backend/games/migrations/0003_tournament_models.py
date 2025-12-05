from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0002_game_current_fen"),
        ("accounts", "0004_user_profile_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="Tournament",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("type", models.CharField(choices=[("knockout", "Knockout"), ("round_robin", "Round Robin")], default="knockout", max_length=20)),
                ("time_control", models.CharField(choices=[("bullet", "Bullet"), ("blitz", "Blitz"), ("rapid", "Rapid"), ("classical", "Classical"), ("custom", "Custom")], default="blitz", max_length=20)),
                ("initial_time_seconds", models.IntegerField(default=300)),
                ("increment_seconds", models.IntegerField(default=0)),
                ("start_at", models.DateTimeField()),
                ("status", models.CharField(choices=[("pending", "Pending"), ("active", "Active"), ("completed", "Completed")], default="pending", max_length=20)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("winners", models.JSONField(blank=True, default=list, help_text="List of winner usernames in order")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("creator", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tournaments_created", to="accounts.user")),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="TournamentParticipant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("tournament", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="participants", to="games.tournament")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="tournament_participations", to="accounts.user")),
            ],
            options={
                "ordering": ["joined_at"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="tournamentparticipant",
            unique_together={("tournament", "user")},
        ),
    ]
