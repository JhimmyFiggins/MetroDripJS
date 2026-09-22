import { apiFetch } from './apiClient';

// Live endpoints: GET /notifications/ -> { unread_count, results: [{ id, type, title, body, created_at, is_read, order_id }] }; POST /notifications/<id>/read/ and POST /notifications/read-all/ -> { ok: true }

export async function getNotifications() {
  return apiFetch('/notifications/');
}

export async function getUnreadCount() {
  const data = await getNotifications();
  return (data && data.unread_count) || 0;
}

export async function markRead(id) {
  return apiFetch(`/notifications/${id}/read/`, { method: 'POST' });
}

export async function markAllRead() {
  return apiFetch('/notifications/read-all/', { method: 'POST' });
}

export function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return '';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}
