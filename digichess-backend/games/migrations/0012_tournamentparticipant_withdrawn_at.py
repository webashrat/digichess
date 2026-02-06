from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("games", "0011_gameanalysis"),
    ]

    operations = [
        migrations.AddField(
            model_name="tournamentparticipant",
            name="withdrawn_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
