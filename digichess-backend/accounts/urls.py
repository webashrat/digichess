from django.urls import path

from .views import LoginView, LogoutView, ProfileView, RegisterView, VerifyOTPView
from .views_resend import ResendOTPView
from .views_presence import PingView
from .views_forgot import ForgotPasswordView, ForgotUsernameView, VerifyForgotOTPView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-otp/", VerifyOTPView.as_view(), name="verify-otp"),
    path("resend-otp/", ResendOTPView.as_view(), name="resend-otp"),
    path("login/", LoginView.as_view(), name="login"),
    path("forgot-password/", ForgotPasswordView.as_view(), name="forgot-password"),
    path("forgot-username/", ForgotUsernameView.as_view(), name="forgot-username"),
    path("verify-forgot-otp/", VerifyForgotOTPView.as_view(), name="verify-forgot-otp"),
    path("me/", ProfileView.as_view(), name="me"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("ping/", PingView.as_view(), name="ping"),
]
