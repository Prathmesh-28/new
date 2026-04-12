"""
Notification channel dispatchers.

Each dispatcher receives a rendered alert dict and delivers it
via the appropriate channel. The alert is always written to the
in_app alerts table first; email and whatsapp are fire-and-forget.

Channel config is read from environment variables:
  EMAIL_*     SMTP or SendGrid
  WA_*        WhatsApp Business API (Meta)
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# In-app  (write to alerts table — handled by the engine, not this module)
# ---------------------------------------------------------------------------

# The engine inserts directly into alerts + events tables.
# This module handles the external channel dispatches only.


# ---------------------------------------------------------------------------
# Email  (SendGrid)
# ---------------------------------------------------------------------------

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
SENDGRID_FROM = os.getenv("SENDGRID_FROM_EMAIL", "alerts@headroom.app")
SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/messages"

SEVERITY_SUBJECT_PREFIX = {
    "critical": "🚨 Action Required",
    "warning": "⚠️ Heads Up",
    "info": "ℹ️ FYI",
}


def send_email(
    to_email: str,
    subject_suffix: str,
    body_html: str,
    severity: str = "info",
) -> bool:
    if not SENDGRID_API_KEY:
        logger.warning("SENDGRID_API_KEY not set — skipping email")
        return False

    prefix = SEVERITY_SUBJECT_PREFIX.get(severity, "")
    subject = f"{prefix}: {subject_suffix}"

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": SENDGRID_FROM, "name": "Headroom Alerts"},
        "subject": subject,
        "content": [{"type": "text/html", "value": body_html}],
    }

    try:
        resp = httpx.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {SENDGRID_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("Email dispatch failed to %s: %s", to_email, exc)
        return False


def _build_email_html(alert: Dict[str, Any]) -> str:
    severity_colors = {
        "critical": "#d32f2f",
        "warning": "#f57c00",
        "info": "#0288d1",
    }
    color = severity_colors.get(alert["severity"], "#333")
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <div style="border-left:4px solid {color};padding-left:16px;margin-bottom:16px">
        <h2 style="color:{color};margin:0 0 8px 0">{alert['severity'].upper()}</h2>
        <p style="font-size:16px;margin:0">{alert['message']}</p>
      </div>
      <p style="color:#666;font-size:13px">
        Log in to <a href="https://app.headroom.finance">Headroom</a> to view your full forecast.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
      <p style="color:#999;font-size:11px">
        You're receiving this because you have alerts enabled.
        <a href="https://app.headroom.finance/settings/alerts">Manage preferences</a>
      </p>
    </div>
    """


# ---------------------------------------------------------------------------
# WhatsApp  (Meta Cloud API)
# ---------------------------------------------------------------------------

WA_TOKEN = os.getenv("WHATSAPP_API_TOKEN", "")
WA_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
WA_API_VERSION = "v19.0"
WA_TEMPLATE_NAMES = {
    "critical": "headroom_critical_alert",
    "warning": "headroom_warning_alert",
    "info": "headroom_info_alert",
}


def send_whatsapp(to_phone: str, alert: Dict[str, Any]) -> bool:
    """
    Send a WhatsApp template message via the Meta Cloud API.
    Uses pre-approved message templates per severity level.
    `to_phone` must be in E.164 format, e.g. +919876543210
    """
    if not WA_TOKEN or not WA_PHONE_NUMBER_ID:
        logger.warning("WhatsApp credentials not set — skipping WA notification")
        return False

    template = WA_TEMPLATE_NAMES.get(alert["severity"], "headroom_info_alert")

    payload = {
        "messaging_product": "whatsapp",
        "to": to_phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": "en"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": alert["message"]},
                    ],
                }
            ],
        },
    }

    url = f"https://graph.facebook.com/{WA_API_VERSION}/{WA_PHONE_NUMBER_ID}/messages"
    try:
        resp = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {WA_TOKEN}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.error("WhatsApp dispatch failed to %s: %s", to_phone, exc)
        return False


# ---------------------------------------------------------------------------
# Dispatcher — routes a fired alert to its configured channels
# ---------------------------------------------------------------------------

def dispatch(
    alert: Dict[str, Any],
    tenant_contacts: Dict[str, Any],
) -> Dict[str, bool]:
    """
    Deliver a fired alert through all its configured channels.

    Args:
        alert:            Fired alert dict (id, severity, message, channels)
        tenant_contacts:  {email: str, phone: str}  — tenant notification prefs

    Returns:
        {channel: success_bool}
    """
    results: Dict[str, bool] = {}

    for channel in alert.get("channels", []):

        if channel == "in_app":
            # Written directly to DB by the engine; mark as handled
            results["in_app"] = True

        elif channel == "email":
            email = tenant_contacts.get("email")
            if email:
                html = _build_email_html(alert)
                results["email"] = send_email(
                    to_email=email,
                    subject_suffix=alert["message"][:80],
                    body_html=html,
                    severity=alert["severity"],
                )
            else:
                logger.debug("No email contact for tenant — skipping email")
                results["email"] = False

        elif channel == "whatsapp":
            phone = tenant_contacts.get("phone")
            if phone:
                results["whatsapp"] = send_whatsapp(phone, alert)
            else:
                logger.debug("No phone contact for tenant — skipping WhatsApp")
                results["whatsapp"] = False

        else:
            logger.warning("Unknown notification channel: %s", channel)
            results[channel] = False

    return results
