"""
Accessible, branded transactional email templates for MetroDrip password workflows.
Follows MetroDrip streetwear aesthetic: clean dark contrast (#141414), neon accent (#E6FF00),
legible typography, explicit security context, and plain-text fallbacks.
"""

def _base_email_html(title, heading, body_paragraphs, cta_label=None, cta_url=None, notice=None):
    try:
        from django.conf import settings
        base_url = (getattr(settings, 'APP_PUBLIC_BASE_URL', None) or 'https://metrodripjs-q4ik.onrender.com').strip().rstrip('/')
    except Exception:
        base_url = 'https://metrodripjs-q4ik.onrender.com'
    logo_url = f"{base_url}/assets/branding/logo-emblem.png"

    paragraphs_html = "".join(f'<p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #D1D1D1;">{p}</p>' for p in body_paragraphs)
    
    cta_html = ""
    if cta_label and cta_url:
        cta_html = f'''
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
          <tr>
            <td align="center" style="border-radius: 4px; background-color: #E6FF00;">
              <a href="{cta_url}" target="_blank" style="display: inline-block; padding: 14px 28px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #141414; text-decoration: none; letter-spacing: 0.05em; text-transform: uppercase;">
                {cta_label}
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 0 0 16px; font-size: 13px; line-height: 1.5; color: #8E8E93; word-break: break-all;">
          If the button does not work, copy and paste this link into your browser:<br>
          <a href="{cta_url}" style="color: #E6FF00; text-decoration: underline;">{cta_url}</a>
        </p>
        '''

    notice_html = ""
    if notice:
        notice_html = f'''
        <div style="border-top: 1px solid #2C2C2E; padding-top: 16px; margin-top: 24px;">
          <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #8E8E93;">{notice}</p>
        </div>
        '''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #EDEDED;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0A0A0A; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #141414; border: 1px solid #242424; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px 20px; border-bottom: 1px solid #242424;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle; padding-right: 12px;">
                    <img src="{logo_url}" alt="MetroDrip" width="38" height="38" style="display: block; border: 0; outline: none; border-radius: 8px;">
                  </td>
                  <td style="vertical-align: middle;">
                    <span style="font-family: Impact, 'Arial Black', sans-serif; font-size: 24px; letter-spacing: 0.02em; color: #FFFFFF;">METRO<span style="color: #E6FF00;">DRIP</span></span>
                    <span style="display: block; font-size: 11px; letter-spacing: 0.15em; color: #8E8E93; text-transform: uppercase; margin-top: 2px;">Metro Manila Streetwear</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.01em;">{heading}</h1>
              {paragraphs_html}
              {cta_html}
              {notice_html}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0E0E0E; border-top: 1px solid #1E1E1E; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #636366; letter-spacing: 0.05em;">
                &copy; MetroDrip Platform &middot; Automated Security Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''


def render_welcome_setup(user, setup_link, expires_in_minutes=30):
    role_label = user.role.capitalize() if getattr(user, 'role', None) else 'Customer'
    heading = "Set Up Your MetroDrip Password"
    paragraphs = [
        f"Hello {user.name or user.email},",
        f"An administrator has created a <strong>{role_label}</strong> account for you on the MetroDrip platform.",
        f"To complete your account setup and activate full access, please choose your permanent password. This setup link expires in <strong>{expires_in_minutes} minutes</strong>.",
    ]
    notice = "If you were not expecting an account on MetroDrip, you can safely ignore this email. No password has been set yet."
    
    html = _base_email_html(
        title="Set Up Your MetroDrip Password",
        heading=heading,
        body_paragraphs=paragraphs,
        cta_label="Set Account Password",
        cta_url=setup_link,
        notice=notice,
    )
    
    text = (
        f"METRODRIP - Set Up Your Password\n\n"
        f"Hello {user.name or user.email},\n\n"
        f"An administrator has created a {role_label} account for you on the MetroDrip platform.\n"
        f"To complete your account setup, please visit the link below to set your permanent password:\n\n"
        f"{setup_link}\n\n"
        f"This setup link expires in {expires_in_minutes} minutes.\n"
        f"If you were not expecting this account, please ignore this email.\n"
    )
    return {"subject": "Set up your MetroDrip account password", "html": html, "text": text}


def render_admin_password_reset(user, reset_link, expires_in_minutes=30):
    heading = "Administrator-Initiated Password Reset"
    paragraphs = [
        f"Hello {user.name or user.email},",
        f"An administrator has requested a password reset for your MetroDrip account (<strong>{user.email}</strong>).",
        f"Click the button below to establish a new password. This link is single-use and will expire in <strong>{expires_in_minutes} minutes</strong>.",
    ]
    notice = "If you did not expect this reset, contact your platform administrator immediately to ensure your account security."

    html = _base_email_html(
        title="Password Reset Requested",
        heading=heading,
        body_paragraphs=paragraphs,
        cta_label="Reset Password",
        cta_url=reset_link,
        notice=notice,
    )

    text = (
        f"METRODRIP - Password Reset\n\n"
        f"Hello {user.name or user.email},\n\n"
        f"An administrator has requested a password reset for your MetroDrip account ({user.email}).\n"
        f"To choose a new password, visit the link below:\n\n"
        f"{reset_link}\n\n"
        f"This link expires in {expires_in_minutes} minutes and can only be used once.\n"
        f"If you did not expect this request, please contact your administrator immediately.\n"
    )
    return {"subject": "Password reset requested for your MetroDrip account", "html": html, "text": text}


