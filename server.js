require('dotenv').config();
const express = require('express');
const path = require('path');
const { queries, getWeekStart } = require('./db');
const { vapidPublicKey, sendPushToAll } = require('./push');
const { startScheduler, checkAndUpdate } = require('./scheduler');
const { searchSchools } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 이번 주 또는 특정 주 시간표 조회
app.get('/api/timetable', (req, res) => {
  const weekParam = req.query.week;
  let weekStart;

  if (!weekParam || weekParam === 'current') {
    weekStart = getWeekStart(new Date());
  } else {
    weekStart = weekParam; // YYYY-MM-DD 형식
  }

  let row = queries.getTimetable.get(weekStart);

  // 계산된 주가 DB에 없으면 날짜가 가장 가까운 주로 폴백
  if (!row && (!weekParam || weekParam === 'current')) {
    const history = queries.getHistory.all();
    if (history.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      // 오늘 이후이거나 가장 최근 주 선택
      const best = history.find(h => h.week_start >= today) || history[0];
      row = queries.getTimetable.get(best.week_start);
      weekStart = best.week_start;
    }
  }

  if (!row) {
    return res.status(404).json({ error: '해당 주 시간표 없음', weekStart });
  }

  res.json({
    weekStart: row.week_start,
    fetchedAt: row.fetched_at,
    ...JSON.parse(row.data)
  });
});

// 저장된 모든 주 목록
app.get('/api/timetable/history', (req, res) => {
  const rows = queries.getHistory.all();
  res.json(rows.map(r => r.week_start));
});

// 공개 VAPID 키
app.get('/api/vapid-key', (req, res) => {
  res.json({ key: vapidPublicKey });
});

// 푸시 구독 등록
app.post('/api/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: '잘못된 구독 데이터' });
  }
  queries.addSubscription.run({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
  res.json({ ok: true });
});

// 푸시 구독 해제
app.delete('/api/subscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint 필요' });
  queries.removeSubscription.run(endpoint);
  res.json({ ok: true });
});

// 테스트 푸시 (개발용)
app.post('/api/test-push', async (req, res) => {
  const subs = queries.getAllSubscriptions.all();
  if (subs.length === 0) return res.json({ ok: false, message: '구독자 없음' });
  const result = await sendPushToAll(subs, {
    title: '테스트 알림',
    body: '시간표 앱 푸시 알림 테스트',
    url: '/'
  });
  res.json({ ok: true, ...result });
});

// 수동 업데이트 트리거 (개발용)
app.post('/api/refresh', async (req, res) => {
  try {
    const result = await checkAndUpdate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 현재 설정 (공개)
app.get('/api/config', (req, res) => {
  const schoolName = queries.getSetting.get('school_name')?.value || '홍천중학교';
  const grade = queries.getSetting.get('grade')?.value || '1';
  const classNum = queries.getSetting.get('class_num')?.value || '3';
  res.json({ schoolName, grade, classNum });
});

// ── Admin ────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return next();

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).json({ error: '인증 필요' });
  }

  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const colonIdx = decoded.indexOf(':');
  const pass = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : '';
  if (pass === password) return next();

  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).json({ error: '인증 실패' });
}

app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/api/settings', adminAuth, (req, res) => {
  const rows = queries.getAllSettings.all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/admin/api/settings', adminAuth, (req, res) => {
  const { school_code, school_name, grade, class_num } = req.body;
  if (school_code !== undefined) queries.setSetting.run('school_code', String(school_code));
  if (school_name) queries.setSetting.run('school_name', school_name);
  if (grade) queries.setSetting.run('grade', String(grade));
  if (class_num) queries.setSetting.run('class_num', String(class_num));
  res.json({ ok: true });
});

app.get('/admin/api/search', adminAuth, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: '검색어 필요' });
  try {
    const schools = await searchSchools(q);
    res.json(schools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/refresh', adminAuth, async (req, res) => {
  try {
    const result = await checkAndUpdate();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`서버 시작: http://localhost:${PORT}`);
  startScheduler();
});
