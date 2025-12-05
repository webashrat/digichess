from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0005_alter_otpverification_purpose"),
        ("accounts", "0005_user_rating_glicko_presence"),
    ]

    operations = []
