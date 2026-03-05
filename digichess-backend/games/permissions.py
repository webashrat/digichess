from rest_framework.permissions import BasePermission


class IsSuperAdmin(BasePermission):
    """Only allow access to users with is_superuser=True."""

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_superuser
        )
