(function(global) {
  'use strict';

  const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

  function todayClasses(dateStr) {
    const wd = global.weekdayIndex(dateStr);
    const week = global.currentWeek(dateStr);
    const S = global.getState();
    if (!S || week < 1 || week > S.meta.totalWeeks) return [];

    const classes = [];
    S.courses.forEach(course => {
      course.slots.forEach(slot => {
        if (slot.wd === wd && global.inWeeks(slot.weeks, week)) {
          const [startP, endP] = slot.p;
          const startPeriod = S.periods.find(p => p.n === startP);
          const endPeriod = S.periods.find(p => p.n === endP);
          classes.push({
            course,
            slot,
            startTime: startPeriod ? startPeriod.start : '',
            endTime: endPeriod ? endPeriod.end : '',
            startPeriod: startP,
            endPeriod: endP
          });
        }
      });
    });

    classes.sort((a, b) => a.startPeriod - b.startPeriod);
    return classes;
  }

  function todayTodos(dateStr) {
    if (global.getTodosForDate) {
      return global.getTodosForDate(dateStr);
    }
    return [];
  }

  function classStatus(cls, dateStr) {
    const now = new Date();
    const today = global.todayStr();
    if (dateStr !== today) return 'future';

    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = cls.startTime.split(':').map(Number);
    const [eh, em] = cls.endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (nowMin < startMin) return 'upcoming';
    if (nowMin >= startMin && nowMin < endMin) return 'ongoing';
    return 'finished';
  }

  function statusText(status) {
    if (status === 'upcoming') return '未开始';
    if (status === 'ongoing') return '上课中';
    if (status === 'finished') return '已下课';
    return '';
  }

  function weekOverview() {
    const today = global.todayStr();
    const week = global.currentWeek(today);
    const S = global.getState();
    if (!S || week < 1 || week > S.meta.totalWeeks) return [];

    const monday = global.weekMondayDate(week);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = global.addDays(monday, i);
      const wd = i + 1;
      const classes = [];
      S.courses.forEach(course => {
        course.slots.forEach(slot => {
          if (slot.wd === wd && global.inWeeks(slot.weeks, week)) {
            classes.push({ course, slot });
          }
        });
      });
      const isToday = dateStr === today;
      days.push({
        dateStr,
        wd,
        dayLabel: WEEKDAY_SHORT[wd === 7 ? 0 : wd],
        classes,
        isToday
      });
    }
    return days;
  }

  function renderHome() {
    const page = document.getElementById('page-home');
    if (!page) return;

    const today = global.todayStr();
    const dateLabel = global.fmtCN(today);
    const classes = todayClasses(today);
    const todos = todayTodos(today);
    const overview = weekOverview();

    let html = '';

    // Date card
    html += '<div class="card home-date-card">';
    html += `<div class="home-date-big">${today.slice(5)}</div>`;
    html += `<div class="home-date-label">${dateLabel}</div>`;
    html += '</div>';

    // Today's classes
    html += '<div class="card">';
    html += '<div class="card-title">今日课程</div>';
    if (classes.length === 0) {
      html += '<div class="home-empty">今天没有课</div>';
    } else {
      html += '<div class="home-class-list">';
      classes.forEach(cls => {
        const status = classStatus(cls, today);
        const statusCls = status !== 'future' ? ` class-status-${status}` : '';
        html += `<div class="home-class-item${statusCls}" data-code="${cls.course.code}">`;
        html += `<div class="home-class-time">${cls.startTime}-${cls.endTime}</div>`;
        html += `<div class="home-class-info">`;
        html += `<div class="home-class-name">${cls.course.name}</div>`;
        html += `<div class="home-class-loc">${cls.slot.loc} · ${cls.course.teacher}</div>`;
        html += `</div>`;
        const st = statusText(status);
        if (st) html += `<div class="home-class-status">${st}</div>`;
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Today's todos
    html += '<div class="card">';
    html += '<div class="card-title">今日待办</div>';
    if (todos.length === 0) {
      html += '<div class="home-empty">今天没有待办</div>';
    } else {
      html += '<div class="home-todo-list">';
      todos.forEach(todo => {
        const done = global.isDone(todo, today);
        const doneClass = done ? ' home-todo-done' : '';
        html += `<div class="home-todo-item${doneClass}">`;
        html += `<span class="home-todo-check">${done ? '✓' : '○'}</span>`;
        html += `<span class="home-todo-title">${todo.title}</span>`;
        if (todo.time) html += `<span class="home-todo-time">${todo.time}</span>`;
        html += '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Week overview
    html += '<div class="card">';
    html += '<div class="card-title">本周概览</div>';
    html += '<div class="week-overview">';
    overview.forEach(day => {
      const todayClass = day.isToday ? ' week-day-today' : '';
      const count = day.classes.length;
      html += `<div class="week-day${todayClass}">`;
      html += `<div class="week-day-label">周${day.dayLabel}</div>`;
      html += `<div class="week-day-date">${day.dateStr.slice(5)}</div>`;
      html += `<div class="week-day-count">${count > 0 ? count + '节课' : '无课'}</div>`;
      html += '</div>';
    });
    html += '</div></div>';

    page.innerHTML = html;

    page.querySelectorAll('.home-class-item').forEach(el => {
      el.addEventListener('click', () => {
        if (global.openCourseModal) global.openCourseModal(el.dataset.code);
      });
    });
  }

  global.todayClasses = todayClasses;
  global.todayTodos = todayTodos;
  global.classStatus = classStatus;
  global.statusText = statusText;
  global.weekOverview = weekOverview;
  global.renderHome = renderHome;
})(typeof window !== 'undefined' ? window : globalThis);
