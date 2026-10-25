import { Platform } from 'react-native';
import { registerDeviceToken, unregisterDeviceToken } from './notificationService';

let lastRegisteredToken = null;

export async function syncPushRegistration() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { status: 'unsupported' };
  }
  let Notifications;
  try {
    Notifications = require('expo-notifications');
  } catch {
    return { status: 'missing_module' };
  }
  try {
    const permission = await Notifications.getPermissionsAsync();
    const next = permission.granted ? permission : await Notifications.requestPermissionsAsync();
    if (!next.granted) return { status: 'denied' };

    let projectId;
    try {
      const Constants = require('expo-constants').default;
      projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    } catch {
      // Constants optional
    }

    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const value = token?.data;
    if (!value) return { status: 'unavailable' };

    await registerDeviceToken(value, Platform.OS === 'ios' ? 'ios' : 'android');
    lastRegisteredToken = value;
    return { status: 'registered', token: value };
  } catch (error) {
    return { status: 'unavailable', error: error?.message || String(error) };
  }
}

export async function clearPushRegistration(token) {
  const target = token || lastRegisteredToken;
  if (!target) return;
  try {
    await unregisterDeviceToken(target);
    if (target === lastRegisteredToken) {
      lastRegisteredToken = null;
    }
  } catch {
    // best-effort cleanup on logout
  }
}

export function getLastRegisteredToken() {
  return lastRegisteredToken;
}
