from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_user_profile_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="last_seen_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_blitz_rd",
            field=models.FloatField(default=350.0),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_blitz_vol",
            field=models.FloatField(default=0.06),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_bullet_rd",
            field=models.FloatField(default=350.0),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_bullet_vol",
            field=models.FloatField(default=0.06),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_classical_rd",
            field=models.FloatField(default=350.0),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_classical_vol",
            field=models.FloatField(default=0.06),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_rapid_rd",
            field=models.FloatField(default=350.0),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_rapid_vol",
            field=models.FloatField(default=0.06),
        ),
    ]
