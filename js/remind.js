(function(global) {
  'use strict';

  let tickTimer = null;
  const TICK_INTERVAL = 30000;
  const dismissed = {};

  function timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function nowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  function getActiveReminders() {
    const today = global.todayStr();
    const todos = global.getTodosForDate ? global.getTodosForDate(today) : [];
    const nowMin = nowMinutes();
    const reminders = [];

    todos.forEach(todo => {
      if (!todo.time) return;
      if (global.isDone(todo, today)) return;

      const startMin = timeToMinutes(todo.time);
      if (startMin === null) return;

      const beforeMin = (todo.remind && todo.remind.on) ? (todo.remind.before || 0) : 0;
      const triggerMin = startMin - beforeMin;
      const key = todo.id + '@' + today;

      if (nowMin < triggerMin) {
        return;
      } else if (nowMin >= triggerMin && nowMin <= startMin) {
        reminders.push({
          todo,
          status: 'active',
          key,
          minutesUntil: startMin - nowMin
        });
      } else {
        reminders.push({
          todo,
          status: 'overdue',
          key,
          minutesUntil: 0
        });
      }
    });

    return reminders;
  }

  function renderRemindBar() {
    const bar = document.getElementById('remind-bar');
    if (!bar) return;

    const reminders = getActiveReminders().filter(r => r.status === 'active' && !dismissed[r.key]);

    if (reminders.length === 0) {
      bar.classList.remove('visible');
      bar.innerHTML = '';
      return;
    }

    const r = reminders[0];
    const minLeft = r.minutesUntil;
    const timeText = minLeft > 0 ? `${minLeft} 分钟后开始` : '现在开始';

    bar.innerHTML = `<span class="remind-icon">⏰</span>`
      + `<span class="remind-item" data-id="${r.todo.id}">${r.todo.title} ${timeText}</span>`
      + `<button class="remind-jump" data-id="${r.todo.id}">跳转</button>`
      + `<button class="remind-dismiss" data-key="${r.key}">×</button>`;

    bar.classList.add('visible');

    const jumpBtn = bar.querySelector('.remind-jump');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        if (global.navigate) global.navigate('#/todos');
        if (global.setFilterDate) global.setFilterDate(global.todayStr());
      });
    }

    const dismissBtn = bar.querySelector('.remind-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        dismissed[dismissBtn.dataset.key] = true;
        renderRemindBar();
      });
    }

    const item = bar.querySelector('.remind-item');
    if (item) {
      item.addEventListener('click', () => {
        if (global.navigate) global.navigate('#/todos');
        if (global.setFilterDate) global.setFilterDate(global.todayStr());
      });
    }
  }

  function fireNotifications() {
    const reminders = getActiveReminders().filter(r => r.status === 'active');
    reminders.forEach(r => {
      const notifyKey = 'notified_' + r.key;
      if (dismissed[notifyKey]) return;

      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification('日程提醒', {
            body: `${r.todo.title} ${r.minutesUntil > 0 ? r.minutesUntil + ' 分钟后开始' : '现在开始'}`,
            tag: r.key
          });
        } catch (e) {}
      }

      dismissed[notifyKey] = true;
    });
  }

  function requestNotificationPermission() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function tick() {
    renderRemindBar();
    fireNotifications();
    if (global.renderTopbar) global.renderTopbar();
    if (global.renderHome) {
      const hash = typeof location !== 'undefined' ? location.hash : '';
      if (hash === '#/home' || !hash) global.renderHome();
    }
  }

  function startTicker() {
    if (tickTimer) return;
    tick();
    tickTimer = setInterval(tick, TICK_INTERVAL);
  }

  function stopTicker() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function isOverdue(todo, dateStr) {
    if (!todo.time) return false;
    if (global.isDone(todo, dateStr)) return false;
    const today = global.todayStr();
    if (dateStr > today) return false;
    if (dateStr < today) return true;
    const nowMin = nowMinutes();
    const startMin = timeToMinutes(todo.time);
    return nowMin > startMin;
  }

  global.timeToMinutes = timeToMinutes;
  global.nowMinutes = nowMinutes;
  global.getActiveReminders = getActiveReminders;
  global.renderRemindBar = renderRemindBar;
  global.fireNotifications = fireNotifications;
  global.requestNotificationPermission = requestNotificationPermission;
  global.tick = tick;
  global.startTicker = startTicker;
  global.stopTicker = stopTicker;
  global.isOverdue = isOverdue;
  global._dismissed = dismissed;
})(typeof window !== 'undefined' ? window : globalThis);
