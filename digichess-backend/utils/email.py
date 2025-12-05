import os
from typing import Any, Dict, Tuple
import sys
import urllib.parse

from django.conf import settings
from django.core.mail import send_mail
import requests


DEFAULTS = {
    "site_name": "DigiChess",
    "frontend_url": getattr(settings, "FRONTEND_URL", os.getenv("FRONTEND_URL", "https://digichess.local")),
    "support_email": settings.DEFAULT_FROM_EMAIL,
}


def _format_dt(dt: Any) -> str:
    try:
        return dt.astimezone().strftime("%Y-%m-%d %H:%M %Z")
    except Exception:
        return str(dt)


def _render(template_key: str, context: Dict[str, Any]) -> Tuple[str, str, str]:
    ctx = {**DEFAULTS, **context}
    templates = {
        "otp": {
            "subject": "Verify your {site_name} account",
            "text": (
                "Hi {user_name},\n\n"
                "Username: {username}\n"
                "Use this code to verify your account: {code}\n"
                "It expires at {expires_at}.\n\n"
                "Need a new code? {resend_link}\n\n"
                "If you didn't request this, ignore this email.\n\n"
                "{site_name} • {frontend_url}"
            ),
            "html": (
                "<div style=\"font-family:Arial,sans-serif;line-height:1.5;max-width:520px\">"
                "<h2 style=\"margin:0 0 12px;color:#111\">Verify your account</h2>"
                "<p style=\"margin:0 0 12px\">Hi {user_name},</p>"
                "<p style=\"margin:0 0 12px\">Username: <strong>{username}</strong></p>"
                "<p style=\"margin:0 0 12px\">Use this code to verify your DigiChess account:</p>"
                "<div style=\"font-size:24px;font-weight:bold;letter-spacing:2px;"
                "padding:12px 16px;border:1px solid #ddd;border-radius:6px;"
                "display:inline-block;background:#f8f8f8;color:#111\">{code}</div>"
                "<p style=\"margin:12px 0\">Expires at <strong>{expires_at}</strong>.</p>"
                "<p style=\"margin:12px 0\">Need a new code? "
                "<a style=\"color:#0a5\" href=\"{resend_link}\">Request another</a></p>"
                "<p style=\"margin:16px 0 0;color:#555\">If you didn't request this, ignore this email.</p>"
                "<p style=\"margin:8px 0;color:#777;font-size:12px\">{site_name} • "
                "<a style=\"color:#555\" href=\"{frontend_url}\">{frontend_url}</a></p>"
                "</div>"
            ),
        },
        "friend_request": {
            "subject": "New friend request on {site_name}",
            "text": (
                "{from_user} sent you a friend request on {site_name}.\n\n"
                "Respond in the app: {frontend_url}\n\n"
                "From: {from_user} <{from_email}>"
            ),
            "html": (
                "<div style=\"font-family:Arial,sans-serif;line-height:1.5;max-width:520px\">"
                "<h2 style=\"margin:0 0 12px;color:#111\">New friend request</h2>"
                "<p style=\"margin:0 0 12px\"><strong>{from_user}</strong> "
                "(<a style=\"color:#555\" href=\"mailto:{from_email}\">{from_email}</a>) "
                "sent you a friend request.</p>"
                "<p style=\"margin:12px 0\">Open DigiChess to accept or decline:</p>"
                "<p style=\"margin:0 0 16px\"><a style=\"background:#111;color:#fff;text-decoration:none;"
                "padding:10px 14px;border-radius:6px\" href=\"{frontend_url}\">Open app</a></p>"
                "<p style=\"margin:8px 0;color:#777;font-size:12px\">{site_name}</p>"
                "</div>"
            ),
        },
        "game_challenge": {
            "subject": "New game challenge on {site_name}",
            "text": (
                "{from_user} challenged you to a game on {site_name}.\n\n"
                "Time control: {time_summary}\n"
                "White clock: {white_time}s (+{white_inc}s)\n"
                "Black clock: {black_time}s (+{black_inc}s)\n\n"
                "Play now: {frontend_url}"
            ),
            "html": (
                "<div style=\"font-family:Arial,sans-serif;line-height:1.5;max-width:520px\">"
                "<h2 style=\"margin:0 0 12px;color:#111\">New game challenge</h2>"
                "<p style=\"margin:0 0 12px\"><strong>{from_user}</strong> challenged you to a game.</p>"
                "<ul style=\"margin:0 0 16px;padding-left:18px;color:#333\">"
                "<li>Time control: <strong>{time_summary}</strong></li>"
                "<li>White clock: <strong>{white_time}s</strong> (+{white_inc}s)</li>"
                "<li>Black clock: <strong>{black_time}s</strong> (+{black_inc}s)</li>"
                "</ul>"
                "<p style=\"margin:0 0 16px\"><a style=\"background:#111;color:#fff;text-decoration:none;"
                "padding:10px 14px;border-radius:6px\" href=\"{frontend_url}\">Play now</a></p>"
                "<p style=\"margin:8px 0;color:#777;font-size:12px\">{site_name}</p>"
                "</div>"
            ),
        },
    }
    tpl = templates[template_key]
    # Ensure datetime fields are stringified
    if "expires_at" in ctx:
        ctx["expires_at"] = _format_dt(ctx["expires_at"])
    if template_key == "otp":
        api_base = getattr(settings, "API_BASE_URL", DEFAULTS["frontend_url"])
        email = ctx.get("email") or ""
        resend_link = f"{api_base}/api/accounts/resend-otp/?email={urllib.parse.quote(email)}"
        ctx.setdefault("resend_link", resend_link)
    return (
        tpl["subject"].format(**ctx),
        tpl["text"].format(**ctx),
        tpl["html"].format(**ctx),
    )


def send_email_notification(template_key: str, to_email: str, context: Dict[str, Any]) -> None:
    subject, text_body, html_body = _render(template_key, context)
    api_key = os.getenv("SENDGRID_API_KEY")
    if api_key:
        try:
            payload = {
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": settings.DEFAULT_FROM_EMAIL},
                "subject": subject,
                "content": [
                    {"type": "text/plain", "value": text_body},
                    {"type": "text/html", "value": html_body},
                ],
            }
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            resp = requests.post(
                "https://api.sendgrid.com/v3/mail/send",
                json=payload,
                headers=headers,
                timeout=10,
            )
            if 200 <= resp.status_code < 300:
                print(f"[email] SendGrid email sent successfully to {to_email}", file=sys.stdout)
                return
            # Surface HTTP errors for easier debugging
            print(
                f"[email] SendGrid API error {resp.status_code}: {resp.text}",
                file=sys.stderr,
            )
        except Exception as exc:
            print(f"[email] SendGrid API exception: {exc}", file=sys.stderr)

    # Fallback to Django's email backend (console in development)
    print(f"[email] Using Django email backend (console) to send to {to_email}", file=sys.stdout)
    send_mail(
        subject=subject,
        message=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to_email],
        fail_silently=True,
        html_message=html_body,
    )
