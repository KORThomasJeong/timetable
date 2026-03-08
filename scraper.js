const Timetable = require('comcigan-parser');

// Parse schedule from raw timetable data for given grade/class
function parseSchedule(timetableData, grade = 1, classNum = 3) {
  const dayNames = ['월', '화', '수', '목', '금'];
  const classData = timetableData[String(grade)] && timetableData[String(grade)][String(classNum)];
  if (!classData) throw new Error(`${grade}학년 ${classNum}반 데이터를 찾을 수 없음`);

  const schedule = {};
  dayNames.forEach((dayName, dayIdx) => {
    const dayPeriods = classData[dayIdx] || [];
    schedule[dayName] = dayPeriods.map(p => ({
      subject: p.subject || '',
      teacher: p.teacher || ''
    }));
  });
  return schedule;
}

// Fetch timetable for a specific week index (weekIdx: '1', '2', ...)
async function fetchWeekByIndex(timetable, weekIdx, grade = 1, classNum = 3) {
  const origScData2 = timetable._scData[2];
  timetable._scData[2] = String(weekIdx);
  timetable._cache = null;

  try {
    const raw = JSON.parse(await timetable._getData());
    const timetableData = await timetable.getTimetable();

    return {
      weekStart: raw['시작일'],
      classTime: raw['일과시간'] || [],
      weekList: raw['일자자료'] || [],
      schedule: parseSchedule(timetableData, grade, classNum)
    };
  } finally {
    timetable._scData[2] = origScData2;
    timetable._cache = null;
  }
}

// Search schools by name
async function searchSchools(schoolName) {
  const timetable = new Timetable();
  await timetable.init({ maxGrade: 3, cache: 0 });
  const schools = await timetable.search(schoolName);
  return schools;
}

// Fetch all available weeks
// config: { schoolCode, schoolName, grade, classNum }
async function fetchAllTimetables(config = {}) {
  const grade = parseInt(config.grade) || 1;
  const classNum = parseInt(config.classNum) || 3;

  const timetable = new Timetable();
  await timetable.init({ maxGrade: 3, cache: 0 });

  let schoolCode = config.schoolCode;

  if (!schoolCode) {
    const schoolName = config.schoolName || '홍천중';
    const schools = await timetable.search(schoolName);
    console.log('검색된 학교:', JSON.stringify(schools));

    const school = schools.find(s => s.region === '경기');
    if (!school) throw new Error(`경기 ${schoolName}을(를) 찾을 수 없음. 결과: ${JSON.stringify(schools)}`);

    console.log('선택된 학교:', school);
    schoolCode = school.code;
  }

  await timetable.setSchool(schoolCode);

  const defaultWeek = await fetchWeekByIndex(timetable, timetable._scData[2], grade, classNum);
  const weekList = defaultWeek.weekList;

  console.log('사용 가능한 주:', JSON.stringify(weekList));

  if (!weekList || weekList.length === 0) {
    return [{
      weekStart: defaultWeek.weekStart,
      classTime: defaultWeek.classTime,
      schedule: defaultWeek.schedule
    }];
  }

  const results = [];
  for (const [weekIdx] of weekList) {
    try {
      const week = await fetchWeekByIndex(timetable, weekIdx, grade, classNum);
      results.push({
        weekStart: week.weekStart,
        classTime: week.classTime,
        schedule: week.schedule
      });
      console.log(`주차 ${weekIdx} 로드: ${week.weekStart}`);
    } catch (err) {
      console.warn(`주차 ${weekIdx} 로드 실패:`, err.message);
    }
  }

  return results;
}

// Single-week fetch — used by old callers
async function fetchTimetable(config = {}) {
  const weeks = await fetchAllTimetables(config);
  return weeks[0];
}

// Standalone test
if (require.main === module) {
  fetchAllTimetables()
    .then(weeks => {
      weeks.forEach(w => {
        console.log(`\n=== ${w.weekStart} 주 시간표 ===`);
        console.log('교시별 시간:', JSON.stringify(w.classTime));
        Object.entries(w.schedule).forEach(([day, periods]) => {
          console.log(`\n[${day}요일]`);
          periods.forEach((p, i) => {
            if (p.subject) console.log(`  ${i + 1}교시: ${p.subject} (${p.teacher})`);
          });
        });
      });
    })
    .catch(err => console.error('오류:', err.message));
}

module.exports = { fetchTimetable, fetchAllTimetables, searchSchools };
