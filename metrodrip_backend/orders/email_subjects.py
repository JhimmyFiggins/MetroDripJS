import re

SUBJECT_LABELS = {
    'confirmed': 'Order Confirmed',
    'placed': 'Order Confirmed',
    'paid': 'Order Confirmed',
    'processing': 'Order Processing',
    'packed': 'Order Packed',
    'shipped': 'Order Shipped',
    'out_for_delivery': 'Order Out For Delivery',
    'delivered': 'Order Delivered',
    'cancelled': 'Order Cancelled',
    'payment_expired': 'Order Payment Expired',
    'expired': 'Order Payment Expired',
}
MAX_SUBJECT_LENGTH = 120
INVALID_NAMES = {'none', 'null', 'undefined', 'nan'}


def clean_product_name(value):
    text = re.sub(r'[\x00-\x1f\x7f]+', ' ', str(value or ''))
    text = ' '.join(text.split())
    if not text or text.casefold() in INVALID_NAMES:
        return ''
    return text


def distinct_product_names(lines):
    names = []
    seen = set()
    for line in lines:
        if isinstance(line, str):
            raw = line
        elif isinstance(line, dict):
            raw = line.get('product_name_snapshot') or line.get('name') or ''
        else:
            product = getattr(line, 'product', None)
            raw = getattr(line, 'product_name_snapshot', '') or getattr(product, 'name', '')
        name = clean_product_name(raw)
        key = name.casefold()
        if not name or key in seen:
            continue
        seen.add(key)
        names.append(name)
    return names


def order_email_subject(status_key, order_id, product_names):
    normalized_key = str(status_key or '').lower().replace('-', '_')
    label = SUBJECT_LABELS.get(normalized_key, 'Order Update')
    suffix = f'(#{order_id}) — MetroDrip'
    names = [clean_product_name(name) for name in product_names]
    names = [name for name in names if name]
    if not names:
        return f'{label} {suffix}'
    extra = len(names) - 1
    extra_text = f' + {extra} More' if extra else ''
    available = MAX_SUBJECT_LENGTH - len(f'{label}: {extra_text} {suffix}')
    lead = names[0]
    if available < 8:
        return f'{label} {suffix}'
    if len(lead) > available:
        lead = lead[:available - 1].rstrip() + '…'
    return f'{label}: {lead}{extra_text} {suffix}'
