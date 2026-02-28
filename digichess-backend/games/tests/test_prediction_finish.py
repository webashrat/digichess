from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from games.models import Game
from games.models_prediction import Prediction


User = get_user_model()


class PredictionFinishFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.white = User.objects.create_user(
            email="white@example.com",
            username="white_player",
            password="pass1234",
            is_active=True,
        )
        self.black = User.objects.create_user(
            email="black@example.com",
            username="black_player",
            password="pass1234",
            is_active=True,
        )
        self.predictor_correct = User.objects.create_user(
            email="predictor_correct@example.com",
            username="predictor_correct",
            password="pass1234",
            is_active=True,
            rating_digiquiz=42,
            digiquiz_correct=7,
            digiquiz_wrong=3,
        )
        self.predictor_wrong = User.objects.create_user(
            email="predictor_wrong@example.com",
            username="predictor_wrong",
            password="pass1234",
            is_active=True,
            rating_digiquiz=-11,
            digiquiz_correct=2,
            digiquiz_wrong=9,
        )
        self.game = Game.objects.create(
            creator=self.white,
            white=self.white,
            black=self.black,
            time_control=Game.TIME_BLITZ,
            rated=False,
            status=Game.STATUS_ACTIVE,
        )

    def test_finish_resolves_predictions_without_changing_digiquiz_stats(self):
        pred_correct = Prediction.objects.create(
            user=self.predictor_correct,
            game=self.game,
            predicted_result=Prediction.RESULT_WHITE,
        )
        pred_wrong = Prediction.objects.create(
            user=self.predictor_wrong,
            game=self.game,
            predicted_result=Prediction.RESULT_BLACK,
        )

        before_correct = (
            self.predictor_correct.rating_digiquiz,
            self.predictor_correct.digiquiz_correct,
            self.predictor_correct.digiquiz_wrong,
        )
        before_wrong = (
            self.predictor_wrong.rating_digiquiz,
            self.predictor_wrong.digiquiz_correct,
            self.predictor_wrong.digiquiz_wrong,
        )

        self.client.force_authenticate(self.white)
        response = self.client.post(
            f"/api/games/{self.game.id}/finish/",
            {"result": Game.RESULT_WHITE},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        pred_correct.refresh_from_db()
        pred_wrong.refresh_from_db()
        self.assertTrue(pred_correct.resolved)
        self.assertTrue(pred_correct.correct)
        self.assertTrue(pred_wrong.resolved)
        self.assertFalse(pred_wrong.correct)

        self.predictor_correct.refresh_from_db()
        self.predictor_wrong.refresh_from_db()
        self.assertEqual(
            (
                self.predictor_correct.rating_digiquiz,
                self.predictor_correct.digiquiz_correct,
                self.predictor_correct.digiquiz_wrong,
            ),
            before_correct,
        )
        self.assertEqual(
            (
                self.predictor_wrong.rating_digiquiz,
                self.predictor_wrong.digiquiz_correct,
                self.predictor_wrong.digiquiz_wrong,
            ),
            before_wrong,
        )

