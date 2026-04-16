import { rcLogin, rcMe } from './rocket.js';

export function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export async function handleLogin(req, res) {
  const { user, password } = req.body || {};
  if (!user || !password) {
    return res.status(400).json({ error: 'user and password are required' });
  }

  try {
    const rc = await rcLogin(user, password);
    const roles = rc.user.roles || [];
    const isAdmin = roles.includes('admin');

    if (!isAdmin) {
      return res.status(403).json({ error: 'Доступ только для администраторов' });
    }

    req.session.user = {
      id: rc.userId,
      username: rc.user.username,
      name: rc.user.name || rc.user.username,
      roles,
      isAdmin,
    };
    req.session.rcToken = rc.authToken;

    return res.json({
      ok: true,
      user: req.session.user,
    });
  } catch (e) {
    return res.status(401).json({ error: e.message || 'Login failed' });
  }
}

export function handleLogout(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

export function handleMe(req, res) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ ok: true, user: req.session.user });
}
