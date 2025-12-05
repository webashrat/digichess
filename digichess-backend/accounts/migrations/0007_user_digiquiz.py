from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_merge"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="digiquiz_correct",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="user",
            name="digiquiz_wrong",
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_digiquiz",
            field=models.IntegerField(default=0),
        ),
    ]
