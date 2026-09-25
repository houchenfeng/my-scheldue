(function(global) {
  'use strict';

  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
  const COURSE_COLORS = [
    'var(--course-1)', 'var(--course-2)', 'var(--course-3)',
    'var(--course-4)', 'var(--course-5)', 'var(--course-6)'
  ];

  let viewWeek = 1;

  function courseColorIndex(code) {
    const courses = global.SEED.courses;
    for (let i = 0; i < courses.length; i++) {
      if (courses[i].code === code) return i % COURSE_COLORS.length;
    }
    return 0;
  }

  function setViewWeek(w) {
    const total = global.SEED.meta.totalWeeks;
    if (w < 1) w = 1;
    if (w > total) w = total;
    viewWeek = w;
  }

  function getViewWeek() {
    return viewWeek;
  }

  function visibleSlots(week) {
    const slots = [];
    global.SEED.courses.forEach(course => {
      course.slots.forEach(slot => {
        if (global.inWeeks(slot.weeks, week)) {
          slots.push({ course, slot });
        }
      });
    });
    return slots;
  }

  function noFixedCourses() {
    return global.SEED.courses.filter(c => c.slots.length === 0);
  }

  function blockStyle(slot) {
    const [startP, endP] = slot.p;
    const rowStart = startP + 1;
    const rowEnd = endP + 2;
    return `grid-row: ${rowStart} / ${rowEnd}; `;
  }

  function gridHTML(week) {
    const slots = visibleSlots(week);

    let headerRow = '<div class="tt-corner">节次</div>';
    WEEKDAYS.forEach((d, i) => {
      const dateStr = global.addDays(global.weekMondayDate(week), i);
      const short = dateStr.slice(5);
      headerRow += `<div class="tt-header">周${d}<br><span class="tt-date">${short}</span></div>`;
    });

    let periodRows = '';
    global.SEED.periods.forEach(p => {
      periodRows += `<div class="tt-period">${p.n}<br><span class="tt-time">${p.start}</span></div>`;
      for (let wd = 1; wd <= 7; wd++) {
        periodRows += `<div class="tt-cell" data-wd="${wd}" data-p="${p.n}"></div>`;
      }
    });

    let blocksHTML = '';
    const cellUsage = {};

    slots.forEach(({ course, slot }) => {
      const wd = slot.wd;
      const [startP, endP] = slot.p;
      const col = wd + 1;
      const rowStart = startP + 1;
      const rowEnd = endP + 2;
      const span = endP - startP + 1;
      const colorIdx = courseColorIndex(course.code);
      const color = COURSE_COLORS[colorIdx];

      let subCol = 0;
      const key = `${wd}-${startP}`;
      if (!cellUsage[key]) cellUsage[key] = 0;
      subCol = cellUsage[key];
      cellUsage[key]++;

      const totalSub = Math.max(cellUsage[key], 1);
      const widthPct = 100 / totalSub;
      const leftPct = subCol * widthPct;

      const style = `grid-row: ${rowStart} / ${rowEnd}; grid-column: ${col} / ${col + 1}; `
        + `left: ${leftPct}%; width: ${widthPct}%;`;

      blocksHTML += `<div class="tt-block" style="${style}" data-code="${course.code}" `
        + `data-slot-wd="${wd}" data-slot-p="${startP}-${endP}">`
        + `<div class="tt-block-inner" style="background:${color}">`
        + `<div class="tt-block-name">${course.name}</div>`
        + `<div class="tt-block-loc">${slot.loc}</div>`
        + `</div></div>`;
    });

    return `<div class="tt-grid-wrap"><div class="tt-grid">`
      + headerRow + periodRows + blocksHTML
      + `</div></div>`;
  }

  function noFixedHTML() {
    const list = noFixedCourses();
    if (list.length === 0) return '';
    let html = '<div class="card no-fixed-card"><div class="card-title">未固定时间课程</div>';
    list.forEach(c => {
      const colorIdx = courseColorIndex(c.code);
      html += `<div class="no-fixed-item" data-code="${c.code}">`
        + `<span class="no-fixed-dot" style="background:${COURSE_COLORS[colorIdx]}"></span>`
        + `<span class="no-fixed-name">${c.name}</span>`
        + `<span class="no-fixed-note">${c.note || c.mode}</span>`
        + `</div>`;
    });
    html += '</div>';
    return html;
  }

  function renderTimetable() {
    const page = document.getElementById('page-timetable');
    if (!page) return;

    const total = global.SEED.meta.totalWeeks;
    const canPrev = viewWeek > 1;
    const canNext = viewWeek < total;
    const rangeText = global.weekRangeText(viewWeek);

    let html = '<div class="card">';
    html += '<div class="week-switcher">';
    html += `<button class="btn btn-secondary week-btn" id="week-prev" ${canPrev ? '' : 'disabled'}>&lt; 上一周</button>`;
    html += `<div class="week-label">第 ${viewWeek} 周 <span class="week-range">${rangeText}</span></div>`;
    html += `<button class="btn btn-secondary week-btn" id="week-next" ${canNext ? '' : 'disabled'}>下一周 &gt;</button>`;
    html += '</div>';
    html += gridHTML(viewWeek);
    html += '</div>';
    html += noFixedHTML();

    page.innerHTML = html;

    const prevBtn = document.getElementById('week-prev');
    const nextBtn = document.getElementById('week-next');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (viewWeek > 1) { setViewWeek(viewWeek - 1); renderTimetable(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (viewWeek < total) { setViewWeek(viewWeek + 1); renderTimetable(); }
    });

    page.querySelectorAll('.tt-block').forEach(el => {
      el.addEventListener('click', () => {
        openCourseModal(el.dataset.code);
      });
    });

    page.querySelectorAll('.no-fixed-item').forEach(el => {
      el.addEventListener('click', () => {
        openCourseModal(el.dataset.code);
      });
    });
  }

  function openCourseModal(code) {
    const course = global.SEED.courses.find(c => c.code === code);
    if (!course) return;

    const root = document.getElementById('modal-root');
    if (!root) return;

    let slotsText = '';
    if (course.slots.length === 0) {
      slotsText = '<div class="modal-field">时间: 未固定</div>';
    } else {
      slotsText = '<div class="modal-field"><strong>时间安排:</strong></div>';
      course.slots.forEach(slot => {
        const timeText = global.slotTimeText(slot);
        const weekRange = `第${slot.weeks[0]}-${slot.weeks[1]}周`;
        slotsText += `<div class="modal-slot">周${WEEKDAYS[slot.wd - 1]} 第${slot.p[0]}-${slot.p[1]}节 ${timeText} ${weekRange} ${slot.loc}</div>`;
      });
    }

    const html = `<div class="modal">
      <div class="modal-title">${course.name}</div>
      <div class="modal-field"><strong>课程编号:</strong> ${course.code}</div>
      <div class="modal-field"><strong>教学班:</strong> ${course.class}</div>
      <div class="modal-field"><strong>校区:</strong> ${course.campus}</div>
      <div class="modal-field"><strong>开课单位:</strong> ${course.unit}</div>
      <div class="modal-field"><strong>授课方式:</strong> ${course.mode}</div>
      <div class="modal-field"><strong>教师:</strong> ${course.teacher}</div>
      <div class="modal-field"><strong>选课人数:</strong> ${course.count}</div>
      ${slotsText}
      ${course.note ? `<div class="modal-field"><strong>备注:</strong> ${course.note}</div>` : ''}
      <div class="modal-actions">
        <button class="btn btn-primary" id="modal-close">关闭</button>
      </div>
    </div>`;

    root.innerHTML = html;
    root.classList.add('visible');

    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        root.classList.remove('visible');
        root.innerHTML = '';
      });
    }

    root.addEventListener('click', (e) => {
      if (e.target === root) {
        root.classList.remove('visible');
        root.innerHTML = '';
      }
    });
  }

  global.setViewWeek = setViewWeek;
  global.getViewWeek = getViewWeek;
  global.visibleSlots = visibleSlots;
  global.noFixedCourses = noFixedCourses;
  global.blockStyle = blockStyle;
  global.gridHTML = gridHTML;
  global.renderTimetable = renderTimetable;
  global.openCourseModal = openCourseModal;
  global.courseColorIndex = courseColorIndex;
})(typeof window !== 'undefined' ? window : globalThis);
