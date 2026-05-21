import cron from 'node-cron';
import {
  getActiveAnnouncements, updateAnnouncement, createLog, getSetting,
} from './db.js';
import { sendToRoom } from './rocket.js';
import { processTemplate } from './templates.js';

const RETRY_DELAYS = [60_000, 300_000, 1_800_000]; // 1m, 5m, 30m

export function startScheduler() {
  cron.schedule('* * * * *', () => {
    tick().catch(err => console.error('[scheduler] tick error:', err));
  });
  console.log('[scheduler] started — checking every 60 seconds');
}

async function tick() {
  const announcements = getActiveAnnouncements();
  const now = new Date();

  console.log(`[scheduler] tick at ${now.toISOString()} — ${announcements.length} active announcement(s)`);

  for (const ann of announcements) {
    try {
      const fire = shouldFire(ann, now);
      console.log(`[scheduler]   "${ann.name}" (${ann.schedule_type}) shouldFire=${fire} last_sent=${ann.last_sent_at || 'never'}`);

      if (!fire) continue;

      if (ann.start_date && new Date(ann.start_date) > now) {
        console.log(`[scheduler]   "${ann.name}" skipped — start_date ${ann.start_date} is in the future`);
        continue;
      }
      if (ann.end_date && new Date(ann.end_date) < now) {
        console.log(`[scheduler]   "${ann.name}" skipped — end_date ${ann.end_date} has passed`);
        continue;
      }

      await sendAnnouncement(ann, now);
    } catch (e) {
      handleFailure(ann, e);
    }
  }
}

function shouldFire(ann, now) {
  switch (ann.schedule_type) {
    case 'onetime': return shouldFireOnetime(ann, now);
    case 'interval': return shouldFireInterval(ann, now);
    case 'weekly':   return shouldFireWeekly(ann, now);
    case 'monthly':  return shouldFireMonthly(ann, now);
    case 'cron':     return shouldFireCron(ann, now);
    default: return false;
  }
}

function shouldFireOnetime(ann, now) {
  if (ann.last_sent_at) return false;
  if (!ann.scheduled_date) return false;
  return new Date(ann.scheduled_date) <= now;
}

function shouldFireInterval(ann, now) {
  if (!ann.interval_value || !ann.interval_unit) return false;
  const lastSent = ann.last_sent_at ? new Date(ann.last_sent_at) : null;
  if (!lastSent) return true;

  const ms = intervalToMs(ann.interval_value, ann.interval_unit);
  return (now - lastSent) >= ms;
}

function intervalToMs(value, unit) {
  switch (unit) {
    case 'minutes': return value * 60_000;
    case 'hours':   return value * 3_600_000;
    case 'days':    return value * 86_400_000;
    default: return value * 60_000;
  }
}

function shouldFireWeekly(ann, now) {
  let days;
  try { days = JSON.parse(ann.weekly_days); } catch { return false; }
  if (!Array.isArray(days) || !days.includes(now.getDay())) return false;
  if (ann.time_hour == null) return false;

  const h = ann.time_hour;
  const m = ann.time_minute || 0;
  if (now.getHours() !== h || now.getMinutes() !== m) return false;

  return !firedThisMinute(ann, now);
}

function shouldFireMonthly(ann, now) {
  if (ann.monthly_day == null) return false;

  let targetDay = ann.monthly_day;
  if (targetDay === -1 || targetDay === 0) {
    targetDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  if (now.getDate() !== targetDay) return false;

  const h = ann.time_hour ?? 0;
  const m = ann.time_minute ?? 0;
  if (now.getHours() !== h || now.getMinutes() !== m) return false;

  return !firedThisMinute(ann, now);
}

function shouldFireCron(ann, now) {
  if (!ann.cron_expression) return false;
  if (!matchesCron(ann.cron_expression, now)) return false;
  return !firedThisMinute(ann, now);
}

function firedThisMinute(ann, now) {
  if (!ann.last_sent_at) return false;
  const last = new Date(ann.last_sent_at);
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate() &&
    last.getHours() === now.getHours() &&
    last.getMinutes() === now.getMinutes()
  );
}

// Simple 5-field cron matcher: minute hour day month weekday
function matchesCron(expression, date) {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const checks = [
    { val: date.getMinutes(), field: parts[0], max: 59 },
    { val: date.getHours(),   field: parts[1], max: 23 },
    { val: date.getDate(),    field: parts[2], max: 31 },
    { val: date.getMonth() + 1, field: parts[3], max: 12 },
    { val: date.getDay(),     field: parts[4], max: 7 },
  ];

  return checks.every(({ val, field, max }) => fieldMatches(val, field, max));
}

function fieldMatches(value, field, max) {
  if (field === '*') return true;

  // handle step: */N or N-M/S
  if (field.includes('/')) {
    const [range, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;
    if (range === '*') return value % step === 0;
    const [lo] = range.split('-').map(Number);
    return value >= lo && (value - lo) % step === 0;
  }

  // handle list: 1,3,5
  if (field.includes(',')) {
    return field.split(',').some(p => fieldMatches(value, p.trim(), max));
  }

  // handle range: 1-5
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number);
    return value >= lo && value <= hi;
  }

  return parseInt(field, 10) === value;
}

async function sendAnnouncement(ann, now) {
  const alias = ann.created_by || getSetting('bot_alias') || 'AutoAnnouncer';
  const text = processTemplate(ann.message);

  console.log(`[scheduler] sending "${ann.name}" -> ${ann.target_room}`);

  const result = await sendToRoom(ann.target_room, text, alias);
  const msgId = result?.message?._id || null;

  createLog(ann.id, 'success', `Scheduled send (${ann.schedule_type})`, msgId);
  updateAnnouncement(ann.id, {
    last_sent_at: now.toISOString(),
    last_attempt_at: now.toISOString(),
    fail_count: 0,
    fail_reason: null,
  });

  if (ann.schedule_type === 'onetime') {
    updateAnnouncement(ann.id, { status: 'paused' });
  }

  console.log(`[scheduler] sent "${ann.name}" ok, msgId=${msgId}`);
}

function handleFailure(ann, error) {
  const newFail = (ann.fail_count || 0) + 1;
  const msg = error.message || String(error);
  console.error(`[scheduler] failed "${ann.name}" (attempt ${newFail}): ${msg}`);

  createLog(ann.id, 'error', msg);

  if (newFail >= RETRY_DELAYS.length) {
    updateAnnouncement(ann.id, {
      status: 'failed',
      fail_count: newFail,
      fail_reason: msg,
      last_attempt_at: new Date().toISOString(),
    });
  } else {
    updateAnnouncement(ann.id, {
      fail_count: newFail,
      fail_reason: msg,
      last_attempt_at: new Date().toISOString(),
    });
  }
}
