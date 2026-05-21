async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

document.addEventListener('alpine:init', () => {

  Alpine.store('toast', {
    msg: '', type: '', timer: null,
    show(msg, type = 'success') {
      this.msg = msg; this.type = type;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.msg = ''; }, 3500);
    }
  });

  Alpine.data('app', () => ({
    page: 'login',
    user: null,
    loading: false,

    // login
    loginUser: '', loginPass: '', loginError: '',

    // announcements list
    announcements: [],
    listTab: 'my', // 'my' | 'shared'
    announcementSort: 'date-desc', // 'date-desc' | 'date-asc' | 'name-asc' | 'status'
    announcementChannel: '',
    announcementTargetType: 'all', // 'all' | 'channel' | 'group' | 'dm'

    // form
    form: emptyForm(),
    editingId: null,
    rooms: [],

    // logs
    logs: [],
    logFilter: '',

    // settings
    settings: {},
    settingsTestResult: '',

    // setup
    setupUrl: '', setupUserId: '', setupToken: '', setupAlias: 'AutoAnnouncer',

    async init() {
      try {
        const s = await api('GET', '/setup/status');
        if (!s.configured) { this.page = 'setup'; return; }
      } catch {}
      try {
        const me = await api('GET', '/auth/me');
        this.user = me.user;
        this.page = 'list';
        this.loadRooms();
        this.loadAnnouncements();
      } catch { /* not logged in */ }
    },

    async finishSetup() {
      if (!this.setupUrl) { Alpine.store('toast').show('Укажите URL Rocket.Chat', 'error'); return; }
      try {
        await api('PUT', '/setup', {
          rc_url: this.setupUrl,
          rc_user_id: this.setupUserId,
          rc_token: this.setupToken,
          bot_alias: this.setupAlias || 'AutoAnnouncer',
        });
        Alpine.store('toast').show('Настройки сохранены!');
        this.page = 'login';
      } catch (e) { Alpine.store('toast').show(e.message, 'error'); }
    },

    // ---- Auth ----
    async login() {
      this.loginError = '';
      try {
        const res = await api('POST', '/auth/login', { user: this.loginUser, password: this.loginPass });
        this.user = res.user;
        this.page = 'list';
        this.loadAnnouncements();
      } catch (e) { this.loginError = e.message; }
    },
    async logout() {
      await api('POST', '/auth/logout').catch(() => {});
      this.user = null;
      this.page = 'login';
    },

    // ---- List ----
    async loadAnnouncements() {
      const params = new URLSearchParams({ scope: this.listTab });
      if (this.announcementChannel) params.set('channel', this.announcementChannel);
      this.announcements = await api('GET', `/announcements?${params.toString()}`);
    },
    switchTab(tab) {
      this.listTab = tab;
      this.loadAnnouncements();
    },
    setAnnouncementChannel(channel) {
      this.announcementChannel = channel;
      this.loadAnnouncements();
    },
    getRoomTypeByName(name) {
      const room = this.rooms.find(r => String(r.name || '').toLowerCase() === String(name || '').toLowerCase());
      if (!room) return null;
      if (room.type === 'c') return 'channel';
      if (room.type === 'p') return 'group';
      return room.type || null;
    },
    getAnnouncementTargetType(ann) {
      const target = String(ann.target_room || '').trim();
      if (!target) return 'unknown';
      if (target.startsWith('@')) return 'dm';
      if (target.startsWith('#')) {
        return this.getRoomTypeByName(target.slice(1)) || 'channel';
      }
      return 'unknown';
    },
    getAnnouncementTargetLabel(ann) {
      return {
        channel: 'Канал',
        group: 'Приватная группа',
        dm: 'Личное сообщение',
        unknown: 'Неизвестно',
      }[this.getAnnouncementTargetType(ann)] || 'Неизвестно';
    },
    matchesTargetType(ann) {
      if (this.announcementTargetType === 'all') return true;
      return this.getAnnouncementTargetType(ann) === this.announcementTargetType;
    },
    getAnnouncementSortValue(ann) {
      const raw = ann.scheduled_date || ann.created_at || ann.updated_at;
      const ts = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(ts) ? ts : 0;
    },
    getAnnouncementStatusRank(status) {
      return { active: 0, paused: 1, failed: 2 }[status] ?? 3;
    },
    getAnnouncementGroupKey(ann) {
      const raw = ann.scheduled_date || ann.created_at || ann.updated_at;
      const ts = raw ? Date.parse(raw) : NaN;
      if (!Number.isFinite(ts)) return 'no-date';
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    getAnnouncementGroupLabel(ann) {
      const raw = ann.scheduled_date || ann.created_at || ann.updated_at;
      const ts = raw ? Date.parse(raw) : NaN;
      if (!Number.isFinite(ts)) return 'Без даты';
      return new Date(ts).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    },
    compareAnnouncements(a, b, mode = this.announcementSort) {
      const ad = this.getAnnouncementSortValue(a);
      const bd = this.getAnnouncementSortValue(b);

      if (mode === 'date-asc' || mode === 'date-desc') {
        const dir = mode === 'date-asc' ? 1 : -1;
        if (ad !== bd) return (ad - bd) * dir;
        return ((Number(a.id) || 0) - (Number(b.id) || 0)) * dir;
      }

      if (mode === 'status') {
        const ar = this.getAnnouncementStatusRank(a.status);
        const br = this.getAnnouncementStatusRank(b.status);
        if (ar !== br) return ar - br;
        const byName = String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return bd - ad;
      }

      const byName = String(a.name || '').localeCompare(String(b.name || ''), 'ru', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return bd - ad;
    },
    get sortedAnnouncements() {
      return [...this.announcements]
        .filter(ann => this.matchesTargetType(ann))
        .sort((a, b) => this.compareAnnouncements(a, b));
    },
    get groupedAnnouncements() {
      const groups = new Map();
      for (const ann of this.sortedAnnouncements) {
        const key = this.getAnnouncementGroupKey(ann);
        if (!groups.has(key)) {
          groups.set(key, {
            key,
            label: this.getAnnouncementGroupLabel(ann),
            sortValue: this.getAnnouncementSortValue(ann),
            items: [],
          });
        }
        groups.get(key).items.push(ann);
      }

      const groupsList = [...groups.values()].map(group => ({
        ...group,
        items: [...group.items].sort((a, b) => this.compareAnnouncements(a, b, this.announcementSort)),
      }));

      const groupDir = this.announcementSort === 'date-asc' ? 1 : -1;
      return groupsList.sort((a, b) => {
        if (a.sortValue !== b.sortValue) return (a.sortValue - b.sortValue) * groupDir;
        return a.label.localeCompare(b.label, 'ru', { sensitivity: 'base' }) * groupDir;
      });
    },
    isOwner(ann) {
      return ann.owner_id === this.user?.id;
    },
    statusClass(s) {
      return 'status-' + s;
    },
    scheduleLabel(ann) {
      switch(ann.schedule_type) {
        case 'onetime': return 'Разовое' + (ann.scheduled_date ? ' — ' + fmtDate(ann.scheduled_date) : '');
        case 'interval': return `Каждые ${ann.interval_value} ${unitLabel(ann.interval_unit)}`;
        case 'weekly': {
          let days = ''; try { days = JSON.parse(ann.weekly_days).map(dayName).join(', '); } catch {}
          return `Еженед. ${days} ${pad(ann.time_hour)}:${pad(ann.time_minute)}`;
        }
        case 'monthly': return `Ежемес. ${ann.monthly_day}-е ${pad(ann.time_hour)}:${pad(ann.time_minute)}`;
        case 'cron': return `Cron: ${ann.cron_expression}`;
        default: return ann.schedule_type;
      }
    },

    // ---- Create / Edit ----
    openCreate() {
      this.form = emptyForm();
      this.editingId = null;
      this.page = 'form';
      this.loadRooms();
    },
    openEdit(ann) {
      this.editingId = ann.id;
      this.form = {
        name: ann.name,
        message: ann.message,
        target_room: ann.target_room,
        schedule_type: ann.schedule_type,
        scheduled_date: ann.scheduled_date ? ann.scheduled_date.slice(0, 16) : '',
        interval_value: ann.interval_value || 5,
        interval_unit: ann.interval_unit || 'minutes',
        weekly_days: safeParseJSON(ann.weekly_days, []),
        time_hour: ann.time_hour ?? 9,
        time_minute: ann.time_minute ?? 0,
        monthly_day: ann.monthly_day || 1,
        cron_expression: ann.cron_expression || '',
        start_date: ann.start_date ? ann.start_date.slice(0, 16) : '',
        end_date: ann.end_date ? ann.end_date.slice(0, 16) : '',
        quiet_mode: !!ann.quiet_mode,
        skip_if_recent: !!ann.skip_if_recent,
        skip_minutes: ann.skip_minutes || 10,
        is_shared: !!ann.is_shared,
      };
      this.page = 'form';
      this.loadRooms();
    },
    toggleDay(d) {
      const idx = this.form.weekly_days.indexOf(d);
      if (idx >= 0) this.form.weekly_days.splice(idx, 1);
      else this.form.weekly_days.push(d);
    },
    async saveForm() {
      const payload = { ...this.form };
      if (payload.scheduled_date) payload.scheduled_date = new Date(payload.scheduled_date).toISOString();
      if (payload.start_date) payload.start_date = new Date(payload.start_date).toISOString();
      if (payload.end_date) payload.end_date = new Date(payload.end_date).toISOString();

      try {
        if (this.editingId) {
          await api('PUT', `/announcements/${this.editingId}`, payload);
          Alpine.store('toast').show('Анонс обновлён');
        } else {
          await api('POST', '/announcements', payload);
          Alpine.store('toast').show('Анонс создан');
        }
        this.page = 'list';
        this.loadAnnouncements();
      } catch (e) {
        Alpine.store('toast').show(e.message, 'error');
      }
    },

    async deleteAnn(id) {
      if (!confirm('Удалить анонс?')) return;
      await api('DELETE', `/announcements/${id}`);
      Alpine.store('toast').show('Удалён');
      this.loadAnnouncements();
    },
    async toggleAnn(id) {
      const res = await api('POST', `/announcements/${id}/toggle`);
      Alpine.store('toast').show(`Статус: ${res.status}`);
      this.loadAnnouncements();
    },
    async sendNow(id) {
      try {
        await api('POST', `/announcements/${id}/send-now`);
        Alpine.store('toast').show('Отправлено!');
        this.loadAnnouncements();
      } catch (e) {
        Alpine.store('toast').show(e.message, 'error');
      }
    },

    async loadRooms() {
      try {
        this.rooms = await api('GET', '/rooms');
      } catch {
        this.rooms = [];
      }
    },

    // ---- Logs ----
    async openLogs(annId) {
      this.logFilter = annId || '';
      try {
        this.logs = annId
          ? await api('GET', `/announcements/${annId}/logs`)
          : await api('GET', '/logs');
      } catch { this.logs = []; }
      this.page = 'logs';
    },

    // ---- Settings ----
    async openSettings() {
      try { this.settings = await api('GET', '/settings'); } catch {}
      this.settingsTestResult = '';
      this.page = 'settings';
    },
    async saveSettings() {
      try {
        await api('PUT', '/settings', this.settings);
        Alpine.store('toast').show('Настройки сохранены');
      } catch (e) {
        Alpine.store('toast').show(e.message, 'error');
      }
    },
    async testRcConnection() {
      this.settingsTestResult = 'Проверяю...';
      try {
        const r = await api('POST', '/settings/test');
        this.settingsTestResult = `OK — подключён как ${r.username} (${r.name})`;
      } catch (e) {
        this.settingsTestResult = 'Ошибка: ' + e.message;
      }
    },
  }));
});

function emptyForm() {
  return {
    name: '', message: '', target_room: '', schedule_type: 'onetime',
    scheduled_date: '', interval_value: 5, interval_unit: 'minutes',
    weekly_days: [], time_hour: 9, time_minute: 0, monthly_day: 1,
    cron_expression: '', start_date: '', end_date: '',
    quiet_mode: false, skip_if_recent: false, skip_minutes: 10,
    is_shared: false,
  };
}

function pad(n) { return String(n ?? 0).padStart(2, '0'); }
function fmtDate(s) { if (!s) return ''; try { return new Date(s).toLocaleString('ru-RU', { hour12: false }); } catch { return s; } }
function unitLabel(u) { return { minutes: 'мин.', hours: 'ч.', days: 'дн.' }[u] || u; }
function dayName(d) { return ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d] || d; }
function safeParseJSON(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
