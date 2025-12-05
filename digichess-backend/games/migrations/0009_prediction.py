from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0008_delete_matchmakingqueue"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Prediction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("predicted_result", models.CharField(choices=[("white", "White wins"), ("black", "Black wins"), ("draw", "Draw")], max_length=10)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("resolved", models.BooleanField(default=False)),
                ("correct", models.BooleanField(default=False)),
                ("game", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="predictions", to="games.game")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="predictions", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "ordering": ["-created_at"],
                "unique_together": {("user", "game")},
            },
        ),
    ]
