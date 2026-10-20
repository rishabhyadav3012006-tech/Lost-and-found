"""
Email notification service for ReUnite AI.
Sends notifications when a match is found, confirmed, or when admin actions occur.
Uses SMTP (configurable via environment variables).
Falls back gracefully if email is not configured.
"""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


def _get_smtp_config():
    """Load SMTP settings from config."""
    from ..core.config import settings
    return {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "user": settings.SMTP_USER,
        "password": settings.SMTP_PASSWORD,
        "from_name": settings.SMTP_FROM_NAME,
        "from_email": settings.SMTP_FROM_EMAIL,
        "enabled": settings.EMAIL_ENABLED,
    }


def send_email(to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
    """
    Send an email. Returns True on success, False on failure.
    Silently skips if email is not configured.
    """
    cfg = _get_smtp_config()
    if not cfg["enabled"] or not cfg["host"] or not cfg["user"]:
        logger.info(f"[Email] Skipped (not configured) → To: {to_email} | Subject: {subject}")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{cfg['from_name']} <{cfg['from_email'] or cfg['user']}>"
        msg["To"] = to_email

        if text_body:
            msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.ehlo()
            if cfg["port"] == 587:
                server.starttls()
            if cfg["password"]:
                server.login(cfg["user"], cfg["password"])
            server.sendmail(cfg["from_email"] or cfg["user"], to_email, msg.as_string())

        logger.info(f"[Email] Sent → To: {to_email} | Subject: {subject}")
        return True

    except Exception as exc:
        logger.error(f"[Email] Failed → {exc}")
        return False


# ─── Email Templates ──────────────────────────────────────────────────────────

def _html_wrapper(title: str, body: str) -> str:
    """Wrap content in a branded HTML email template."""
    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#0F0F13;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F13;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1E1E2A;border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7C3AED,#F97316);padding:32px;text-align:center;">
            <h1 style="margin:0;color:white;font-size:24px;font-weight:800;letter-spacing:-0.02em;">
              ReUnite <span style="color:#FDE68A;">AI</span>
            </h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
              Smart Lost &amp; Found Family Reunification Platform
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            {body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px;text-align:center;border-top:1px solid rgba(255,255,255,0.08);">
            <p style="margin:0;color:#666688;font-size:12px;">
              This is an automated message from ReUnite AI.<br/>
              Please do not reply directly to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def send_match_notification(
    to_email: str,
    to_name: str,
    report_type: str,
    person_name: str,
    match_score: float,
    match_id: int,
    app_url: str = "http://localhost:8000",
) -> bool:
    """Notify a user that a potential match was found for their report."""
    pct = round(match_score * 100)
    subject = f"🔍 Potential Match Found – {pct}% similarity | ReUnite AI"

    body = f"""
    <h2 style="margin:0 0 16px;color:#F0F0FA;font-size:22px;">Potential Match Found!</h2>
    <p style="color:#9999B8;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Hi <strong style="color:#F0F0FA;">{to_name}</strong>,<br/><br/>
      Our AI matching engine has found a potential match for your 
      <strong style="color:{'#FC8181' if report_type == 'missing' else '#6EE7B7'};">
        {report_type} person report
      </strong>
      {f'for <strong style="color:#F0F0FA;">{person_name}</strong>' if person_name else ''}.
    </p>

    <!-- Match score badge -->
    <div style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);border-radius:16px;padding:24px;text-align:center;margin:0 0 24px;">
      <div style="font-size:48px;font-weight:800;color:#8B5CF6;line-height:1;">{pct}%</div>
      <div style="color:#9999B8;font-size:13px;margin-top:8px;">Similarity Score</div>
    </div>

    <p style="color:#9999B8;font-size:13px;margin:0 0 24px;padding:12px;background:rgba(234,179,8,0.1);border-radius:8px;border-left:3px solid #EAB308;">
      ⚠️ <strong>Important:</strong> This score is AI-generated and does NOT confirm identity. 
      Human verification is always required before taking any action.
    </p>

    <div style="text-align:center;">
      <a href="{app_url}" 
         style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#F97316);color:white;
                text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:15px;">
        View Match Details →
      </a>
    </div>
    """

    return send_email(to_email, subject, _html_wrapper(subject, body))


def send_match_confirmed_notification(
    to_email: str,
    to_name: str,
    other_contact_name: Optional[str],
    other_contact_phone: Optional[str],
    other_contact_email: Optional[str],
    app_url: str = "http://localhost:8000",
) -> bool:
    """Notify both parties when a match is confirmed."""
    subject = "🎉 Match Confirmed – Contact Information | ReUnite AI"

    contact_html = ""
    if other_contact_name:
        contact_html += f'<p style="margin:4px 0;color:#F0F0FA;"><strong>Name:</strong> {other_contact_name}</p>'
    if other_contact_phone:
        contact_html += f'<p style="margin:4px 0;color:#F0F0FA;"><strong>Phone:</strong> <a href="tel:{other_contact_phone}" style="color:#8B5CF6;">{other_contact_phone}</a></p>'
    if other_contact_email:
        contact_html += f'<p style="margin:4px 0;color:#F0F0FA;"><strong>Email:</strong> <a href="mailto:{other_contact_email}" style="color:#8B5CF6;">{other_contact_email}</a></p>'

    body = f"""
    <h2 style="margin:0 0 16px;color:#22C55E;font-size:22px;">🎉 Match Confirmed!</h2>
    <p style="color:#9999B8;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Hi <strong style="color:#F0F0FA;">{to_name}</strong>,<br/><br/>
      A match for your report has been <strong style="color:#22C55E;">confirmed by an administrator</strong>.
      Here is the contact information of the reporting party:
    </p>

    <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:16px;padding:24px;margin:0 0 24px;">
      <h3 style="margin:0 0 16px;color:#22C55E;font-size:16px;">Contact Information</h3>
      {contact_html or '<p style="color:#9999B8;">Contact details not available.</p>'}
    </div>

    <p style="color:#9999B8;font-size:13px;margin:0 0 24px;padding:12px;background:rgba(124,58,237,0.1);border-radius:8px;border-left:3px solid #7C3AED;">
      🔒 Please proceed with care and verify identity before sharing any sensitive information.
    </p>

    <div style="text-align:center;">
      <a href="{app_url}" 
         style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#F97316);color:white;
                text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:15px;">
        Go to ReUnite AI →
      </a>
    </div>
    """

    return send_email(to_email, subject, _html_wrapper(subject, body))


def send_report_submitted_confirmation(
    to_email: str,
    to_name: str,
    report_id: int,
    report_type: str,
    person_name: Optional[str],
    app_url: str = "http://localhost:8000",
) -> bool:
    """Confirm to the submitter that their report was received."""
    subject = f"✅ Report #{report_id} Received | ReUnite AI"

    body = f"""
    <h2 style="margin:0 0 16px;color:#F0F0FA;font-size:22px;">Report Received!</h2>
    <p style="color:#9999B8;font-size:15px;line-height:1.6;margin:0 0 24px;">
      Hi <strong style="color:#F0F0FA;">{to_name}</strong>,<br/><br/>
      Your <strong style="color:{'#FC8181' if report_type == 'missing' else '#6EE7B7'};">
        {report_type} person report
      </strong>
      {f'for <strong style="color:#F0F0FA;">{person_name}</strong>' if person_name else ''}
      has been successfully filed as <strong style="color:#8B5CF6;">Report #{report_id}</strong>.
    </p>

    <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:16px;padding:24px;margin:0 0 24px;">
      <p style="margin:0;color:#9999B8;font-size:14px;line-height:1.7;">
        ✅ <strong style="color:#F0F0FA;">What happens next?</strong><br/>
        Our AI matching engine will automatically compare your report against all active reports
        and notify you if a potential match is found. You can also log in to your dashboard 
        to track your report status and view any matches.
      </p>
    </div>

    <div style="text-align:center;">
      <a href="{app_url}" 
         style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#F97316);color:white;
                text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:15px;">
        View Your Report →
      </a>
    </div>
    """

    return send_email(to_email, subject, _html_wrapper(subject, body))
