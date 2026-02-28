from django.core.management.base import BaseCommand, CommandError

from games.quiz_service import DigiQuizServiceError, import_question_bank


class Command(BaseCommand):
    help = "Import DigiQuiz MCQ bank from local JSON file."

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            type=str,
            default="",
            help="Optional path to question bank JSON.",
        )

    def handle(self, *args, **options):
        try:
            result = import_question_bank(options.get("path") or None)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Imported DigiQuiz bank from {result['path']} | "
                    f"loaded={result['loaded']} created={result['created']} updated={result['updated']}"
                )
            )
        except DigiQuizServiceError as exc:
            raise CommandError(str(exc)) from exc
