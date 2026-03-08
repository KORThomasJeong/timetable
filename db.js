const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'timetable.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS timetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    data TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE(week_start)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토
  // 주말(토/일)이면 다음 주 월요일, 평일이면 이번 주 월요일
  let offset;
  if (day === 0) offset = 1;        // 일요일 → 내일(월)
  else if (day === 6) offset = 2;   // 토요일 → 모레(월)
  else offset = -(day - 1);         // 월~금 → 이번 주 월요일
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

const queries = {
  upsertTimetable: db.prepare(`
    INSERT INTO timetables (week_start, data, fetched_at)
    VALUES (@week_start, @data, @fetched_at)
    ON CONFLICT(week_start) DO UPDATE SET
      data = excluded.data,
      fetched_at = excluded.fetched_at
  `),

  getTimetable: db.prepare(`
    SELECT * FROM timetables WHERE week_start = ?
  `),

  getHistory: db.prepare(`
    SELECT week_start FROM timetables ORDER BY week_start DESC
  `),

  addSubscription: db.prepare(`
    INSERT OR REPLACE INTO subscriptions (endpoint, p256dh, auth)
    VALUES (@endpoint, @p256dh, @auth)
  `),

  removeSubscription: db.prepare(`
    DELETE FROM subscriptions WHERE endpoint = ?
  `),

  getAllSubscriptions: db.prepare(`
    SELECT * FROM subscriptions
  `),

  removeSubscriptionById: db.prepare(`
    DELETE FROM subscriptions WHERE id = ?
  `),

  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  setSetting: db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`),
  getAllSettings: db.prepare(`SELECT key, value FROM settings`)
};

module.exports = { db, queries, getWeekStart };
