# 🏫 학교 시간표 웹앱

컴시간(comcigan) 서비스에서 학교 시간표를 자동으로 수집하여 모바일에 최적화된 웹페이지로 제공하는 서비스입니다.

> 기본값: 경기도 홍천중학교 1학년 3반 — 관리자 페이지에서 학교/학년/반을 변경할 수 있습니다.

---

## ✨ 주요 기능

- 📅 **주간 시간표 조회** — 이번 주 및 지난 주 시간표를 주차별로 확인
- 🌙 **라이트/다크 모드** — 시스템 설정 자동 감지, 수동 전환 가능
- 🔔 **웹 푸시 알림** — 시간표 변경 시 자동 알림 (브라우저 알림)
- ⚙️ **관리자 페이지** — 학교 검색·선택, 학년/반 설정
- 🔄 **자동 업데이트** — 매일 오후 7시(KST) 자동 수집·변경 감지
- 📱 **PWA 지원** — 홈 화면 추가, 오프라인 캐시
- 🐳 **Docker 지원** — 한 줄로 서비스 시작

---

## 🖥️ 화면 미리보기

| 라이트 모드 | 다크 모드 |
|---|---|
| 시간표 그리드 (오늘 요일 하이라이트, 현재 교시 강조) | 동일 레이아웃 다크 테마 |

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|---|---|
| 백엔드 | Node.js + Express |
| 데이터베이스 | SQLite (better-sqlite3) |
| 시간표 수집 | comcigan-parser |
| 스케줄러 | node-cron |
| 푸시 알림 | web-push (VAPID) |
| 프론트엔드 | Vanilla JS + CSS (모바일 퍼스트) |
| 배포 | Docker + docker-compose |

---

## 🚀 빠른 시작

### Docker로 실행 (권장)

```bash
# 1. 저장소 클론
git clone https://github.com/KORThomasJeong/timetable.git
cd timetable

# 2. 환경변수 파일 생성
cp .env.example .env
# .env 파일을 열어 필요한 값 설정 (VAPID 키는 첫 실행 시 자동 생성)

# 3. 실행
docker compose up -d

# 4. 브라우저에서 확인
open http://localhost:3000
```

### 로컬에서 직접 실행

```bash
# Node.js 18 이상 필요
npm install
node server.js
```

---

## ⚙️ 환경변수 (.env)

```env
PORT=3000                        # 서버 포트 (기본값: 3000)
ADMIN_PASSWORD=your_password     # 관리자 페이지 비밀번호 (미설정 시 인증 없음)
VAPID_PUBLIC_KEY=...             # 자동 생성됨 (첫 실행 시)
VAPID_PRIVATE_KEY=...            # 자동 생성됨 (첫 실행 시)
```

`.env.example` 파일을 복사해서 사용하세요:

```bash
cp .env.example .env
```

---

## 🔐 관리자 페이지

`http://localhost:3000/admin` 접속

- **학교 검색**: 학교명 입력 → 검색 → 목록에서 선택
- **학년/반 설정**: 원하는 학년과 반 번호 입력
- **시간표 새로고침**: 즉시 수집 실행

`ADMIN_PASSWORD` 환경변수를 설정하면 Basic Auth로 보호됩니다.

---

## 📁 프로젝트 구조

```
timetable/
├── server.js          # Express 서버 + API 라우터
├── db.js              # SQLite 데이터베이스 설정 및 쿼리
├── scraper.js         # 컴시간 시간표 수집
├── scheduler.js       # 자동 업데이트 스케줄러
├── push.js            # 웹 푸시 알림 (VAPID)
├── public/
│   ├── index.html     # 메인 페이지
│   ├── app.js         # 프론트엔드 JavaScript
│   ├── style.css      # 스타일시트
│   ├── sw.js          # Service Worker
│   ├── admin.html     # 관리자 페이지
│   └── admin.js       # 관리자 페이지 JavaScript
├── Dockerfile
├── docker-compose.yml
└── docs/              # 상세 기술 문서
```

---

## 📚 상세 문서

동작 원리를 자세히 알고 싶다면 [`docs/`](./docs/) 폴더를 확인하세요.

| 문서 | 내용 |
|---|---|
| [01. 전체 아키텍처](./docs/01-architecture.md) | 컴포넌트 구조와 데이터 흐름 |
| [02. 시간표 수집(스크래핑)](./docs/02-scraper.md) | 컴시간 파싱 방법 |
| [03. 데이터베이스](./docs/03-database.md) | SQLite 저장 구조 |
| [04. 자동 업데이트](./docs/04-scheduler.md) | 스케줄러 동작 방식 |
| [05. 푸시 알림](./docs/05-push-notifications.md) | 웹 푸시 알림 구조 |
| [06. 프론트엔드](./docs/06-frontend.md) | UI 구조와 동작 |
| [07. Docker 배포](./docs/07-docker.md) | Docker 설정 설명 |
| [08. 관리자 페이지](./docs/08-admin.md) | 관리자 기능 설명 |

---

## 📄 라이선스

MIT
