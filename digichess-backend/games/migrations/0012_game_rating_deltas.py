from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0011_gameanalysis"),
    ]

    operations = [
        migrations.AddField(
            model_name="game",
            name="white_rating_delta",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="game",
            name="black_rating_delta",
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
