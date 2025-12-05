import secrets
import string
from datetime import timedelta

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone
from django.conf import settings


def _generate_otp(length: int = 6) -> str:
    digits = string.digits
    return "".join(secrets.choice(digits) for _ in range(length))


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        username = extra_fields.get("username")
        if not username:
            raise ValueError("Username is required")
        normalized_email = self.normalize_email(email)
        user = self.model(email=normalized_email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    username = models.CharField(max_length=50, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    nickname = models.CharField(max_length=100, blank=True)
    bio = models.TextField(blank=True)
    country = models.CharField(max_length=100, default="INTERNATIONAL")
    profile_pic = models.TextField(null=True, blank=True)
    social_links = models.JSONField(default=list, blank=True)
    is_online = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    rating_bullet = models.IntegerField(default=800)
    rating_blitz = models.IntegerField(default=800)
    rating_rapid = models.IntegerField(default=800)
    rating_classical = models.IntegerField(default=800)
    rating_bullet_rd = models.FloatField(default=350.0)
    rating_blitz_rd = models.FloatField(default=350.0)
    rating_rapid_rd = models.FloatField(default=350.0)
    rating_classical_rd = models.FloatField(default=350.0)
    rating_bullet_vol = models.FloatField(default=0.06)
    rating_blitz_vol = models.FloatField(default=0.06)
    rating_rapid_vol = models.FloatField(default=0.06)
    rating_classical_vol = models.FloatField(default=0.06)
    rating_digiquiz = models.IntegerField(default=0)
    digiquiz_correct = models.IntegerField(default=0)
    digiquiz_wrong = models.IntegerField(default=0)
    show_friends_public = models.BooleanField(default=True)
    is_active = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    is_bot = models.BooleanField(default=False)
    bot_avatar = models.CharField(max_length=100, blank=True, null=True)  # Emoji or avatar identifier
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: list[str] = ["username"]

    objects = UserManager()

    def __str__(self):
        return self.email

    @property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.email


class OTPVerification(models.Model):
    PURPOSE_REGISTER = "register"
    PURPOSE_LOGIN = "login"
    PURPOSE_RESET = "reset"

    PURPOSE_CHOICES = [
        (PURPOSE_REGISTER, "Register"),
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_RESET, "Reset Password"),
    ]

    user = models.ForeignKey(
        User, related_name="otp_codes", on_delete=models.CASCADE
    )
    code = models.CharField(max_length=6)
    purpose = models.CharField(
        max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_REGISTER
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    verified = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["code", "purpose"]),
        ]

    def mark_verified(self):
        self.verified = True
        self.save(update_fields=["verified"])

    @classmethod
    def create_for_user(cls, user: User, purpose: str = PURPOSE_REGISTER):
        expiry_minutes = getattr(settings, "OTP_EXPIRY_MINUTES", 10)
        now = timezone.now()
        return cls.objects.create(
            user=user,
            code=_generate_otp(),
            purpose=purpose,
            expires_at=now + timedelta(minutes=expiry_minutes),
        )

    def is_valid(self) -> bool:
        return not self.verified and timezone.now() <= self.expires_at

    def __str__(self):
        return f"OTP for {self.user.email} ({self.purpose})"


# Import RatingHistory model
from .models_rating_history import RatingHistory
