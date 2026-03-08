# 01. 전체 아키텍처

## 한 줄 요약

> 컴시간 서버 → 수집(scraper) → DB 저장 → API 제공 → 브라우저에 표시

---

## 컴포넌트 구조

```
┌─────────────────────────────────────────────────────────┐
│                      사용자 브라우저                       │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  index.html  │   │  admin.html  │   │  sw.js      │  │
│  │  (시간표 UI) │   │  (관리자 UI) │   │  (Service   │  │
│  │  app.js      │   │  admin.js    │   │   Worker)   │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬──────┘  │
└─────────┼─────────────────┼──────────────────┼──────────┘
          │  HTTP 요청       │  HTTP 요청        │ 푸시 수신
          ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│                   Express 서버 (server.js)               │
│                                                         │
│  GET /api/timetable      → 시간표 조회                   │
│  GET /api/timetable/history → 저장된 주 목록              │
│  POST /api/subscribe     → 푸시 구독 등록                 │
│  GET /admin              → 관리자 페이지                  │
│  POST /admin/api/settings → 설정 저장                    │
│  GET /admin/api/search   → 학교 검색                     │
└───────┬──────────┬──────────┬───────────────────────────┘
        │          │          │
        ▼          ▼          ▼
┌──────────┐ ┌─────────┐ ┌──────────────┐
│  db.js   │ │ push.js │ │ scheduler.js │
│ (SQLite) │ │ (VAPID) │ │  (node-cron) │
└──────────┘ └─────────┘ └──────┬───────┘
                                 │ 매일 19:00
                                 ▼
                         ┌──────────────┐
                         │ scraper.js   │
                         │ (comcigan-   │
                         │  parser)     │
                         └──────┬───────┘
                                │ HTTP 요청
                                ▼
                         ┌──────────────┐
                         │  컴시간 서버  │
                         │ (외부 서비스) │
                         └──────────────┘
```

---

## 데이터 흐름

### 1. 시간표 수집 흐름

```
scheduler.js (매일 19:00)
  │
  ├─ DB에서 설정 읽기 (학교코드, 학년, 반)
  │
  └─ scraper.js 호출
       │
       ├─ comcigan-parser로 학교 검색
       ├─ 주차 목록 확인 (일자자료)
       ├─ 각 주차별 시간표 수집
       │
       └─ DB에 저장 (week_start 기준 upsert)
            │
            └─ 변경 감지 시 → push.js → 구독자에게 알림 발송
```

### 2. 사용자 조회 흐름

```
브라우저 (app.js)
  │
  ├─ GET /api/timetable/history → 저장된 주 목록 → 드롭다운 렌더링
  │
  └─ GET /api/timetable?week=YYYY-MM-DD
       │
       └─ DB에서 해당 주 데이터 조회 → JSON 응답 → 시간표 그리드 렌더링
```

---

## 파일별 역할 요약

| 파일 | 역할 |
|------|------|
| `server.js` | HTTP 서버, API 라우터. 모든 요청의 진입점 |
| `db.js` | SQLite 연결, 테이블 생성, SQL 쿼리 모음 |
| `scraper.js` | 컴시간에서 시간표 데이터를 가져오는 로직 |
| `scheduler.js` | 매일 19:00에 자동으로 scraper를 실행하는 타이머 |
| `push.js` | 웹 푸시 알림 전송 (VAPID 키 관리 포함) |
| `public/app.js` | 브라우저에서 실행되는 UI 로직 |
| `public/sw.js` | Service Worker — 푸시 수신, 오프라인 캐시 |
| `public/admin.js` | 관리자 페이지 UI 로직 |

---

## 포트 및 엔드포인트 전체 목록

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 메인 시간표 페이지 |
| GET | `/api/timetable?week=current` | 이번 주 시간표 |
| GET | `/api/timetable?week=YYYY-MM-DD` | 특정 주 시간표 |
| GET | `/api/timetable/history` | 저장된 모든 주 목록 |
| GET | `/api/config` | 현재 학교/학년/반 설정 (공개) |
| GET | `/api/vapid-key` | 공개 VAPID 키 |
| POST | `/api/subscribe` | 푸시 구독 등록 |
| DELETE | `/api/subscribe` | 푸시 구독 해제 |
| POST | `/api/refresh` | 수동 시간표 수집 (개발용) |
| GET | `/admin` | 관리자 페이지 (인증 필요) |
| GET | `/admin/api/settings` | 현재 설정 조회 |
| POST | `/admin/api/settings` | 설정 저장 |
| GET | `/admin/api/search?q=학교명` | 학교 검색 |
| POST | `/admin/api/refresh` | 관리자용 수동 수집 |
