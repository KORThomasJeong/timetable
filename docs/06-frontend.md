# 06. 프론트엔드

## 구조 개요

별도 프레임워크 없이 **Vanilla JS + CSS**로 구현되었습니다.
모바일 화면을 기준으로 설계(Mobile-First)되었으며 PWA를 지원합니다.

```
public/
├── index.html    — 페이지 구조 (HTML 뼈대)
├── style.css     — 모든 스타일 (라이트/다크 모드 포함)
├── app.js        — UI 로직 (데이터 로드, 시간표 렌더링)
├── sw.js         — Service Worker (푸시, 오프라인 캐시)
├── admin.html    — 관리자 페이지 HTML
├── admin.js      — 관리자 페이지 로직
└── manifest.json — PWA 설정
```

---

## 디자인 시스템

### CSS 변수 (테마)

`style.css` 최상단에 **CSS 변수**로 색상을 정의합니다.
라이트/다크 모드를 `data-theme` 속성 하나로 전환합니다.

```css
/* 라이트 모드 기본값 */
:root {
  --background: #ffffff;
  --foreground: #09090b;
  --card: #ffffff;
  --border: #e4e4e7;
  --primary: #18181b;
  --muted-foreground: #71717a;
  /* ... */
}

/* 다크 모드 */
[data-theme="dark"] {
  --background: #09090b;
  --foreground: #fafafa;
  --card: #18181b;
  --border: #27272a;
  --primary: #fafafa;
  /* ... */
}
```

```javascript
// 테마 전환: HTML 태그에 data-theme 속성만 바꾸면 됨
document.documentElement.setAttribute('data-theme', 'dark');
```

### 과목별 색상

각 과목을 키워드로 인식하여 자동으로 색상을 지정합니다.

```javascript
const SUBJECT_COLOR_MAP = [
  { keys: ['국어', '문학', '독서'], name: 'korean' },
  { keys: ['수학', '미적', '확률'], name: 'math' },
  { keys: ['영어'], name: 'english' },
  // ...
];
```

CSS에서 과목 색상은 `color-mix()`를 사용해 배경을 자동으로 밝게 만듭니다:

```css
/* badge 배경: 해당 색상 15% + 배경색 85% 혼합 */
background: color-mix(in srgb, var(--subj-korean) 15%, var(--background));
```

---

## App 클래스 (app.js)

모든 UI 로직은 `App` 클래스 하나에 담겨 있습니다.

```javascript
class App {
  constructor() {
    this.history = [];          // 저장된 주 목록
    this.currentWeekStart = ''; // 현재 보고 있는 주
    this.currentData = null;    // 현재 시간표 데이터
    this.isSubscribed = false;  // 푸시 알림 구독 여부
    this.init();
  }
}
```

### 초기화 순서

```javascript
async init() {
  this.bindEvents();                          // 버튼 이벤트 연결
  await this.loadHistory();                   // 주 목록 로드 → 드롭다운 생성
  await this.loadTimetable(this.currentWeekStart); // 이번 주 시간표 로드
  this.initServiceWorker();                   // 푸시 알림 초기화
}
```

---

## 시간표 렌더링

시간표는 **CSS Grid**로 구현됩니다.

```
┌──────┬────┬────┬────┬────┬────┐
│      │ 월 │ 화 │ 수 │ 목 │ 금 │  ← 헤더 행
├──────┼────┼────┼────┼────┼────┤
│ 1교시│    │    │    │    │    │
│09:00 │    │    │    │    │    │
├──────┼────┼────┼────┼────┼────┤
│ 2교시│    │    │    │    │    │
│09:55 │    │    │    │    │    │
└──────┴────┴────┴────┴────┴────┘
   ↑ 교시 레이블     ↑ 과목 뱃지
```

```css
.tt-grid {
  display: grid;
  grid-template-columns: 36px repeat(5, 1fr); /* 교시번호 36px + 5일 균등 */
}
```

JavaScript로 DOM을 직접 생성합니다:

```javascript
// 헤더: 빈 모서리 + 요일 5개
// 교시 행: 교시 레이블 + 과목 셀 5개

days.forEach((day, dayIdx) => {
  const cell = document.createElement('div');
  const isToday = isThisWeek && dayIdx === todayIdx;
  const isCurrent = isToday && p === currentPeriod; // 현재 진행 중인 교시

  cell.className = 'tt-cell' +
    (isToday ? ' today-col' : '') +     // 오늘 열 배경
    (isCurrent ? ' current' : '');      // 현재 교시 강조
});
```

---

## 현재 교시 실시간 표시

```javascript
function getCurrentPeriodIdx(classTime) {
  const now = new Date();
  const hhmm = now.getHours() * 60 + now.getMinutes(); // 현재 시각을 분으로

  for (let i = 0; i < classTime.length; i++) {
    const timeStr = parseClassTimeStr(classTime[i]); // '1(09:00)' → '09:00'
    const [h, m] = timeStr.split(':').map(Number);
    const start = h * 60 + m;

    if (hhmm >= start && hhmm < start + 45) return i; // 45분 수업 가정
  }
  return -1; // 수업 시간 아님
}
```

이번 주를 보고 있을 때 1분마다 자동으로 다시 렌더링합니다:

```javascript
this._periodTimer = setInterval(() => this.renderTimetable(this.currentData), 60000);
```

---

## Pull-to-Refresh (당겨서 새로고침)

모바일에서 화면 최상단에서 아래로 당기면 새로고침합니다.

```javascript
document.addEventListener('touchstart', e => {
  if (window.scrollY === 0) startY = e.touches[0].clientY;
});
document.addEventListener('touchend', async () => {
  if (e.touches[0].clientY - startY > 70) { // 70px 이상 당기면
    await this.refresh();
  }
});
```

---

## PWA (Progressive Web App)

`manifest.json`에 앱 정보를 정의해 브라우저에서 "홈 화면에 추가"를 제안합니다.

```json
{
  "name": "시간표",
  "short_name": "시간표",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#18181b",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192" }]
}
```

Service Worker가 정적 파일(HTML, CSS, JS)을 캐시해 오프라인에서도 마지막으로 본 시간표를 확인할 수 있습니다.
