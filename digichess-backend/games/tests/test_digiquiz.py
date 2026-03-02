from datetime import timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from games.models import (
    DigiQuizAnswer,
    DigiQuizParticipation,
    DigiQuizQuestion,
    DigiQuizRatingHistory,
    DigiQuizRound,
    DigiQuizRoundQuestion,
)
from games.quiz_service import (
    finalize_round,
    join_round,
    materialize_unanswered_penalties,
    speed_points_for_latency,
    submit_answer,
)

User = get_user_model()
IST = ZoneInfo("Asia/Kolkata")


class DigiQuizServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="quiz1@example.com",
            username="quiz_user_1",
            password="pass1234",
            is_active=True,
        )

    def _create_round_with_questions(self, start_at, *, questions_count=20, duration=10):
        round_date = start_at.astimezone(IST).date()
        join_open_at = start_at - timedelta(minutes=10)
        end_at = start_at + timedelta(seconds=questions_count * duration)
        round_obj = DigiQuizRound.objects.create(
            round_date=round_date,
            join_open_at=join_open_at,
            start_at=start_at,
            end_at=end_at,
            status=DigiQuizRound.STATUS_SCHEDULED,
            is_official=False,
            questions_count=questions_count,
            question_duration_seconds=duration,
        )
        for idx in range(questions_count):
            question = DigiQuizQuestion.objects.create(
                source_id=f"TQ-{round_obj.round_date}-{idx+1}",
                tag="test/general",
                question=f"Question {idx+1}?",
                options=["A", "B", "C", "D"],
                answer_index=0,
                answer_text="A",
                is_active=True,
            )
            starts = start_at + timedelta(seconds=idx * duration)
            ends = starts + timedelta(seconds=duration)
            DigiQuizRoundQuestion.objects.create(
                round=round_obj,
                question=question,
                question_no=idx + 1,
                starts_at=starts,
                ends_at=ends,
            )
        return round_obj

    def test_late_join_penalty_is_applied(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(seconds=35))

        participation, created, phase = join_round(
            self.user,
            round_obj=round_obj,
            now=now,
        )

        self.assertTrue(created)
        self.assertEqual(phase, "live")
        self.assertEqual(participation.joined_question_no, 4)
        self.assertEqual(participation.total_points, -15)
        self.assertEqual(participation.wrong_count, 3)
        self.assertEqual(participation.resolved_count, 3)
        self.assertEqual(
            DigiQuizAnswer.objects.filter(
                participation=participation,
                status=DigiQuizAnswer.STATUS_MISSED_LATE,
            ).count(),
            3,
        )

    def test_speed_points_curve(self):
        self.assertEqual(speed_points_for_latency(0), 20)
        self.assertEqual(speed_points_for_latency(999), 20)
        self.assertEqual(speed_points_for_latency(1000), 18)
        self.assertEqual(speed_points_for_latency(2500), 16)
        self.assertEqual(speed_points_for_latency(9000), 2)
        self.assertEqual(speed_points_for_latency(9999), 2)
        self.assertEqual(speed_points_for_latency(10000), 0)

    def test_submit_wrong_answer_deducts_5(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(seconds=2))
        participation, _, _ = join_round(self.user, round_obj=round_obj, now=now)

        answer, participation, already = submit_answer(
            self.user,
            round_obj=round_obj,
            question_no=1,
            selected_index=2,
            now=now,
        )

        self.assertFalse(already)
        self.assertFalse(answer.is_correct)
        self.assertEqual(answer.points, -5)
        self.assertEqual(participation.total_points, -5)
        self.assertEqual(participation.wrong_count, 1)
        self.assertEqual(participation.resolved_count, 1)

    def test_timeout_penalties_materialized_for_unanswered(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(seconds=25))
        participation = DigiQuizParticipation.objects.create(
            round=round_obj,
            user=self.user,
            joined_question_no=1,
        )

        created = materialize_unanswered_penalties(participation, round_obj, now=now)
        participation.refresh_from_db()

        self.assertEqual(created, 2)
        self.assertEqual(participation.total_points, -10)
        self.assertEqual(participation.wrong_count, 2)
        self.assertEqual(
            DigiQuizAnswer.objects.filter(
                participation=participation,
                status=DigiQuizAnswer.STATUS_TIMEOUT,
            ).count(),
            2,
        )

    def test_finalize_updates_user_rating_and_history(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(minutes=12))
        participation = DigiQuizParticipation.objects.create(
            round=round_obj,
            user=self.user,
            joined_question_no=21,
            total_points=-10,
            correct_count=3,
            wrong_count=5,
            resolved_count=8,
        )

        changed = finalize_round(round_obj, now=now)
        self.user.refresh_from_db()
        participation.refresh_from_db()

        self.assertTrue(changed)
        self.assertEqual(self.user.rating_digiquiz, -10)
        self.assertEqual(self.user.digiquiz_correct, 3)
        self.assertEqual(self.user.digiquiz_wrong, 5)
        self.assertTrue(participation.rating_applied)
        history = DigiQuizRatingHistory.objects.get(user=self.user, round=round_obj)
        self.assertEqual(history.rating_before, 0)
        self.assertEqual(history.round_delta, -10)
        self.assertEqual(history.rating_after, -10)


class DigiQuizApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="quiz2@example.com",
            username="quiz_user_2",
            password="pass1234",
            is_active=True,
        )
        self.client.force_authenticate(self.user)

    def _create_round_with_questions(self, start_at, *, questions_count=20, duration=10):
        round_date = start_at.astimezone(IST).date()
        join_open_at = start_at - timedelta(minutes=10)
        end_at = start_at + timedelta(seconds=questions_count * duration)
        round_obj = DigiQuizRound.objects.create(
            round_date=round_date,
            join_open_at=join_open_at,
            start_at=start_at,
            end_at=end_at,
            status=DigiQuizRound.STATUS_SCHEDULED,
            is_official=False,
            questions_count=questions_count,
            question_duration_seconds=duration,
        )
        for idx in range(questions_count):
            question = DigiQuizQuestion.objects.create(
                source_id=f"API-TQ-{round_obj.round_date}-{idx+1}",
                tag="api/general",
                question=f"API Question {idx+1}?",
                options=["A", "B", "C", "D"],
                answer_index=0,
                answer_text="A",
                is_active=True,
            )
            starts = start_at + timedelta(seconds=idx * duration)
            ends = starts + timedelta(seconds=duration)
            DigiQuizRoundQuestion.objects.create(
                round=round_obj,
                question=question,
                question_no=idx + 1,
                starts_at=starts,
                ends_at=ends,
            )
        return round_obj

    def test_join_live_answer_and_standings_api_flow(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(seconds=3))

        join_res = self.client.post(
            "/api/games/digiquiz/join/",
            {"round_date": round_obj.round_date.isoformat()},
            format="json",
        )
        self.assertIn(join_res.status_code, {200, 201})

        question_res = self.client.get(
            f"/api/games/digiquiz/live/question/?round_date={round_obj.round_date.isoformat()}"
        )
        self.assertEqual(question_res.status_code, 200)
        question_no = question_res.data["question"]["question_no"]

        answer_res = self.client.post(
            "/api/games/digiquiz/live/answer/",
            {
                "round_date": round_obj.round_date.isoformat(),
                "question_no": question_no,
                "selected_index": 0,
            },
            format="json",
        )
        self.assertIn(answer_res.status_code, {200, 201})
        self.assertTrue(answer_res.data["answer"]["is_correct"])

        standings_res = self.client.get(
            f"/api/games/digiquiz/live/standings/?date={round_obj.round_date.isoformat()}"
        )
        self.assertEqual(standings_res.status_code, 200)
        self.assertIsNotNone(standings_res.data["your_row"])

    def test_results_api_returns_selected_date(self):
        now = timezone.now()
        round_obj = self._create_round_with_questions(now - timedelta(minutes=20))
        round_obj.finalized_at = now
        round_obj.status = DigiQuizRound.STATUS_FINISHED
        round_obj.save(update_fields=["finalized_at", "status"])
        DigiQuizParticipation.objects.create(
            round=round_obj,
            user=self.user,
            joined_question_no=21,
            total_points=120,
            correct_count=8,
            wrong_count=2,
            resolved_count=10,
            rating_applied=True,
        )

        response = self.client.get(
            f"/api/games/digiquiz/results/?date={round_obj.round_date.isoformat()}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["round"]["round_date"], round_obj.round_date.isoformat())
        self.assertEqual(response.data["rows"][0]["points"], 120)
