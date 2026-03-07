import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("games", "0016_game_move_times_ms"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="IrwinImportJob",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "upload_type",
                    models.CharField(
                        choices=[("csv", "CSV Upload")],
                        default="csv",
                        max_length=20,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("queued", "Queued"),
                            ("processing", "Processing"),
                            ("completed", "Completed"),
                            ("failed", "Failed"),
                        ],
                        default="queued",
                        max_length=20,
                    ),
                ),
                ("file_name", models.CharField(max_length=255)),
                ("csv_content", models.TextField(blank=True)),
                ("total_rows", models.IntegerField(default=0)),
                ("processed_rows", models.IntegerField(default=0)),
                ("imported_rows", models.IntegerField(default=0)),
                ("failed_rows", models.IntegerField(default=0)),
                ("row_errors", models.JSONField(blank=True, default=list)),
                ("detail", models.TextField(blank=True)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="irwin_import_jobs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.AlterField(
            model_name="irwintrainingdata",
            name="game",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="irwin_training",
                to="games.game",
            ),
        ),
        migrations.AlterField(
            model_name="irwintrainingdata",
            name="player",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="irwin_training",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="external_id",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="import_job",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="samples",
                to="games.irwinimportjob",
            ),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="import_row_number",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="move_format",
            field=models.CharField(
                choices=[
                    ("auto", "Auto"),
                    ("pgn", "PGN"),
                    ("san", "SAN"),
                    ("uci", "UCI"),
                ],
                default="auto",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="move_times_seconds",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="moves_text",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="notes",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="source_ref",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="source_type",
            field=models.CharField(
                choices=[
                    ("report_resolution", "Report Resolution"),
                    ("single_import", "Single Import"),
                    ("csv_import", "CSV Import"),
                ],
                default="report_resolution",
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="start_fen",
            field=models.TextField(
                blank=True,
                default="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                help_text="Blank in the UI maps to the standard chess starting position.",
            ),
        ),
        migrations.AddField(
            model_name="irwintrainingdata",
            name="suspect_color",
            field=models.CharField(
                blank=True,
                choices=[("white", "White"), ("black", "Black")],
                default="",
                max_length=10,
            ),
        ),
    ]
