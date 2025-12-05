from django.conf import settings
from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework.authtoken.models import Token

from .models import OTPVerification, User
from utils.email import send_email_notification


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "username",
            "nickname",
            "bio",
            "country",
            "profile_pic",
            "social_links",
            "first_name",
            "last_name",
            "date_joined",
            "is_online",
            "is_bot",
            "bot_avatar",
            "rating_bullet",
            "rating_blitz",
            "rating_rapid",
            "rating_classical",
            "rating_bullet_rd",
            "rating_blitz_rd",
            "rating_rapid_rd",
            "rating_classical_rd",
            "rating_bullet_vol",
            "rating_blitz_vol",
            "rating_rapid_vol",
            "rating_classical_vol",
            "rating_digiquiz",
            "digiquiz_correct",
            "digiquiz_wrong",
            "show_friends_public",
            "last_seen_at",
        )
        read_only_fields = ("id", "date_joined")

    def validate_email(self, value):
        email = value.lower()
        user = self.instance
        if user and user.email.lower() == email:
            return email
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_username(self, value):
        username = value.strip()
        user = self.instance
        if user and user.username and user.username.lower() == username.lower():
            return user.username
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("An account with this username already exists.")
        return username

    def validate_profile_pic(self, value):
        if value:
            lowered = value.lower()
            # Allow data URLs for inline uploads
            if lowered.startswith("data:image/jpeg") or lowered.startswith("data:image/jpg") or lowered.startswith("data:image/png"):
                return value
            if not (lowered.endswith(".jpg") or lowered.endswith(".jpeg") or lowered.endswith(".png")):
                raise serializers.ValidationError("Profile pic must be a jpg or png URL.")
        return value

    def validate_social_links(self, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError("social_links must be a list.")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Each social link must be an object with label and url.")
            label = item.get("label") or item.get("title") or ""
            url = item.get("url") or ""
            if not url:
                continue
            cleaned.append({"label": label.strip(), "url": url.strip()})
        return cleaned


class UserLookupSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "first_name", "last_name", "profile_pic", "username", "country", "is_bot")


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = (
            "email",
            "username",
            "password",
            "first_name",
            "last_name",
            "nickname",
            "bio",
            "country",
            "profile_pic",
            "social_links",
        )
        extra_kwargs = {"first_name": {"required": False}, "last_name": {"required": False}}

    def validate_email(self, value):
        email = value.lower()
        if User.objects.filter(email=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_username(self, value):
        username = value.strip()
        if not username:
            raise serializers.ValidationError("Username is required.")
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("An account with this username already exists.")
        return username

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(**validated_data, password=password, is_active=False)

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
        return user


class VerifyOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        email = attrs["email"].lower()
        code = attrs["code"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found for this email.")

        otp = (
            OTPVerification.objects.filter(
                user=user, code=code, purpose=OTPVerification.PURPOSE_REGISTER, verified=False
            )
            .order_by("-created_at")
            .first()
        )
        if otp is None or not otp.is_valid():
            raise serializers.ValidationError("Invalid or expired code.")

        attrs["user"] = user
        attrs["otp"] = otp
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        otp = self.validated_data["otp"]

        otp.mark_verified()
        user.is_active = True
        user.save(update_fields=["is_active"])

        token, _ = Token.objects.get_or_create(user=user)
        return {"user": user, "token": token.key}


class LoginSerializer(serializers.Serializer):
    email = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        identifier = attrs.get("email") or attrs.get("username")
        if not identifier:
            raise serializers.ValidationError({"email": ["Email or username is required."]})
        
        password = attrs.get("password")
        identifier = identifier.strip()
        
        # Try to authenticate by email first (if it looks like an email)
        user = None
        if "@" in identifier:
            try:
                user = authenticate(request=self.context.get("request"), email=identifier.lower(), password=password)
            except:
                pass
        
        # If email auth failed or it's not an email, try username
        if not user:
            try:
                user = User.objects.get(username__iexact=identifier)
                if not user.check_password(password):
                    user = None
            except User.DoesNotExist:
                user = None
        
        if not user:
            raise serializers.ValidationError("Invalid credentials.")
        if not user.is_active:
            raise serializers.ValidationError("Account is not verified yet.")
        attrs["user"] = user
        return attrs

    def create(self, validated_data):
        user = validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return {"user": user, "token": token.key}


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.CharField(required=False, allow_blank=True)
    username = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        identifier = attrs.get("email") or attrs.get("username")
        if not identifier:
            raise serializers.ValidationError({"email": ["Email or username is required."]})
        
        identifier = identifier.strip()
        user = None
        
        # Try to find user by email or username
        if "@" in identifier:
            try:
                user = User.objects.get(email__iexact=identifier.lower())
            except User.DoesNotExist:
                pass
        else:
            try:
                user = User.objects.get(username__iexact=identifier)
            except User.DoesNotExist:
                pass
        
        if not user:
            raise serializers.ValidationError("No such account with that username or email exists.")
        
        attrs["user"] = user
        return attrs


class ForgotUsernameSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate(self, attrs):
        email = attrs["email"].lower()
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("No such account with that email exists.")
        
        attrs["user"] = user
        return attrs


class VerifyForgotOTPSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        email = attrs["email"].lower()
        code = attrs["code"]

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("No account found for this email.")

        otp = (
            OTPVerification.objects.filter(
                user=user, code=code, purpose=OTPVerification.PURPOSE_RESET, verified=False
            )
            .order_by("-created_at")
            .first()
        )
        if otp is None or not otp.is_valid():
            raise serializers.ValidationError("Invalid or expired code.")

        attrs["user"] = user
        attrs["otp"] = otp
        return attrs

    def save(self, **kwargs):
        user = self.validated_data["user"]
        otp = self.validated_data["otp"]

        otp.mark_verified()
        token, _ = Token.objects.get_or_create(user=user)
        return {"user": user, "token": token.key}
