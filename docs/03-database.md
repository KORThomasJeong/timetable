# 03. 데이터베이스

## 사용 기술: SQLite + better-sqlite3

**SQLite**는 별도 서버 없이 파일 하나(`data/timetable.db`)로 동작하는 가벼운 데이터베이스입니다.
설치가 필요 없고 파일만 있으면 되기 때문에 소규모 프로젝트에 적합합니다.

**better-sqlite3**는 Node.js에서 SQLite를 사용하기 위한 라이브러리입니다.
비동기가 아닌 **동기(synchronous)** 방식으로 동작해 코드가 단순합니다.

---

## 테이블 구조

### 1. `timetables` — 시간표 저장

```sql
CREATE TABLE timetables (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,    -- 해당 주 월요일 날짜 (예: '2026-03-09')
  data       TEXT NOT NULL,    -- 시간표 JSON 문자열
  fetched_at TEXT NOT NULL,    -- 수집한 시각 (ISO 8601)
  UNIQUE(week_start)           -- 같은 주는 하나만 저장
);
```

**저장 예시:**

| id | week_start | data | fetched_at |
|----|------------|------|------------|
| 1 | 2026-03-09 | `{"classTime":[...],"schedule":{...}}` | 2026-03-08T10:00:00Z |
| 2 | 2026-03-16 | `{"classTime":[...],"schedule":{...}}` | 2026-03-08T10:00:00Z |

---

### 2. `subscriptions` — 푸시 알림 구독자

```sql
CREATE TABLE subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT UNIQUE NOT NULL,  -- 브라우저가 발급한 고유 URL
  p256dh     TEXT NOT NULL,         -- 암호화 공개키
  auth       TEXT NOT NULL,         -- 인증 시크릿
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

> 💡 `endpoint`, `p256dh`, `auth` 는 브라우저가 푸시 구독 시 자동으로 발급합니다.
> 서버는 이 3가지 값으로 해당 브라우저에 푸시 메시지를 보낼 수 있습니다.

---

### 3. `settings` — 관리자 설정

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**저장되는 설정값:**

| key | 예시 값 | 설명 |
|-----|---------|------|
| `school_code` | `20634` | 컴시간 학교 코드 |
| `school_name` | `홍천중학교` | 학교 이름 |
| `grade` | `1` | 학년 |
| `class_num` | `3` | 반 번호 |

---

## 핵심 쿼리 설명

### Upsert (삽입 또는 업데이트)

같은 주차 데이터가 이미 있으면 업데이트, 없으면 삽입합니다.

```javascript
db.prepare(`
  INSERT INTO timetables (week_start, data, fetched_at)
  VALUES (@week_start, @data, @fetched_at)
  ON CONFLICT(week_start) DO UPDATE SET
    data = excluded.data,
    fetched_at = excluded.fetched_at
`);
```

> 💡 `ON CONFLICT ... DO UPDATE` 는 SQLite의 upsert 문법입니다.
> `UNIQUE(week_start)` 제약이 있기 때문에 동일한 주차를 두 번 삽입하려 하면
> 기존 행을 업데이트합니다.

---

### 변경 감지

스케줄러가 기존 데이터와 새 데이터를 **JSON 문자열로 비교**합니다.

```javascript
const existing = queries.getTimetable.get(weekStart);
const freshJson = JSON.stringify({ classTime, schedule });

if (!existing) {
  // 처음 저장
} else if (existing.data !== freshJson) {
  // 변경됨 → 업데이트 + 푸시 발송
} else {
  // 변경 없음
}
```

---

## DB 파일 위치

```
timetable/
└── data/
    └── timetable.db   ← 이 파일에 모든 데이터가 저장됩니다
```

Docker 환경에서는 볼륨 마운트(`./data:/app/data`)로 컨테이너가 재시작돼도 데이터가 유지됩니다.

---

## DB 직접 확인하기 (디버깅)

```bash
# sqlite3 CLI 설치 후
sqlite3 data/timetable.db

# 저장된 주 목록 확인
SELECT week_start, fetched_at FROM timetables;

# 구독자 수 확인
SELECT COUNT(*) FROM subscriptions;

# 현재 설정 확인
SELECT * FROM settings;

# 종료
.quit
```
