"""
Anti-cheat API views.

User-facing:
  - POST reports/         Submit a cheat report (authenticated)

Super-admin-facing:
  - GET  reports/         List all reports
  - GET  reports/{id}/    Report detail + analysis
  - POST reports/{id}/analyze/   Run cheat analysis
  - POST reports/{id}/resolve/   Resolve report (saves training label)
  - GET  irwin/status/    Irwin model status
  - POST irwin/train/     Train Irwin model
"""

import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .irwin_imports import save_single_import_sample
from .models import CheatReport, CheatAnalysis, IrwinImportJob, IrwinTrainingData
from .permissions import IsSuperAdmin
from .serializers_anticheat import (
    CheatReportCreateSerializer,
    CheatReportSerializer,
    CheatAnalysisSerializer,
    ResolveReportSerializer,
    IrwinStatusSerializer,
    IrwinTrainingDataSerializer,
    SingleIrwinImportSerializer,
    IrwinCsvUploadSerializer,
    IrwinImportJobSerializer,
)

logger = logging.getLogger(__name__)

IRWIN_TRAINING_THRESHOLD = 100


class CheatReportListCreateView(APIView):
    """
    POST (authenticated)  → submit a new cheat report
    GET  (super-admin)    → list all reports with optional ?status= filter
    """

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return [IsSuperAdmin()]

    def post(self, request):
        serializer = CheatReportCreateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        return Response(
            CheatReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )

    def get(self, request):
        qs = CheatReport.objects.select_related(
            "reporter", "reported_user", "resolved_by", "game",
            "game__white", "game__black",
        ).prefetch_related("analysis")

        filter_status = request.query_params.get("status")
        if filter_status:
            qs = qs.filter(status=filter_status)

        reports = qs[:200]
        return Response(CheatReportSerializer(reports, many=True).data)


class CheatReportDetailView(APIView):
    """GET report detail (super-admin)."""

    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        report = get_object_or_404(
            CheatReport.objects.select_related(
                "reporter", "reported_user", "resolved_by", "game",
                "game__white", "game__black",
            ).prefetch_related("analysis"),
            pk=pk,
        )
        return Response(CheatReportSerializer(report).data)


class RunCheatAnalysisView(APIView):
    """POST trigger analysis on a report (super-admin)."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        report = get_object_or_404(CheatReport, pk=pk)

        if report.status == CheatReport.STATUS_PENDING:
            report.status = CheatReport.STATUS_UNDER_REVIEW
            report.save(update_fields=["status"])

        from .cheat_detection import run_cheat_analysis

        try:
            result = run_cheat_analysis(report.game, report.reported_user)
        except Exception as exc:
            logger.error("Cheat analysis failed for report %s: %s", pk, exc)
            return Response(
                {"detail": f"Analysis failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        irwin_score = None
        try:
            from .irwin_model import irwin
            if irwin.is_trained() and result.get("tensor_data"):
                irwin_score = irwin.predict(result["tensor_data"])
        except Exception as exc:
            logger.warning("Irwin prediction skipped: %s", exc)

        analysis, _created = CheatAnalysis.objects.update_or_create(
            report=report,
            defaults={
                "game": report.game,
                "analyzed_user": report.reported_user,
                "t1_pct": result["t1_pct"],
                "t2_pct": result["t2_pct"],
                "t3_pct": result["t3_pct"],
                "t4_pct": result["t4_pct"],
                "t5_pct": result["t5_pct"],
                "avg_centipawn_loss": result["avg_centipawn_loss"],
                "avg_winning_chances_loss": result["avg_winning_chances_loss"],
                "best_move_streak": result["best_move_streak"],
                "accuracy_score": result["accuracy_score"],
                "position_stats": result["position_stats"],
                "move_classifications": result["move_classifications"],
                "forced_moves_excluded": result["forced_moves_excluded"],
                "book_moves_excluded": result["book_moves_excluded"],
                "cp_loss_distribution": result["cp_loss_distribution"],
                "suspicious_moves": result["suspicious_moves"],
                "irwin_score": irwin_score,
                "verdict": result["verdict"],
                "confidence": result["confidence"],
                "total_moves_analyzed": result["total_moves_analyzed"],
                "full_analysis": result.get("tensor_data"),
            },
        )

        return Response(CheatAnalysisSerializer(analysis).data)


class ResolveCheatReportView(APIView):
    """POST resolve a report – also saves Irwin training data."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        report = get_object_or_404(CheatReport, pk=pk)
        serializer = ResolveReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resolution = serializer.validated_data["resolution"]
        admin_notes = serializer.validated_data.get("admin_notes", "")

        report.status = resolution
        report.resolved_by = request.user
        report.resolved_at = timezone.now()
        report.admin_notes = admin_notes
        report.save(update_fields=["status", "resolved_by", "resolved_at", "admin_notes"])

        if resolution in (CheatReport.STATUS_RESOLVED_CLEAN, CheatReport.STATUS_RESOLVED_CHEATING):
            is_cheating = resolution == CheatReport.STATUS_RESOLVED_CHEATING
            analysis = getattr(report, "analysis", None)
            tensor_data = analysis.full_analysis if analysis else None

            if tensor_data:
                IrwinTrainingData.objects.update_or_create(
                    game=report.game,
                    player=report.reported_user,
                    defaults={
                        "label": is_cheating,
                        "tensor_data": tensor_data,
                        "source_type": IrwinTrainingData.SOURCE_REPORT_RESOLUTION,
                        "suspect_color": (
                            IrwinTrainingData.COLOR_WHITE
                            if report.game.white_id == report.reported_user_id
                            else IrwinTrainingData.COLOR_BLACK
                        ),
                        "moves_text": (report.game.moves or "").strip(),
                        "start_fen": report.game.START_FEN,
                        "move_times_seconds": [
                            round(ms / 1000.0, 3)
                            for ms in (report.game.move_times_ms or [])
                            if isinstance(ms, (int, float))
                        ],
                        "move_format": IrwinTrainingData.FORMAT_SAN,
                        "source_ref": f"report:{report.id}",
                        "notes": admin_notes,
                        "import_job": None,
                        "import_row_number": None,
                        "labeled_by": request.user,
                    },
                )

        return Response(CheatReportSerializer(report).data)


