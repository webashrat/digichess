from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import OTPVerification
from utils.email import send_email_notification

User = get_user_model()


class ResendOTPView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email") or request.query_params.get("email")
        if not email:
            return Response({"detail": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            return Response({"detail": "No account found for this email."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_active:
            return Response({"detail": "Account is already verified."}, status=status.HTTP_400_BAD_REQUEST)

        OTPVerification.objects.filter(
            user=user, purpose=OTPVerification.PURPOSE_REGISTER, verified=False
        ).delete()
        otp = OTPVerification.create_for_user(user, purpose=OTPVerification.PURPOSE_REGISTER)

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
        return Response({"detail": "A new OTP has been sent."}, status=status.HTTP_200_OK)

    def get(self, request):
        # Allow GET with query param for convenience
        return self.post(request)
