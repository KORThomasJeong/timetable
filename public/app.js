// Subject color mapping → CSS variable names
const SUBJECT_COLOR_MAP = [
  { keys: ['국어', '문학', '독서', '화법', '작문'], name: 'korean' },
  { keys: ['수학', '미적', '확률', '통계'], name: 'math' },
  { keys: ['영어'], name: 'english' },
  { keys: ['과학', '물리', '화학', '생명', '지구'], name: 'science' },
  { keys: ['사회', '지리', '경제', '정치', '법', '역사'], name: 'social' },
  { keys: ['체육', '운동'], name: 'pe' },
  { keys: ['미술'], name: 'art' },
  { keys: ['음악'], name: 'music' },
  { keys: ['도덕', '윤리'], name: 'moral' },
  { keys: ['기술', '가정'], name: 'tech' },
  { keys: ['정보', '컴퓨터'], name: 'info' },
  { keys: ['한문', '한자', '중국'], name: 'chinese' },
];

function getSubjectColorName(subject) {
  if (!subject) return 'default';
  for (const { keys, name } of SUBJECT_COLOR_MAP) {
    if (keys.some(k => subject.includes(k))) return name;
  }
  // Hash-based fallback
  const names = ['korean','math','english','science','social','pe','art','music'];
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = subject.charCodeAt(i) + ((h << 5) - h);
  return names[Math.abs(h) % names.length];
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  // 주말(토/일)이면 다음 주 월요일, 평일이면 이번 주 월요일
  let offset;
  if (day === 0) offset = 1;
  else if (day === 6) offset = 2;
  else offset = -(day - 1);
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function formatWeekLabel(weekStart) {
  const d = new Date(weekStart);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 주`;
}

function formatWeekRange(weekStart) {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 4);
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function getTodayDayIdx() {
  const d = new Date().getDay();
  return d >= 1 && d <= 5 ? d - 1 : -1;
}

function getCurrentPeriodIdx(classTime) {
  if (!Array.isArray(classTime)) return -1;
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < classTime.length; i++) {
    const t = classTime[i];
    if (!t) continue;
    const timeStr = parseClassTimeStr(t.startTime || t);
    if (!timeStr) continue;
    const [h, m] = timeStr.split(':').map(Number);
    const start = h * 60 + m;
    if (hhmm >= start && hhmm < start + 45) return i;
  }
  return -1;
}

function parseClassTimeStr(str) {
  // "1(09:00)" → "09:00", "09:00" → "09:00", anything else → null
  if (!str) return null;
  const match = String(str).match(/\((\d{1,2}:\d{2})\)/);
  if (match) return match[1];
  if (/^\d{1,2}:\d{2}$/.test(String(str))) return String(str);
  return null;
}

// ── Theme ──────────────────────────────────────────────
const THEME_KEY = 'tt-theme';

function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);

  const sun = document.getElementById('icon-sun');
  const moon = document.getElementById('icon-moon');
  if (theme === 'dark') {
    sun.style.display = '';
    moon.style.display = 'none';
    document.getElementById('theme-color-meta').content = '#09090b';
    document.getElementById('status-bar-meta').content = 'black';
  } else {
    sun.style.display = 'none';
    moon.style.display = '';
    document.getElementById('theme-color-meta').content = '#ffffff';
    document.getElementById('status-bar-meta').content = 'default';
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || getSystemTheme());
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

// ── App ────────────────────────────────────────────────
class App {
  constructor() {
    this.history = [];
    this.currentWeekStart = getWeekStart(new Date());
    this.currentData = null;
    this.isSubscribed = false;
    this._periodTimer = null;
    initTheme();
    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadHistory();
    await this.loadTimetable(this.currentWeekStart);
    this.initServiceWorker();
  }

  bindEvents() {
    document.getElementById('theme-btn').addEventListener('click', toggleTheme);
    document.getElementById('notif-btn').addEventListener('click', () => this.toggleNotification());
    document.getElementById('prev-week-btn').addEventListener('click', () => this.navigateWeek(-1));
    document.getElementById('next-week-btn').addEventListener('click', () => this.navigateWeek(1));
    document.getElementById('week-select').addEventListener('change', e => this.loadTimetable(e.target.value));
    this.initPullToRefresh();
  }

  async loadHistory() {
    try {
      const res = await fetch('/api/timetable/history');
      this.history = await res.json();
    } catch {
      this.history = [];
    }
    const current = getWeekStart(new Date());
    if (!this.history.includes(current)) this.history.unshift(current);

    const sel = document.getElementById('week-select');
    sel.innerHTML = '';
    this.history.forEach(week => {
      const opt = document.createElement('option');
      opt.value = week;
      opt.textContent = week === current ? '이번 주' : formatWeekLabel(week);
      sel.appendChild(opt);
    });
  }

  async loadTimetable(weekStart) {
    this.currentWeekStart = weekStart;
    document.getElementById('week-select').value = weekStart;
    document.getElementById('week-range').textContent = formatWeekRange(weekStart);

    const idx = this.history.indexOf(weekStart);
    document.getElementById('prev-week-btn').disabled = idx >= this.history.length - 1;
    document.getElementById('next-week-btn').disabled = idx <= 0;

    document.getElementById('loading').style.display = 'flex';
    document.getElementById('timetable-container').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';

    try {
      const res = await fetch(`/api/timetable?week=${weekStart}`);
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      this.currentData = data;
      this.renderTimetable(data);
    } catch {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('empty-state').style.display = 'flex';
    }
  }

  renderTimetable(data) {
    const { schedule, classTime } = data;
    const days = ['월', '화', '수', '목', '금'];
    const todayIdx = getTodayDayIdx();
    const currentPeriod = getCurrentPeriodIdx(classTime);
    const isThisWeek = this.currentWeekStart === getWeekStart(new Date());

    // Compute max periods (only up to last non-empty)
    let maxPeriods = 0;
    days.forEach(day => {
      const periods = schedule[day] || [];
      for (let i = periods.length - 1; i >= 0; i--) {
        if (periods[i].subject) { maxPeriods = Math.max(maxPeriods, i + 1); break; }
      }
    });
    if (maxPeriods === 0) maxPeriods = 7;

    const container = document.getElementById('timetable-container');

    // Build grid
    const card = document.createElement('div');
    card.className = 'timetable-card';

    const grid = document.createElement('div');
    grid.className = 'tt-grid';

    // Header row: empty corner + day headers
    const corner = document.createElement('div');
    corner.className = 'tt-period-num-header';
    grid.appendChild(corner);

    days.forEach((day, i) => {
      const cell = document.createElement('div');
      cell.className = 'tt-day-cell' + (isThisWeek && i === todayIdx ? ' today' : '');
      cell.textContent = day;
      grid.appendChild(cell);
    });

    // Period rows
    for (let p = 0; p < maxPeriods; p++) {
      const isLastRow = p === maxPeriods - 1;

      // Period label
      const label = document.createElement('div');
      label.className = 'tt-period-label' + (isLastRow ? ' tt-last-row' : '');
      const ct = Array.isArray(classTime) ? classTime[p] : null;
      const timeStr = ct ? (parseClassTimeStr(ct.startTime || ct) || '') : '';
      label.innerHTML = `<span class="period-num">${p + 1}</span>${timeStr ? `<span class="period-time">${timeStr}</span>` : ''}`;
      grid.appendChild(label);

      // Subject cells
      days.forEach((day, dayIdx) => {
        const cell = document.createElement('div');
        const isToday = isThisWeek && dayIdx === todayIdx;
        const isCurrent = isToday && p === currentPeriod;

        cell.className = 'tt-cell' +
          (isToday ? ' today-col' : '') +
          (isCurrent ? ' current' : '') +
          (isLastRow ? ' tt-last-row' : '');

        const periods = schedule[day] || [];
        const pd = periods[p];
        const subj = pd?.subject || '';
        const teacher = pd?.teacher || '';

        if (subj) {
          const colorName = getSubjectColorName(subj);
          const badge = document.createElement('span');
          badge.className = 'subj-badge';
          badge.textContent = subj;
          badge.style.setProperty('--subj-color-bg', `color-mix(in srgb, var(--subj-${colorName}) 15%, var(--background))`);
          badge.style.setProperty('--subj-color-text', `var(--subj-${colorName})`);
          cell.appendChild(badge);

          if (teacher) {
            const t = document.createElement('span');
            t.className = 'subj-teacher';
            t.textContent = teacher;
            cell.appendChild(t);
          }
        }

        grid.appendChild(cell);
      });
    }

    card.appendChild(grid);
    container.innerHTML = '';
    container.appendChild(card);

    // Fetched info
    let info = document.getElementById('fetched-info');
    if (!info) {
      info = document.createElement('p');
      info.id = 'fetched-info';
      info.className = 'fetched-info';
      container.appendChild(info);
    }
    info.textContent = `업데이트: ${new Date(data.fetchedAt).toLocaleString('ko-KR')}`;

    document.getElementById('loading').style.display = 'none';
    document.getElementById('timetable-container').style.display = 'block';

    if (isThisWeek) {
      clearInterval(this._periodTimer);
      this._periodTimer = setInterval(() => this.renderTimetable(this.currentData), 60000);
    }
  }

  navigateWeek(direction) {
    const idx = this.history.indexOf(this.currentWeekStart);
    const next = idx - direction;
    if (next >= 0 && next < this.history.length) this.loadTimetable(this.history[next]);
  }

  async refresh() {
    await this.loadHistory();
    await this.loadTimetable(this.currentWeekStart);
    this.showToast('새로고침 완료');
  }

  showToast(msg, ms = 2500) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms);
  }

  initPullToRefresh() {
    let startY = 0, pulling = false;
    const ind = document.getElementById('ptr-indicator');
    document.addEventListener('touchstart', e => {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (pulling && e.touches[0].clientY - startY > 70) ind.classList.add('visible');
    }, { passive: true });
    document.addEventListener('touchend', async () => {
      if (!pulling) return;
      pulling = false;
      if (ind.classList.contains('visible')) {
        ind.classList.remove('visible');
        await this.refresh();
      }
    }, { passive: true });
  }

  // ── Push notifications ─────────────────────────────
  async initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      this.isSubscribed = !!sub;
      this.updateNotifBtn();
    } catch (err) {
      console.warn('SW failed:', err);
    }
  }

  async toggleNotification() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.showToast('이 브라우저는 푸시 알림을 지원하지 않습니다');
      return;
    }
    this.isSubscribed ? await this.unsubscribe() : await this.subscribe();
  }

  async subscribe() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { this.showToast('알림 권한이 거부되었습니다'); return; }
      const { key } = await (await fetch('/api/vapid-key')).json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
      this.isSubscribed = true;
      this.updateNotifBtn();
      this.showToast('알림이 설정되었습니다');
    } catch (err) {
      this.showToast('알림 설정 실패: ' + err.message);
    }
  }

  async unsubscribe() {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        await sub.unsubscribe();
      }
      this.isSubscribed = false;
      this.updateNotifBtn();
      this.showToast('알림이 해제되었습니다');
    } catch { this.showToast('알림 해제 실패'); }
  }

  updateNotifBtn() {
    const btn = document.getElementById('notif-btn');
    const bell = document.getElementById('icon-bell');
    const bellOff = document.getElementById('icon-bell-off');
    btn.classList.toggle('active', this.isSubscribed);
    bell.style.display = this.isSubscribed ? 'none' : '';
    bellOff.style.display = this.isSubscribed ? '' : 'none';
  }
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

const app = new App();
window.app = app;
