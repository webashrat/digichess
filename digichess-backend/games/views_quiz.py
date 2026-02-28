from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .quiz_service import (
    DigiQuizServiceError,
    ensure_round_for_date,
    ensure_round_questions,
    finalize_round,
    get_live_question_payload,
    get_live_standings_payload,
    get_rating_history_payload,
    get_results_payload,
    get_round_state_payload,
    import_question_bank,
    join_round,
    now_ist,
    submit_answer,
)
from .serializers_quiz import (
    DigiQuizJoinSerializer,
    DigiQuizPaginationSerializer,
    DigiQuizSubmitAnswerSerializer,
)


def _error_response(exc: DigiQuizServiceError) -> Response:
    return Response(
        {"detail": str(exc), "code": exc.code},
        status=exc.status_code,
    )


def _auth_user_or_none(request):
    user = getattr(request, "user", None)
    if not user or getattr(user, "is_anonymous", True):
        return None
    return user


class DigiQuizStateView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            data = get_round_state_payload(user=_auth_user_or_none(request), now=timezone.now())
            return Response(data)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizJoinRoundView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DigiQuizJoinSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        round_date = serializer.validated_data.get("round_date")
        round_obj = ensure_round_for_date(round_date) if round_date else None
        try:
            participation, created, phase = join_round(
                request.user,
                round_obj=round_obj,
                now=timezone.now(),
            )
            state = get_round_state_payload(user=request.user, now=timezone.now())
            state["join"] = {
                "created": created,
                "phase": phase,
                "participation_id": participation.id,
                "joined_question_no": participation.joined_question_no,
                "points": participation.total_points,
            }
            return Response(state, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizLiveQuestionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        round_obj = None
        round_date = request.query_params.get("round_date")
        if round_date:
            parsed = DigiQuizJoinSerializer(data={"round_date": round_date})
            parsed.is_valid(raise_exception=True)
            round_obj = ensure_round_for_date(parsed.validated_data["round_date"])
        try:
            payload = get_live_question_payload(
                request.user,
                round_obj=round_obj,
                now=timezone.now(),
            )
            return Response(payload)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizSubmitAnswerView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DigiQuizSubmitAnswerSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        round_date = serializer.validated_data.get("round_date")
        round_obj = ensure_round_for_date(round_date) if round_date else None
        question_no = serializer.validated_data["question_no"]
        selected_index = serializer.validated_data["selected_index"]
        try:
            answer, participation, already_submitted = submit_answer(
                request.user,
                round_obj=round_obj,
                question_no=question_no,
                selected_index=selected_index,
                now=timezone.now(),
            )
            response_payload = {
                "already_submitted": already_submitted,
                "answer": {
                    "question_no": answer.question_no,
                    "selected_index": answer.selected_index,
                    "correct_index": answer.question.answer_index,
                    "is_correct": answer.is_correct,
                    "status": answer.status,
                    "points": answer.points,
                    "latency_ms": answer.latency_ms,
                },
                "participation": {
                    "id": participation.id,
                    "points": participation.total_points,
                    "correct": participation.correct_count,
                    "wrong": participation.wrong_count,
                    "resolved": participation.resolved_count,
                },
            }
            code = status.HTTP_200_OK if already_submitted else status.HTTP_201_CREATED
            return Response(response_payload, status=code)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizLiveStandingsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = DigiQuizPaginationSerializer(data=request.query_params)
        data.is_valid(raise_exception=True)
        round_date = data.validated_data.get("date")
        round_obj = ensure_round_for_date(round_date) if round_date else None
        try:
            payload = get_live_standings_payload(
                round_obj=round_obj,
                user=_auth_user_or_none(request),
                now=timezone.now(),
                limit=data.validated_data["limit"],
            )
            return Response(payload)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizResultsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        data = DigiQuizPaginationSerializer(data=request.query_params)
        data.is_valid(raise_exception=True)
        try:
            payload = get_results_payload(
                round_date=data.validated_data.get("date"),
                page=data.validated_data["page"],
                limit=data.validated_data["limit"],
                user=_auth_user_or_none(request),
                now=timezone.now(),
            )
            return Response(payload)
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizRatingHistoryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            limit = int(request.query_params.get("limit", 90))
        except (TypeError, ValueError):
            limit = 90
        payload = get_rating_history_payload(request.user, limit=limit)
        return Response(payload)


class DigiQuizPrepareRoundView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        serializer = DigiQuizJoinSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        round_date = serializer.validated_data.get("round_date") or now_ist().date()
        round_obj = ensure_round_for_date(round_date)
        try:
            count = ensure_round_questions(round_obj)
            return Response(
                {
                    "detail": "Round prepared.",
                    "round_id": round_obj.id,
                    "round_date": round_obj.round_date.isoformat(),
                    "questions_loaded": count,
                }
            )
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizFinalizeRoundView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        serializer = DigiQuizJoinSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        round_date = serializer.validated_data.get("round_date") or now_ist().date()
        round_obj = ensure_round_for_date(round_date)
        try:
            changed = finalize_round(round_obj, now=timezone.now())
            return Response(
                {
                    "detail": "Round finalized." if changed else "Round not finalized (already finalized or still live).",
                    "round_id": round_obj.id,
                    "round_date": round_obj.round_date.isoformat(),
                    "changed": changed,
                }
            )
        except DigiQuizServiceError as exc:
            return _error_response(exc)


class DigiQuizImportQuestionBankView(APIView):
    permission_classes = [permissions.IsAdminUser]

    def post(self, request):
        path = request.data.get("path")
        try:
            payload = import_question_bank(path)
            return Response(payload)
        except DigiQuizServiceError as exc:
            return _error_response(exc)
