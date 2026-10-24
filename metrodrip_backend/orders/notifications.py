"""
Order notifications module.
Handles order confirmation email rendering, merchant preference enforcement,
and idempotent transactional dispatch via Brevo.
"""

import logging
from django.utils import timezone
from identity.brevo import send_transactional_email
from identity.models import PlatformSetting, AccountsCustomer
from orders.models import OrdersOrderMessage

logger = logging.getLogger(__name__)


def render_order_confirmation(order, recipient_name, sender_name='MetroDrip Orders'):
    """
    Renders responsive, branded order confirmation email for MetroDrip orders.
    Returns:
        dict: {'subject': str, 'html': str, 'text': str}
    """
    subject = f"Order Confirmed #{order.id} — MetroDrip"
    recipient_display = recipient_name or 'Valued Customer'
    shipping_addr = getattr(order, 'shipping_address', None)
    address_str = f"{shipping_addr.address_line1}, {shipping_addr.city}, {shipping_addr.state}" if shipping_addr else "Address on file"
    payment = order.payments.order_by('-created_at').first()
    payment_method_label = (payment.method.upper() if payment else 'COD')

    lines = list(order.lines.all())
    items_html_rows = []
    items_text_rows = []

    for line in lines:
        name = line.product_name_snapshot or getattr(line.product, 'name', 'Streetwear Item')
        desc = line.variant_desc_snapshot or ''
        qty = line.quantity
        price = f"₱{line.total_price:,.2f}"
        items_html_rows.append(f"""
        <tr>
          <td style="padding: 12px 0; border-bottom: 1px solid #2C2C2E; color: #EDEDED; font-size: 14px;">
            <strong>{name}</strong>{f' <span style=\"color:#8E8E93;\">({desc})</span>' if desc else ''}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #2C2C2E; color: #8E8E93; font-size: 14px; text-align: center;">
            {qty}
          </td>
          <td style="padding: 12px 0; border-bottom: 1px solid #2C2C2E; color: #EDEDED; font-size: 14px; text-align: right; font-weight: 600;">
            {price}
          </td>
        </tr>
        """)
        items_text_rows.append(f"- {name} x{qty} : {price}")

    items_html = "".join(items_html_rows)
    items_text = "\n".join(items_text_rows)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #EDEDED;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0A0A0A; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #141414; border: 1px solid #242424; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px; border-bottom: 1px solid #242424;">
              <span style="font-family: Impact, 'Arial Black', sans-serif; font-size: 26px; letter-spacing: 0.02em; color: #FFFFFF;">METRO<span style="color: #E6FF00;">DRIP</span></span>
              <span style="display: block; font-size: 11px; letter-spacing: 0.15em; color: #8E8E93; text-transform: uppercase; margin-top: 4px;">Order Confirmation</span>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #FFFFFF;">Thank you for your order, {recipient_display}!</h1>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #A1A1AA;">
                Your order <strong>#{order.id}</strong> has been confirmed and placed with our fulfillment warehouse.
              </p>

              <!-- Order Summary Table -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <thead>
                  <tr style="border-bottom: 2px solid #333333;">
                    <th align="left" style="padding-bottom: 8px; color: #8E8E93; font-size: 12px; text-transform: uppercase;">Item</th>
                    <th align="center" style="padding-bottom: 8px; color: #8E8E93; font-size: 12px; text-transform: uppercase;">Qty</th>
                    <th align="right" style="padding-bottom: 8px; color: #8E8E93; font-size: 12px; text-transform: uppercase;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items_html}
                </tbody>
              </table>

              <!-- Financial Totals -->
              <div style="background-color: #1C1C1E; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #A1A1AA;">
                  <span>Subtotal:</span>
                  <span>₱{order.subtotal:,.2f}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 13px; color: #A1A1AA;">
                  <span>Shipping:</span>
                  <span>₱{order.shipping:,.2f}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 8px; border-top: 1px solid #2C2C2E; font-size: 16px; font-weight: 700; color: #E6FF00;">
                  <span>Total Amount:</span>
                  <span>₱{order.total:,.2f} PHP</span>
                </div>
              </div>

              <!-- Shipping & Payment info -->
              <div style="border-top: 1px solid #242424; padding-top: 16px; margin-bottom: 20px;">
                <p style="margin: 0 0 6px; font-size: 13px; color: #EDEDED;">
                  <strong>Delivery Address:</strong> {address_str}
                </p>
                <p style="margin: 0; font-size: 13px; color: #EDEDED;">
                  <strong>Payment Method:</strong> {payment_method_label}
                </p>
              </div>

              <div style="border-top: 1px solid #2C2C2E; padding-top: 16px; margin-top: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #8E8E93;">
                  This is an automated order confirmation from {sender_name}. If you have any questions regarding your delivery, contact our support team.
                </p>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    text = f"""METRODRIP — ORDER CONFIRMATION #{order.id}

Hi {recipient_display},

Your order #{order.id} has been confirmed!

ITEMS:
{items_text}

Subtotal: ₱{order.subtotal:,.2f}
Shipping: ₱{order.shipping:,.2f}
Total: ₱{order.total:,.2f} PHP

Delivery Address: {address_str}
Payment Method: {payment_method_label}

Thank you for shopping with {sender_name}!
"""
    return {
        'subject': subject,
        'html': html,
        'text': text,
    }


