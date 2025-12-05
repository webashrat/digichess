from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0005_matchmaking_queue"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournament",
            name="arena_duration_minutes",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tournament",
            name="current_round",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="tournament",
            name="swiss_rounds",
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="tournament",
            name="type",
            field=models.CharField(
                choices=[
                    ("knockout", "Knockout"),
                    ("round_robin", "Round Robin"),
                    ("arena", "Arena"),
                    ("swiss", "Swiss"),
                ],
                default="knockout",
                max_length=20,
            ),
        ),
    ]
