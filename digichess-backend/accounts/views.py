from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_tokens import (
    clear_refresh_cookie,
    create_access_token,
    issue_refresh_session,
    revoke_refresh_session,
    rotate_refresh_session,
    set_refresh_cookie,
)
from .models import RefreshSession
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
    VerifyOTPSerializer,
)

User = get_user_model()


def _auth_response(user, request, status_code=status.HTTP_200_OK):
    access_token = create_access_token(user)
    refresh_token, _ = issue_refresh_session(user, request)
    response = Response(
        {"token": access_token, "user": UserSerializer(user).data},
        status=status_code,
    )
    set_refresh_cookie(response, refresh_token)
    return response


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {"message": "OTP sent to email. Verify to activate your account.", "user": UserSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class VerifyOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.save()
        return _auth_response(data["user"], request)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        data = serializer.save()
        return _auth_response(data["user"], request)


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        refresh_cookie_name = settings.AUTH_REFRESH_COOKIE_NAME
        raw_token = request.COOKIES.get(refresh_cookie_name)
        rotated, error = rotate_refresh_session(raw_token, request)
        if not rotated:
            response = Response(
                {"detail": "Session expired. Please log in again.", "reason": error},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response
        user = rotated["user"]
        response = Response(
            {"token": create_access_token(user), "user": UserSerializer(user).data},
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, rotated["refresh_token"])
        return response


class ProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        raw_token = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        revoke_refresh_session(raw_token, RefreshSession.REVOKED_LOGOUT)
        Token.objects.filter(user=request.user).delete()
        response = Response({"message": "Logged out"}, status=status.HTTP_200_OK)
        clear_refresh_cookie(response)
        return response