class IrwinStatusView(APIView):
    """GET Irwin model status (super-admin)."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        from .irwin_model import irwin, MODEL_PATH

        total = IrwinTrainingData.objects.count()
        cheating = IrwinTrainingData.objects.filter(label=True).count()
        clean = total - cheating

        data = {
            "is_trained": irwin.is_trained(),
            "labeled_count": total,
            "cheating_count": cheating,
            "clean_count": clean,
            "training_threshold": IRWIN_TRAINING_THRESHOLD,
            "ready_to_train": total >= IRWIN_TRAINING_THRESHOLD,
            "model_path": str(MODEL_PATH) if irwin.is_trained() else "",
        }
        return Response(IrwinStatusSerializer(data).data)


class IrwinSingleImportView(APIView):
    """POST import a single external game into Irwin training data."""

    permission_classes = [IsSuperAdmin]

    def post(self, request):
        serializer = SingleIrwinImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            sample = save_single_import_sample(
                labeled_by=request.user,
                moves_text=serializer.validated_data["moves"],
                suspect_color=serializer.validated_data["suspect_color"],
                label=serializer.validated_data["label"],
                move_times_seconds=serializer.validated_data.get("move_times_seconds", ""),
                start_fen=serializer.validated_data.get("start_fen", ""),
                move_format=serializer.validated_data.get(
                    "move_format", IrwinTrainingData.FORMAT_AUTO
                ),
                source_ref=serializer.validated_data.get("source_ref", ""),
                external_id=serializer.validated_data.get("external_id", ""),
                notes=serializer.validated_data.get("notes", ""),
                source_type=IrwinTrainingData.SOURCE_SINGLE_IMPORT,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.error("Single Irwin import failed: %s", exc)
            return Response(
                {"detail": f"Import failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            IrwinTrainingDataSerializer(sample).data,
            status=status.HTTP_201_CREATED,
        )


class IrwinImportJobListCreateView(APIView):
    """GET recent CSV jobs, POST a new CSV import job."""

    permission_classes = [IsSuperAdmin]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        jobs = IrwinImportJob.objects.select_related("uploaded_by")[:50]
        return Response(IrwinImportJobSerializer(jobs, many=True).data)

    def post(self, request):
        serializer = IrwinCsvUploadSerializer(data=request.data, context={})
        serializer.is_valid(raise_exception=True)

        file_obj = serializer.validated_data["file"]
        csv_content = serializer.context["csv_content"]
        row_count = serializer.context["row_count"]

        job = IrwinImportJob.objects.create(
            upload_type=IrwinImportJob.TYPE_CSV,
            status=IrwinImportJob.STATUS_QUEUED,
            file_name=file_obj.name,
            csv_content=csv_content,
            total_rows=row_count,
            detail="Queued for processing.",
            uploaded_by=request.user,
        )

        from .tasks import process_irwin_csv_import_job

        process_irwin_csv_import_job.delay(job.id)

        return Response(
            IrwinImportJobSerializer(job).data,
            status=status.HTTP_201_CREATED,
        )


class IrwinImportJobDetailView(APIView):
    """GET one CSV import job."""

    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        job = get_object_or_404(
            IrwinImportJob.objects.select_related("uploaded_by"),
            pk=pk,
        )
        return Response(IrwinImportJobSerializer(job).data)


class IrwinTrainView(APIView):
    """POST trigger Irwin model training (super-admin)."""

    permission_classes = [IsSuperAdmin]

    def post(self, request):
        total = IrwinTrainingData.objects.count()
        if total < IRWIN_TRAINING_THRESHOLD:
            return Response(
                {
                    "detail": f"Need at least {IRWIN_TRAINING_THRESHOLD} labeled games. "
                    f"Currently have {total}."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .irwin_model import irwin

        records = list(
            IrwinTrainingData.objects.values("tensor_data", "label")
        )
        training_data = [
            {"tensor_data": r["tensor_data"], "label": r["label"]}
            for r in records
        ]

        epochs = int(request.data.get("epochs", 80))
        try:
            metrics = irwin.train(training_data, epochs=epochs)
        except Exception as exc:
            logger.error("Irwin training failed: %s", exc)
            return Response(
                {"detail": f"Training failed: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({"detail": "Training complete", "metrics": metrics})
