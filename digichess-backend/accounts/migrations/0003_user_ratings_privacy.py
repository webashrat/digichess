from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_username"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="rating_blitz",
            field=models.IntegerField(default=800),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_bullet",
            field=models.IntegerField(default=800),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_classical",
            field=models.IntegerField(default=800),
        ),
        migrations.AddField(
            model_name="user",
            name="rating_rapid",
            field=models.IntegerField(default=800),
        ),
        migrations.AddField(
            model_name="user",
            name="show_friends_public",
            field=models.BooleanField(default=True),
        ),
    ]