def dispatch_order_confirmation_if_enabled(order):
    """
    Safely dispatches an order confirmation email if enabled in merchant settings.
    Idempotent: will not send twice for the same order.
    Never raises an uncaught exception that would corrupt order state.
    """
    if not order or getattr(order, 'confirmation_email_sent_at', None):
        return False, 'already_sent'

    try:
        from django.db import transaction
        with transaction.atomic():
            locked = type(order).objects.select_for_update().filter(pk=order.pk).first()
            if not locked or locked.confirmation_email_sent_at:
                return False, 'already_sent'
            order = locked
            result = _send_confirmation(order)
            return result
    except Exception as err:
        logger.error("Failed to dispatch order confirmation for order #%s: %s", getattr(order, 'id', 'unknown'), err)
        return False, 'dispatch_error'


def _send_confirmation(order):
    try:
        setting = PlatformSetting.get_instance()
        if getattr(setting, 'order_confirmation_emails', 'enabled') != 'enabled':
            logger.info("Order confirmation emails are disabled; skipping order #%s", order.id)
            return False, 'disabled_by_merchant'

        recipient_email = ''
        recipient_name = ''
        if order.customer_id:
            customer = AccountsCustomer.objects.filter(id=order.customer_id).first()
            if customer and customer.email:
                recipient_email = customer.email.strip()
                recipient_name = customer.name.strip()

        shipping_addr = getattr(order, 'shipping_address', None)
        if not recipient_name and shipping_addr:
            recipient_name = shipping_addr.name.strip()

        if not recipient_email:
            logger.warning("No recipient email found for order #%s; skipping confirmation email.", order.id)
            return False, 'no_recipient_email'

        sender_name = (setting.sender_name or 'MetroDrip Orders').strip()
        email_data = render_order_confirmation(order, recipient_name, sender_name=sender_name)

        send_res = send_transactional_email(
            to_email=recipient_email,
            to_name=recipient_name,
            subject=email_data['subject'],
            html_content=email_data['html'],
            text_content=email_data['text'],
            sender_name_override=sender_name,
        )

        if not send_res.get('success'):
            return False, send_res.get('code') or 'dispatch_error'
        now = timezone.now()
        order.confirmation_email_sent_at = now
        order.save(update_fields=['confirmation_email_sent_at'])

        try:
            OrdersOrderMessage.objects.create(
                order=order,
                sender='email_order_confirmation',
                message=f"Order confirmation email dispatched to {recipient_email} (status: {send_res.get('code')})",
                created_at=now,
            )
        except Exception:
            pass

        return send_res.get('success', False), send_res.get('code')
    except Exception as err:
        logger.error("Failed to dispatch order confirmation for order #%s: %s", getattr(order, 'id', 'unknown'), err)
        return False, 'dispatch_error'
