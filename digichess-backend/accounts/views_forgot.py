from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .auth_tokens import set_refresh_cookie, create_access_token, issue_refresh_session
from .models import OTPVerification
from .serializers import (
    ForgotPasswordSerializer,
    ForgotUsernameSerializer,
    VerifyForgotOTPSerializer,
    UserSerializer,
)
from utils.email import send_email_notification

User = get_user_model()


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        
        # Create OTP for password reset
        OTPVerification.objects.filter(
            user=user, purpose=OTPVerification.PURPOSE_RESET, verified=False
        ).delete()
        otp = OTPVerification.create_for_user(user, purpose=OTPVerification.PURPOSE_RESET)
        
        send_email_notification(
            "otp",
            user.email,
            {
                "user_name": user.name,
                "username": user.username,
                "code": otp.code,
                "expires_at": otp.expires_at,
                "email": user.email,
            },
        )
        
        # In development, include OTP in response for testing
        from django.conf import settings
        response_data = {
            "message": "OTP sent to your email. Please verify to log in.",
            "email": user.email
        }
        if settings.DEBUG:
            response_data["otp"] = otp.code  # Only in DEBUG mode
        
        return Response(
            response_data,
            status=status.HTTP_200_OK,
        )


class ForgotUsernameView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ForgotUsernameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        
        # Create OTP for username recovery
        OTPVerification.objects.filter(
            user=user, purpose=OTPVerification.PURPOSE_RESET, verified=False
        ).delete()
        otp = OTPVerification.create_for_user(user, purpose=OTPVerification.PURPOSE_RESET)
        
        send_email_notification(
            "otp",
            user.email,
            {
                "user_name": user.name,
                "username": user.username,
                "code": otp.code,
                "expires_at": otp.expires_at,
                "email": user.email,
            },
        )
        
        # In development, include OTP in response for testing
        from django.conf import settings
        response_data = {"message": "OTP sent to your email. Please verify to log in."}
        if settings.DEBUG:
            response_data["otp"] = otp.code  # Only in DEBUG mode
        
        return Response(
            response_data,
            status=status.HTTP_200_OK,
        )


class VerifyForgotOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = VerifyForgotOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.save()
        access_token = create_access_token(data["user"])
        refresh_token, _ = issue_refresh_session(data["user"], request)
        response = Response(
            {"token": access_token, "user": UserSerializer(data["user"]).data},
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, refresh_token)
        return response

