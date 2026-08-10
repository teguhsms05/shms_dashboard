import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from db import get_email_config, get_active_email_recipients
from logger import get_logger

_log = get_logger("email")


def send_alert_email(title, message, status):
    """Send alert email to all active recipients."""
    config = get_email_config()
    if not config or not config.get("is_active"):
        _log.info("[EMAIL] Config not found or disabled, skipping email.")
        return False

    recipients = get_active_email_recipients()
    if not recipients:
        _log.info("[EMAIL] No active recipients, skipping email.")
        return False

    subject = f"[SHMS Alert] {title}"
    status_color = {"warning": "#f59e0b", "danger": "#ef4444", "success": "#22c55e"}.get(status, "#3b82f6")

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background: {status_color}; padding: 20px; text-align: center;">
            <h2 style="color: #fff; margin: 0;">SHMS Alert Notification</h2>
        </div>
        <div style="padding: 24px;">
            <h3 style="color: #1e293b; margin-top: 0;">{title}</h3>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">{message}</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 12px;">
                This is an automated alert from SHMS (Structural Health Monitoring System).<br>
                Please do not reply to this email.
            </p>
        </div>
    </div>
    """

    try:
        smtp_host = config["smtp_host"]
        smtp_port = int(config["smtp_port"])
        smtp_user = config["smtp_user"]
        smtp_password = config["smtp_password"]
        from_email = config["from_email"] or smtp_user

        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
        try:
            server.starttls()
            server.login(smtp_user, smtp_password)

            sent_count = 0
            for recipient in recipients:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"] = from_email
                    msg["To"] = recipient["email"]
                    msg.attach(MIMEText(html_body, "html"))

                    server.sendmail(from_email, recipient["email"], msg.as_string())
                    sent_count += 1
                    _log.info(f"[EMAIL] Sent to {recipient['email']}")
                except Exception as e:
                    _log.info(f"[EMAIL] Failed to send to {recipient['email']}: {e}")

            _log.info(f"[EMAIL] Sent {sent_count}/{len(recipients)} emails.")
            return sent_count > 0
        finally:
            server.quit()

    except Exception as e:
        _log.info(f"[EMAIL] SMTP error: {e}")
        return False