def render_self_service_password_reset(user, reset_link, expires_in_minutes=30):
    heading = "Reset Your Password"
    paragraphs = [
        f"Hello {user.name or user.email},",
        f"We received a request to reset the password for your MetroDrip account (<strong>{user.email}</strong>).",
        f"To set a new password, click the button below. This link is single-use and expires in <strong>{expires_in_minutes} minutes</strong>.",
    ]
    notice = "If you did not make this request, you can safely ignore this email. Your existing password remains unchanged."

    html = _base_email_html(
        title="Reset Your Password",
        heading=heading,
        body_paragraphs=paragraphs,
        cta_label="Reset Password",
        cta_url=reset_link,
        notice=notice,
    )

    text = (
        f"METRODRIP - Password Recovery\n\n"
        f"Hello {user.name or user.email},\n\n"
        f"We received a request to reset the password for your MetroDrip account ({user.email}).\n"
        f"To choose a new password, visit the link below:\n\n"
        f"{reset_link}\n\n"
        f"This link expires in {expires_in_minutes} minutes and can only be used once.\n"
        f"If you did not request this reset, you can safely ignore this message.\n"
    )
    return {"subject": "Reset your MetroDrip password", "html": html, "text": text}


def render_password_changed_notification(user, changed_at_str=None):
    timestamp_note = f" on {changed_at_str}" if changed_at_str else ""
    heading = "Your Password Has Been Changed"
    paragraphs = [
        f"Hello {user.name or user.email},",
        f"The password for your MetroDrip account (<strong>{user.email}</strong>) was successfully changed{timestamp_note}.",
        "All previous active sessions have been revoked for your security.",
    ]
    notice = "If you did NOT perform this change, please contact support or your administrator immediately to secure your account."

    html = _base_email_html(
        title="Password Successfully Changed",
        heading=heading,
        body_paragraphs=paragraphs,
        cta_label=None,
        cta_url=None,
        notice=notice,
    )

    text = (
        f"METRODRIP - Security Alert\n\n"
        f"Hello {user.name or user.email},\n\n"
        f"The password for your MetroDrip account ({user.email}) was successfully changed{timestamp_note}.\n"
        f"All previous active sessions have been revoked for your security.\n\n"
        f"If you did not make this change, please contact support immediately.\n"
    )
    return {"subject": "Your MetroDrip password was changed", "html": html, "text": text}


def render_order_status_email(name, order_number, status_label, message, changed_at, order_url, support_email, subject=None):
    from html import escape
    safe_name = escape(name or 'there')
    safe_number = escape(order_number)
    safe_status = escape(status_label)
    safe_message = escape(message)
    safe_when = escape(changed_at)
    safe_url = escape(order_url, quote=True)
    safe_support = escape(support_email or 'the MetroDrip support address on your receipt')
    subject = subject or f'Order {order_number} is now {status_label}'
    html = _base_email_html(
        title=subject,
        heading=safe_status,
        body_paragraphs=[
            f'Hello {safe_name},',
            f'Order <strong>{safe_number}</strong> is now <strong>{safe_status}</strong>.',
            safe_message,
            f'Updated at {safe_when}.',
        ],
        cta_label='View order',
        cta_url=safe_url,
        notice=f'Questions about this order? Contact {safe_support}. MetroDrip will not ask for your password or payment details by email.',
    )
    text = (
        f'METRODRIP\n\n{status_label}\n\n'
        f'Hello {name or "there"},\n'
        f'Order {order_number} is now {status_label}.\n{message}\n'
        f'Updated at {changed_at}.\n\n'
        f'View order: {order_url}\n'
        f'Support: {support_email or "see your receipt"}\n'
    )
    return subject, html, text


def render_email_otp(user, code, purpose, expires_in_minutes=5):
    if purpose == 'email_verification':
        heading = 'Confirm your email'
        intro = 'Use this code to confirm the email address for your new MetroDrip account.'
        subject = 'Your MetroDrip verification code'
    elif getattr(user, 'role', '') == 'admin':
        heading = 'Administrator sign-in code'
        intro = 'Use this code to finish signing in to the MetroDrip admin console.'
        subject = 'Your MetroDrip admin sign-in code'
    elif getattr(user, 'role', '') == 'merchant':
        heading = 'Merchant sign-in code'
        intro = 'Use this code to finish signing in to the MetroDrip merchant console.'
        subject = 'Your MetroDrip merchant sign-in code'
    else:
        heading = 'Sign-in code'
        intro = 'Use this code to finish signing in to MetroDrip.'
        subject = 'Your MetroDrip sign-in code'
    paragraphs = [
        f'Hello {user.name or "there"},',
        intro,
        f'<strong style="font-size:28px; letter-spacing:0.28em; color:#E6FF00;">{code}</strong>',
        f'This code expires in {expires_in_minutes} minutes and can be used once.',
    ]
    notice = 'Never share this code. MetroDrip will not ask for it by phone or chat.'
    html = _base_email_html(
        title=subject,
        heading=heading,
        body_paragraphs=paragraphs,
        notice=notice,
    )
    text = (
        f'METRODRIP\n\n{heading}\n\n'
        f'Hello {user.name or "there"},\n{intro}\n\n'
        f'Code: {code}\n\n'
        f'This code expires in {expires_in_minutes} minutes and can be used once.\n'
        'Never share this code.\n'
    )
    return subject, html, text
