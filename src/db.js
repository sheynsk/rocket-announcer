import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_PATH = join(DATA_DIR, 'announcer.db');

let db = null;

export async function initDatabase() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buf = readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    target_room TEXT NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'onetime',
    scheduled_date TEXT,
    interval_value INTEGER,
    interval_unit TEXT,
    weekly_days TEXT,
    time_hour INTEGER,
    time_minute INTEGER,
    monthly_day INTEGER,
    cron_expression TEXT,
    start_date TEXT,
    end_date TEXT,
    quiet_mode INTEGER DEFAULT 0,
    skip_if_recent INTEGER DEFAULT 0,
    skip_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    fail_count INTEGER DEFAULT 0,
    fail_reason TEXT,
    last_sent_at TEXT,
    last_attempt_at TEXT,
    created_by TEXT,
    owner_id TEXT,
    owner_username TEXT,
    is_shared INTEGER DEFAULT 0,
    created_at TEXT,
    updated_at TEXT
  )`);

  // migrations for existing DBs
  try {
    const cols = db.exec("PRAGMA table_info(announcements)");
    const names = cols[0]?.values?.map(r => r[1]) || [];
    if (!names.includes('created_by'))     db.run("ALTER TABLE announcements ADD COLUMN created_by TEXT");
    if (!names.includes('owner_id'))       db.run("ALTER TABLE announcements ADD COLUMN owner_id TEXT");
    if (!names.includes('owner_username')) db.run("ALTER TABLE announcements ADD COLUMN owner_username TEXT");
    if (!names.includes('is_shared'))      db.run("ALTER TABLE announcements ADD COLUMN is_shared INTEGER DEFAULT 0");
  } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS announcement_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER,
    sent_at TEXT,
    status TEXT,
    details TEXT,
    message_id TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  persist();
  return db;
}

export function persist() {
  if (!db) return;
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

export function getDb() {
  return db;
}

// --- Settings helpers ---

export function getSetting(key) {
  const row = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
  if (row.length && row[0].values.length) return row[0].values[0][0];
  return null;
}

export function setSetting(key, value) {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  persist();
}

export function getAllSettings() {
  const rows = db.exec('SELECT key, value FROM settings');
  const obj = {};
  if (rows.length) {
    for (const r of rows[0].values) obj[r[0]] = r[1];
  }
  return obj;
}

// --- Announcements CRUD ---

function rowToAnnouncement(columns, values) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj;
}

function resultToList(result) {
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map(v => rowToAnnouncement(cols, v));
}

export function getAllAnnouncements() {
  return resultToList(db.exec('SELECT * FROM announcements ORDER BY id DESC'));
}

export function getAnnouncementById(id) {
  const res = resultToList(db.exec('SELECT * FROM announcements WHERE id = ?', [id]));
  return res[0] || null;
}

export function getActiveAnnouncements() {
  return resultToList(db.exec("SELECT * FROM announcements WHERE status = 'active'"));
}

export function getAnnouncementsByOwner(ownerId) {
  return resultToList(db.exec(
    'SELECT * FROM announcements WHERE owner_id = ? ORDER BY id DESC', [ownerId]));
}

export function getSharedAnnouncements() {
  return resultToList(db.exec(
    'SELECT * FROM announcements WHERE is_shared = 1 ORDER BY id DESC'));
}

export function createAnnouncement(data) {
  const now = new Date().toISOString();
  db.run(`INSERT INTO announcements
    (name, message, target_room, schedule_type, scheduled_date,
     interval_value, interval_unit, weekly_days, time_hour, time_minute,
     monthly_day, cron_expression, start_date, end_date,
     quiet_mode, skip_if_recent, skip_minutes, status,
     created_by, owner_id, owner_username, is_shared, created_at, updated_at)
    VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?,?, ?,?,?,?, ?,?,?,?,?,?)`,
    [
      data.name, data.message, data.target_room, data.schedule_type || 'onetime',
      data.scheduled_date || null,
      data.interval_value || null, data.interval_unit || null,
      data.weekly_days ? JSON.stringify(data.weekly_days) : null,
      data.time_hour ?? null, data.time_minute ?? null,
      data.monthly_day || null, data.cron_expression || null,
      data.start_date || null, data.end_date || null,
      data.quiet_mode ? 1 : 0, data.skip_if_recent ? 1 : 0,
      data.skip_minutes || 0, 'active',
      data.created_by || null, data.owner_id || null, data.owner_username || null,
      data.is_shared ? 1 : 0, now, now,
    ]);
  persist();
  const res = db.exec('SELECT last_insert_rowid()');
  return res[0].values[0][0];
}

export function updateAnnouncement(id, data) {
  const now = new Date().toISOString();
  const fields = [];
  const vals = [];
  const allowed = [
    'name', 'message', 'target_room', 'schedule_type', 'scheduled_date',
    'interval_value', 'interval_unit', 'weekly_days', 'time_hour', 'time_minute',
    'monthly_day', 'cron_expression', 'start_date', 'end_date',
    'quiet_mode', 'skip_if_recent', 'skip_minutes', 'status',
    'fail_count', 'fail_reason', 'last_sent_at', 'last_attempt_at', 'is_shared',
  ];
  for (const k of allowed) {
    if (k in data) {
      let v = data[k];
      if (k === 'weekly_days' && Array.isArray(v)) v = JSON.stringify(v);
      if (k === 'quiet_mode' || k === 'skip_if_recent' || k === 'is_shared') v = v ? 1 : 0;
      fields.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (!fields.length) return;
  fields.push('updated_at = ?');
  vals.push(now);
  vals.push(id);
  db.run(`UPDATE announcements SET ${fields.join(', ')} WHERE id = ?`, vals);
  persist();
}

export function deleteAnnouncement(id) {
  db.run('DELETE FROM announcements WHERE id = ?', [id]);
  db.run('DELETE FROM announcement_logs WHERE announcement_id = ?', [id]);
  persist();
}

// --- Logs ---

export function createLog(announcementId, status, details, messageId) {
  db.run(`INSERT INTO announcement_logs (announcement_id, sent_at, status, details, message_id)
    VALUES (?, ?, ?, ?, ?)`,
    [announcementId, new Date().toISOString(), status, details || null, messageId || null]);
  persist();
}

export function getLogsByAnnouncement(announcementId, limit = 50) {
  return resultToList(
    db.exec('SELECT * FROM announcement_logs WHERE announcement_id = ? ORDER BY id DESC LIMIT ?',
      [announcementId, limit])
  );
}

export function getAllLogs(limit = 100) {
  return resultToList(
    db.exec('SELECT * FROM announcement_logs ORDER BY id DESC LIMIT ?', [limit])
  );
}
