from django.urls import path

from .views import (
    AcceptGameView,
    AbortGameView,
    FinishGameView,
    GameAnalysisView,
    GameDetailView,
    GameListCreateView,
    GameMoveView,
    GameSpectateView,
    RejectGameView,
    GameRematchView,
    GameRematchAcceptView,
    GameRematchRejectView,
    GamePlayerStatusView,
    GameDrawOfferView,
    GameDrawRespondView,
    GameResignView,
    GameClaimDrawView,
)
from .views_analysis import (
    GameFullAnalysisView,
    GameAnalysisRequestView,
    OpeningExplorerView,
    TablebaseView,
)
from .views_public import PublicGamesListView
from .views_user_games import UserGamesView
from .views_tournament import (
    TournamentDetailView,
    TournamentFinishView,
    TournamentListCreateView,
    TournamentRegisterView,
    TournamentStartView,
    TournamentStandingsView,
    TournamentPairingsView,
)
from .views_matchmaking import EnqueueView, CancelQueueView, QueueStatusView
from .views_public_clock import LiveClockView
from .views_prediction import PredictionCreateView
from .views_leaderboard import RatingLeaderboardView, DigiQuizLeaderboardView
from .views_bot import BotListView, CreateBotGameView
from .views_puzzle import DailyPuzzleView, PuzzleView, NextPuzzleView, PuzzleBatchView
from .views_optimistic import OptimisticMoveView

urlpatterns = [
    path("", GameListCreateView.as_view(), name="games"),
    path("public/", PublicGamesListView.as_view(), name="games-public"),
    path("<int:pk>/", GameDetailView.as_view(), name="game-detail"),
    path("<int:pk>/move/", GameMoveView.as_view(), name="game-move"),
    path("<int:pk>/move/optimistic/", OptimisticMoveView.as_view(), name="game-move-optimistic"),
    path("<int:pk>/finish/", FinishGameView.as_view(), name="game-finish"),
    path("<int:pk>/analysis/", GameAnalysisView.as_view(), name="game-analysis"),
    path("<int:pk>/analysis/full/", GameFullAnalysisView.as_view(), name="game-full-analysis"),
    path("<int:pk>/analysis/request/", GameAnalysisRequestView.as_view(), name="game-analysis-request"),
    path("opening-explorer/", OpeningExplorerView.as_view(), name="opening-explorer"),
    path("tablebase/", TablebaseView.as_view(), name="tablebase"),
    path("<int:pk>/spectate/", GameSpectateView.as_view(), name="game-spectate"),
    path("<int:pk>/offer-draw/", GameDrawOfferView.as_view(), name="game-offer-draw"),
    path("<int:pk>/respond-draw/", GameDrawRespondView.as_view(), name="game-respond-draw"),
    path("<int:pk>/resign/", GameResignView.as_view(), name="game-resign"),
    path("<int:pk>/abort/", AbortGameView.as_view(), name="game-abort"),
    path("<int:pk>/claim-draw/", GameClaimDrawView.as_view(), name="game-claim-draw"),
    path("<int:pk>/accept/", AcceptGameView.as_view(), name="game-accept"),
    path("<int:pk>/reject/", RejectGameView.as_view(), name="game-reject"),
    path("<int:pk>/rematch/", GameRematchView.as_view(), name="game-rematch"),
    path("<int:pk>/rematch/accept/", GameRematchAcceptView.as_view(), name="game-rematch-accept"),
    path("<int:pk>/rematch/reject/", GameRematchRejectView.as_view(), name="game-rematch-reject"),
    path("<int:pk>/player-status/", GamePlayerStatusView.as_view(), name="game-player-status"),
    path("tournaments/", TournamentListCreateView.as_view(), name="tournaments"),
    path("tournaments/<int:pk>/", TournamentDetailView.as_view(), name="tournament-detail"),
    path("tournaments/<int:pk>/register/", TournamentRegisterView.as_view(), name="tournament-register"),
    path("tournaments/<int:pk>/start/", TournamentStartView.as_view(), name="tournament-start"),
    path("tournaments/<int:pk>/finish/", TournamentFinishView.as_view(), name="tournament-finish"),
    path("tournaments/<int:pk>/standings/", TournamentStandingsView.as_view(), name="tournament-standings"),
    path("tournaments/<int:pk>/pairings/", TournamentPairingsView.as_view(), name="tournament-pairings"),
    path("matchmaking/enqueue/", EnqueueView.as_view(), name="mm-enqueue"),
    path("matchmaking/cancel/", CancelQueueView.as_view(), name="mm-cancel"),
    path("matchmaking/status/", QueueStatusView.as_view(), name="mm-status"),
    path("<int:pk>/clock/", LiveClockView.as_view(), name="game-clock"),
    path("<int:game_id>/predict/", PredictionCreateView.as_view(), name="game-predict"),
    path("leaderboard/ratings/", RatingLeaderboardView.as_view(), name="leaderboard-ratings"),
    path("leaderboard/digiquiz/", DigiQuizLeaderboardView.as_view(), name="leaderboard-digiquiz"),
    path("user/<str:username>/", UserGamesView.as_view(), name="user-games"),
    path("bots/", BotListView.as_view(), name="bots-list"),
    path("bots/create-game/", CreateBotGameView.as_view(), name="bot-create-game"),
    path("puzzles/daily/", DailyPuzzleView.as_view(), name="puzzle-daily"),
    path("puzzles/<str:puzzle_id>/", PuzzleView.as_view(), name="puzzle-detail"),
    path("puzzles/next/", NextPuzzleView.as_view(), name="puzzle-next"),
    path("puzzles/batch/<str:angle>/", PuzzleBatchView.as_view(), name="puzzle-batch"),
]
