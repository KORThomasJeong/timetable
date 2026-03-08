# 02. 시간표 수집 (스크래핑)

## 컴시간이란?

**컴시간(comcigan)** 은 전국 초·중·고등학교에서 사용하는 시간표 관리 서비스입니다.
학교마다 고유한 코드가 있으며, 이 코드를 통해 해당 학교의 시간표 데이터를 가져올 수 있습니다.

> 💡 이 프로젝트는 `comcigan-parser` npm 패키지를 사용해 컴시간 데이터를 파싱합니다.

---

## 전체 수집 흐름

```
1. Timetable 객체 생성 및 초기화
      ↓
2. 학교 검색 (학교명 입력 → 목록 반환)
      ↓
3. 학교 선택 (school.code 사용)
      ↓
4. 주차 목록 확인 (일자자료)
      ↓
5. 각 주차별 데이터 수집
      ↓
6. 1학년 3반 데이터 추출
      ↓
7. DB 저장
```

---

## 코드 단계별 설명

### Step 1. 초기화

```javascript
const Timetable = require('comcigan-parser');
const timetable = new Timetable();
await timetable.init({ maxGrade: 3, cache: 0 });
```

- `maxGrade: 3` → 최대 3학년까지 데이터를 가져옵니다
- `cache: 0` → 캐시를 사용하지 않아 항상 최신 데이터를 가져옵니다

---

### Step 2. 학교 검색

```javascript
const schools = await timetable.search('홍천중');
// 결과 예시:
// [
//   { region: '경기', name: '홍천중학교', code: 20634 },
//   { region: '강원', name: '홍천중학교', code: 12345 }
// ]
```

같은 이름의 학교가 여러 지역에 있을 수 있으므로 `region` 필드로 구분합니다.

```javascript
// 저장된 school_code가 없으면 검색하여 선택
const school = schools.find(s => s.region === '경기');
await timetable.setSchool(school.code);
```

> ⚠️ **주의**: 관리자 페이지에서 학교를 선택하면 `school_code`가 DB에 저장되고,
> 이후에는 검색 없이 바로 `setSchool(code)`를 호출합니다. 훨씬 빠릅니다.

---

### Step 3. 주차 목록 확인

컴시간은 보통 **현재 주**와 **다음 주** 2개의 주차 데이터를 제공합니다.

```javascript
// 내부 API에서 원시 JSON 데이터를 가져옵니다
const raw = JSON.parse(await timetable._getData());

// 주차 목록 (예시)
raw['일자자료'] = [
  [1, '26-03-09~14'],   // 1번 주차: 3월 9일 ~ 14일
  [2, '26-03-16~21']    // 2번 주차: 3월 16일 ~ 21일
]

// 이번 주 시작일
raw['시작일'] = '2026-03-09'

// 교시별 시작 시간
raw['일과시간'] = ['1(09:00)', '2(09:55)', '3(10:50)', ...]
```

---

### Step 4. 주차별 데이터 수집 (핵심 트릭)

컴시간은 내부적으로 `_scData[2]` 라는 값으로 어떤 주차 데이터를 반환할지 결정합니다.

```javascript
async function fetchWeekByIndex(timetable, weekIdx, grade, classNum) {
  // 원래 값 저장
  const origScData2 = timetable._scData[2];

  // 원하는 주차로 변경 (예: '1' → 이번 주, '2' → 다음 주)
  timetable._scData[2] = String(weekIdx);
  timetable._cache = null; // 캐시 초기화 필수!

  try {
    const raw = JSON.parse(await timetable._getData());
    const timetableData = await timetable.getTimetable();
    return {
      weekStart: raw['시작일'],       // '2026-03-09'
      classTime: raw['일과시간'],     // ['1(09:00)', ...]
      schedule: parseSchedule(timetableData, grade, classNum)
    };
  } finally {
    // 반드시 원래 값 복원
    timetable._scData[2] = origScData2;
    timetable._cache = null;
  }
}
```

> 💡 `_scData`, `_getData()`, `_cache` 등은 comcigan-parser의 **내부(private) 속성**입니다.
> 공식 API가 아니므로 라이브러리 업데이트 시 동작이 바뀔 수 있습니다.

---

### Step 5. 시간표 데이터 구조 파싱

`getTimetable()`이 반환하는 데이터 구조:

```javascript
timetableData = {
  '1': {              // 1학년
    '1': [...],       // 1반
    '2': [...],       // 2반
    '3': [            // 3반
      // 요일별 배열 (0=월, 1=화, 2=수, 3=목, 4=금)
      [               // 월요일
        { subject: '국어', teacher: '김선생' },  // 1교시
        { subject: '수학', teacher: '이선생' },  // 2교시
        ...
      ],
      [...],  // 화요일
      ...
    ]
  }
}
```

이를 우리 앱에서 사용하기 쉬운 형태로 변환:

```javascript
function parseSchedule(timetableData, grade = 1, classNum = 3) {
  const dayNames = ['월', '화', '수', '목', '금'];
  const classData = timetableData[String(grade)][String(classNum)];

  const schedule = {};
  dayNames.forEach((dayName, dayIdx) => {
    schedule[dayName] = classData[dayIdx].map(p => ({
      subject: p.subject || '',
      teacher: p.teacher || ''
    }));
  });
  return schedule;
}

// 결과:
// {
//   '월': [{ subject: '국어', teacher: '김선생' }, ...],
//   '화': [...],
//   ...
// }
```

---

## 최종 저장 데이터 형태

DB에 저장되는 JSON:

```json
{
  "classTime": ["1(09:00)", "2(09:55)", "3(10:50)", "4(11:45)", "5(13:30)", "6(14:25)", "7(15:20)"],
  "schedule": {
    "월": [
      { "subject": "국어", "teacher": "김선생" },
      { "subject": "수학", "teacher": "이선생" },
      { "subject": "영어", "teacher": "박선생" }
    ],
    "화": [ ... ],
    "수": [ ... ],
    "목": [ ... ],
    "금": [ ... ]
  }
}
```

---

## 주차 계산 방식

월요일 날짜를 기준으로 한 주를 식별합니다.

```javascript
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일, 1=월, ..., 6=토

  let offset;
  if (day === 0) offset = 1;       // 일요일 → 다음 날(월)
  else if (day === 6) offset = 2;  // 토요일 → 2일 후(월)
  else offset = -(day - 1);        // 평일 → 이번 주 월요일

  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0]; // 'YYYY-MM-DD'
}
```

- 월~금: 이번 주 월요일 날짜 반환
- **토/일: 다음 주 월요일 날짜 반환** (주말에 앱 접속 시 다음 주 시간표 표시)
