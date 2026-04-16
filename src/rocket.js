import { getSetting } from './db.js';

async function rcFetch(path, options = {}) {
  const baseUrl = getSetting('rc_url');
  const userId = getSetting('rc_user_id');
  const token = getSetting('rc_token');

  if (!baseUrl) throw new Error('Rocket.Chat URL not configured');

  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(userId && token ? { 'X-User-Id': userId, 'X-Auth-Token': token } : {}),
    ...options.headers,
  };

  const resp = await fetch(url, { ...options, headers });
  const data = await resp.json();
  if (!resp.ok || data.success === false) {
    throw new Error(data.error || data.message || `RC API error ${resp.status}`);
  }
  return data;
}

// Auth: login with user/password, return { userId, authToken, user }
export async function rcLogin(user, password) {
  const baseUrl = getSetting('rc_url');
  if (!baseUrl) throw new Error('Rocket.Chat URL not configured. Set it in Settings first.');

  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/login`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, password }),
  });
  const data = await resp.json();
  if (!resp.ok || data.status === 'error') {
    throw new Error(data.message || data.error || 'Login failed');
  }
  return {
    userId: data.data.userId,
    authToken: data.data.authToken,
    user: data.data.me,
  };
}

// Get current user info using specific credentials
export async function rcMe(userId, authToken) {
  const baseUrl = getSetting('rc_url');
  if (!baseUrl) throw new Error('RC URL not configured');

  const url = `${baseUrl.replace(/\/+$/, '')}/api/v1/me`;
  const resp = await fetch(url, {
    headers: {
      'X-User-Id': userId,
      'X-Auth-Token': authToken,
    },
  });
  const data = await resp.json();
  if (!resp.ok || data.success === false) {
    throw new Error(data.error || 'Failed to get user info');
  }
  return data;
}

// Send a message to a channel/group/DM using the service-account credentials
export async function sendMessage(roomId, text, alias, avatarUrl) {
  const body = { roomId, text };
  if (alias) body.alias = alias;
  if (avatarUrl) body.avatar = avatarUrl;

  return rcFetch('/api/v1/chat.postMessage', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// Send to channel by name (resolves #name -> roomId first)
export async function sendToRoom(roomIdentifier, text, alias, avatarUrl) {
  const body = { text };
  if (alias) body.alias = alias;
  if (avatarUrl) body.avatar = avatarUrl;

  if (roomIdentifier.startsWith('@')) {
    body.channel = roomIdentifier;
  } else {
    body.channel = roomIdentifier.startsWith('#') ? roomIdentifier : `#${roomIdentifier}`;
  }

  return rcFetch('/api/v1/chat.postMessage', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// List joined channels
export async function listChannels() {
  try {
    const data = await rcFetch('/api/v1/channels.list.joined?count=200');
    return (data.channels || []).map(c => ({ id: c._id, name: c.name, type: 'c' }));
  } catch {
    return [];
  }
}

// List joined groups
export async function listGroups() {
  try {
    const data = await rcFetch('/api/v1/groups.listAll?count=200');
    return (data.groups || []).map(g => ({ id: g._id, name: g.name, type: 'p' }));
  } catch {
    return [];
  }
}

// Get all rooms the service account has access to
export async function listAllRooms() {
  const [channels, groups] = await Promise.all([listChannels(), listGroups()]);
  return [...channels, ...groups];
}

// Test connectivity with the configured credentials
export async function testConnection() {
  const data = await rcFetch('/api/v1/me');
  return { ok: true, username: data.username, name: data.name };
}
