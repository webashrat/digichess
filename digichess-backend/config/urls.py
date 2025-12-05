from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static
from .views import healthz, readyz

urlpatterns = [
    path("admin/", admin.site.urls),
    path("healthz", healthz, name="healthz"),
    path("readyz", readyz, name="readyz"),
    path("api/accounts/", include("accounts.urls")),
    path("api/public/accounts/", include("accounts.urls_public")),
    path("api/social/", include("social.urls")),
    path("api/games/", include("games.urls")),
    path("api/notifications/", include("notifications.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
