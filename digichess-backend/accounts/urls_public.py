from django.urls import path

from .views_public import PublicUserDetailView, PublicUsersListView
from .views_rating_history import UserRatingHistoryView

urlpatterns = [
    path("", PublicUsersListView.as_view(), name="public-users"),
    path("<str:username>/rating-history/", UserRatingHistoryView.as_view(), name="user-rating-history"),
    path("<str:username>/", PublicUserDetailView.as_view(), name="public-user-detail"),
]
