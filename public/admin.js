let selectedSchool = null;

async function loadSettings() {
  try {
    const res = await fetch('/admin/api/settings');
    if (!res.ok) return;
    const s = await res.json();

    document.getElementById('cur-school').textContent = s.school_name || '홍천중학교 (기본값)';
    document.getElementById('cur-class').textContent =
      `${s.grade || '1'}학년 ${s.class_num || '3'}반`;
    document.getElementById('cur-code').textContent = s.school_code || '-';

    if (s.grade) document.getElementById('grade-input').value = s.grade;
    if (s.class_num) document.getElementById('class-input').value = s.class_num;
    if (s.school_name) document.getElementById('search-input').value = s.school_name;
    if (s.school_code) {
      selectedSchool = { code: s.school_code, name: s.school_name || '' };
    }
  } catch (err) {
    console.error('설정 로드 실패:', err);
  }
}

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'status-msg status-' + type;
  el.style.display = 'block';
}

document.getElementById('search-btn').addEventListener('click', async () => {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.textContent = '검색 중...';
  showStatus('search-status', '학교 검색 중...', 'loading');

  const resultsEl = document.getElementById('school-results');
  resultsEl.innerHTML = '';
  resultsEl.classList.remove('visible');
  selectedSchool = null;

  try {
    const res = await fetch(`/admin/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || '검색 실패');
    if (!data.length) {
      showStatus('search-status', '검색 결과가 없습니다.', 'err');
      return;
    }

    document.getElementById('search-status').style.display = 'none';
    data.forEach(school => {
      const item = document.createElement('div');
      item.className = 'school-item';
      item.innerHTML = `
        <span class="school-region">${school.region || '-'}</span>
        <span>${school.name || school.schoolName || q}</span>
      `;
      item.addEventListener('click', () => {
        document.querySelectorAll('.school-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedSchool = school;
      });
      resultsEl.appendChild(item);
    });
    resultsEl.classList.add('visible');
  } catch (err) {
    showStatus('search-status', '오류: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '검색';
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const grade = document.getElementById('grade-input').value;
  const classNum = document.getElementById('class-input').value;

  const body = { grade, class_num: classNum };
  if (selectedSchool) {
    body.school_code = selectedSchool.code;
    body.school_name = selectedSchool.name || selectedSchool.schoolName ||
      document.getElementById('search-input').value.trim();
  }

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    const res = await fetch('/admin/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.ok) {
      showStatus('save-status', '설정이 저장되었습니다.', 'ok');
      await loadSettings();
    } else {
      showStatus('save-status', '저장 실패: ' + (data.error || ''), 'err');
    }
  } catch (err) {
    showStatus('save-status', '오류: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '설정 저장';
  }
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '수집 중...';
  showStatus('save-status', '시간표 새로고침 중... (잠시 기다려주세요)', 'loading');

  try {
    const res = await fetch('/admin/api/refresh', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      const weeks = (data.weeks || []).join(', ');
      showStatus('save-status',
        `새로고침 완료! 변경됨: ${data.changed ? '예' : '아니오'} | 주차: ${weeks}`, 'ok');
    } else {
      showStatus('save-status', '실패: ' + (data.error || ''), 'err');
    }
  } catch (err) {
    showStatus('save-status', '오류: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '시간표 새로고침';
  }
});

document.getElementById('search-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('search-btn').click();
});

loadSettings();
