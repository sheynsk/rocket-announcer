import { readdir, readFile } from 'fs/promises';
import { extname, basename, join, resolve } from 'path';

const RC_URL = process.env.RC_URL;
const RC_USER_ID = process.env.RC_USER_ID;
const RC_TOKEN = process.env.RC_TOKEN;
const EMOJI_DIR = resolve(process.env.EMOJI_DIR || './emojis');
const DEFAULT_ALIASES = (process.env.EMOJI_ALIASES || '').split(',').map(s => s.trim()).filter(Boolean);
const ALIASES_FILE = process.env.ALIASES_FILE ? resolve(process.env.ALIASES_FILE) : '';
const RECURSIVE = process.env.RECURSIVE !== '0';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!RC_URL || !RC_USER_ID || !RC_TOKEN) {
  console.error('Missing env vars: RC_URL, RC_USER_ID, RC_TOKEN');
  process.exit(1);
}

const allowedExt = new Set(['.png', '.gif', '.jpg', '.jpeg', '.webp', '.svg']);
const emojiIndexCache = new Map();
let aliasesFromFile = {};

function mimeTypeFor(fileExt) {
  switch (fileExt.toLowerCase()) {
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function emojiNameFromFilename(fileName) {
  return basename(fileName, extname(fileName))
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function parseAliasesValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map(item => item.trim()).filter(Boolean);
  }

  return [];
}

async function loadAliasesFile() {
  if (!ALIASES_FILE) return;

  const raw = await readFile(ALIASES_FILE, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    for (const [name, value] of Object.entries(parsed)) {
      aliasesFromFile[normalizeKey(name)] = parseAliasesValue(value);
    }
    return;
  }

  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;

    const separatorIndex = clean.search(/[:=]/);
    if (separatorIndex < 0) continue;

    const name = clean.slice(0, separatorIndex).trim();
    const aliases = clean.slice(separatorIndex + 1).trim();
    if (!name || !aliases) continue;
    aliasesFromFile[normalizeKey(name)] = parseAliasesValue(aliases);
  }
}

async function walkEmojiFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (RECURSIVE) {
        await walkEmojiFiles(fullPath, files);
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function listExistingEmojis() {
  const res = await fetch(`${RC_URL.replace(/\/+$/, '')}/api/v1/emoji-custom.list`, {
    headers: {
      'X-User-Id': RC_USER_ID,
      'X-Auth-Token': RC_TOKEN,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  const list = Array.isArray(data.emojis) ? data.emojis : (Array.isArray(data.result) ? data.result : []);
  for (const emoji of list) {
    if (emoji?.name) {
      emojiIndexCache.set(normalizeKey(emoji.name), emoji);
    }
  }
}

function aliasesForEmoji(name) {
  const fromFile = aliasesFromFile[normalizeKey(name)] || [];
  return [...DEFAULT_ALIASES, ...fromFile].filter(Boolean);
}

async function sendEmojiRequest(path, form) {
  const res = await fetch(`${RC_URL.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'X-User-Id': RC_USER_ID,
      'X-Auth-Token': RC_TOKEN,
    },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`);
  }

  return data;
}

async function uploadEmoji(filePath) {
  const fileName = basename(filePath);
  const ext = extname(fileName).toLowerCase();

  if (!allowedExt.has(ext)) {
    console.log(`skip ${fileName} (unsupported extension)`);
    return;
  }

  const name = emojiNameFromFilename(fileName);
  if (!name) {
    console.log(`skip ${fileName} (empty emoji name)`);
    return;
  }

  const aliases = aliasesForEmoji(name);
  const existing = emojiIndexCache.get(normalizeKey(name));
  const action = existing ? 'update' : 'create';

  if (DRY_RUN) {
    const suffix = existing ? ` (update ${existing._id || 'existing'})` : '';
    console.log(`[dry-run] would ${action} ${fileName} as :${name}:${suffix}`);
    return;
  }

  const buffer = await readFile(filePath);
  const blob = new Blob([buffer], { type: mimeTypeFor(ext) });
  const form = new FormData();
  form.append('emoji', blob, fileName);
  form.append('name', name);

  if (aliases.length) {
    form.append('aliases', aliases.join(','));
  }

  if (existing?._id) {
    form.append('_id', existing._id);
    await sendEmojiRequest('/api/v1/emoji-custom.update', form);
    console.log(`updated ${fileName} as :${name}:`);
    return;
  }

  await sendEmojiRequest('/api/v1/emoji-custom.create', form);
  console.log(`uploaded ${fileName} as :${name}:`);
}

async function main() {
  await loadAliasesFile();
  await listExistingEmojis();
  const files = await walkEmojiFiles(EMOJI_DIR);

  if (!files.length) {
    console.log(`No files found in ${EMOJI_DIR}`);
    return;
  }

  for (const filePath of files) {
    try {
      await uploadEmoji(filePath);
    } catch (e) {
      console.error(`failed ${basename(filePath)}: ${e.message}`);
    }
  }
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
