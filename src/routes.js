import { Router } from 'express';
import { requireAuth, handleLogin, handleLogout, handleMe } from './auth.js';
import {
  getAllAnnouncements, getAnnouncementById, createAnnouncement,
  updateAnnouncement, deleteAnnouncement,
  getLogsByAnnouncement, getAllLogs, createLog,
  getSetting, setSetting, getAllSettings, persist,
} from './db.js';
import { listAllRooms, sendToRoom, testConnection } from './rocket.js';
import { processTemplate } from './templates.js';

const router = Router();

// ---- Setup (no auth required -- only works when rc_url is not yet configured) ----
router.get('/setup/status', (req, res) => {
  const url = getSetting('rc_url');
  res.json({ configured: !!url });
});

router.put('/setup', (req, res) => {
  if (getSetting('rc_url')) {
    return res.status(403).json({ error: 'Already configured. Use Settings after login.' });
  }
  const { rc_url, rc_user_id, rc_token, bot_alias } = req.body || {};
  if (rc_url)     setSetting('rc_url', rc_url);
  if (rc_user_id) setSetting('rc_user_id', rc_user_id);
  if (rc_token)   setSetting('rc_token', rc_token);
  if (bot_alias)  setSetting('bot_alias', bot_alias);
  res.json({ ok: true });
});

// ---- Auth ----
router.post('/auth/login', handleLogin);
router.post('/auth/logout', handleLogout);
router.get('/auth/me', handleMe);

// All routes below require authentication
router.use(requireAuth);

// ---- Announcements CRUD ----
router.get('/announcements', (req, res) => {
  res.json(getAllAnnouncements());
});

router.get('/announcements/:id', (req, res) => {
  const ann = getAnnouncementById(Number(req.params.id));
  if (!ann) return res.status(404).json({ error: 'Not found' });
  res.json(ann);
});

router.post('/announcements', (req, res) => {
  try {
    const data = { ...req.body, created_by: req.session.user?.name || req.session.user?.username };
    const id = createAnnouncement(data);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/announcements/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getAnnouncementById(id)) return res.status(404).json({ error: 'Not found' });
  updateAnnouncement(id, req.body);
  res.json({ ok: true });
});

router.delete('/announcements/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getAnnouncementById(id)) return res.status(404).json({ error: 'Not found' });
  deleteAnnouncement(id);
  res.json({ ok: true });
});

router.post('/announcements/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  const ann = getAnnouncementById(id);
  if (!ann) return res.status(404).json({ error: 'Not found' });
  const newStatus = ann.status === 'active' ? 'paused' : 'active';
  updateAnnouncement(id, {
    status: newStatus,
    ...(newStatus === 'active' ? { fail_count: 0, fail_reason: null } : {}),
  });
  res.json({ ok: true, status: newStatus });
});

router.post('/announcements/:id/send-now', async (req, res) => {
  const id = Number(req.params.id);
  const ann = getAnnouncementById(id);
  if (!ann) return res.status(404).json({ error: 'Not found' });

  const alias = ann.created_by || getSetting('bot_alias') || 'AutoAnnouncer';
  const text = processTemplate(ann.message);

  try {
    const result = await sendToRoom(ann.target_room, text, alias);
    createLog(id, 'success', 'Manual send', result?.message?._id || null);
    updateAnnouncement(id, { last_sent_at: new Date().toISOString(), fail_count: 0, fail_reason: null });
    res.json({ ok: true });
  } catch (e) {
    createLog(id, 'error', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ---- Logs ----
router.get('/announcements/:id/logs', (req, res) => {
  res.json(getLogsByAnnouncement(Number(req.params.id)));
});

router.get('/logs', (req, res) => {
  res.json(getAllLogs(200));
});

// ---- Rooms ----
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await listAllRooms();
    res.json(rooms);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Settings ----
router.get('/settings', (req, res) => {
  const s = getAllSettings();
  // mask token for security
  if (s.rc_token) s.rc_token = s.rc_token.slice(0, 6) + '••••••';
  res.json(s);
});

router.put('/settings', (req, res) => {
  const allowed = ['rc_url', 'rc_user_id', 'rc_token', 'bot_alias'];
  for (const k of allowed) {
    if (k in req.body) setSetting(k, req.body[k]);
  }
  res.json({ ok: true });
});

router.post('/settings/test', async (req, res) => {
  try {
    const info = await testConnection();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
