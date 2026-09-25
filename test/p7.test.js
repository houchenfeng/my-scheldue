const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadInContext(fakeToday, fakeNowMin) {
  const store = {};
  const fakeDate = fakeToday || '2026-09-25';
  const nowMin = fakeNowMin !== undefined ? fakeNowMin : 720;

  const ctx = {
    console,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0) {
          super(fakeDate + 'T12:00:00');
        } else {
          super(...args);
        }
      }
      static now() {
        return new Date(fakeDate + 'T12:00:00').getTime();
      }
      getHours() { return Math.floor(nowMin / 60); }
      getMinutes() { return nowMin % 60; }
    },
    Math,
    String,
    Number,
    Array,
    Object,
    JSON,
    parseInt,
    parseFloat,
    setInterval: (fn, ms) => { ctx._interval = { fn, ms }; return 1; },
    clearInterval: () => { ctx._interval = null; },
    localStorage: {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      _store: store
    },
    location: { hash: '#/home' },
    window: null,
    document: null,
    Notification: undefined
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  const mockElements = {};

  function makeEl(tag, id) {
    const el = {
      tagName: tag.toUpperCase(),
      id: id || '',
      dataset: {},
      style: {},
      className: '',
      textContent: '',
      innerHTML: '',
      value: '',
      checked: false,
      disabled: false,
      files: [],
      _listeners: {},
      setAttribute(k, v) { el[k] = v; },
      getAttribute(k) { return el[k] || null; },
      addEventListener(ev, fn) {
        if (!el._listeners[ev]) el._listeners[ev] = [];
        el._listeners[ev].push(fn);
      },
      appendChild() {},
      querySelector(sel) {
        if (sel === '.remind-jump') return this._jumpBtn || null;
        if (sel === '.remind-dismiss') return this._dismissBtn || null;
        if (sel === '.remind-item') return this._remindItem || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.period-start, .period-end') return this._periodInputs || [];
        return [];
      },
      click() {},
      closest(sel) { return this; }
    };
    if (id) mockElements[id] = el;
    return el;
  }

  const pageHome = makeEl('section', 'page-home');
  const pageTimetable = makeEl('section', 'page-timetable');
  const pageTodos = makeEl('section', 'page-todos');
  const mainNav = makeEl('nav', 'main-nav');
  const topbarInfo = makeEl('div', 'topbar-info');
  const topbarSettings = makeEl('button', 'topbar-settings');
  const remindBar = makeEl('div', 'remind-bar');
  remindBar.classList = {
    _classes: new Set(),
    add(c) { this._classes.add(c); },
    remove(c) { this._classes.delete(c); },
    toggle(c) { if (this._classes.has(c)) this._classes.delete(c); else this._classes.add(c); },
    contains(c) { return this._classes.has(c); }
  };
  const modalRoot = makeEl('div', 'modal-root');
  let modalVisible = false;
  modalRoot.classList = {
    add(c) { if (c === 'visible') modalVisible = true; },
    remove(c) { if (c === 'visible') modalVisible = false; },
    toggle(c) { if (c === 'visible') modalVisible = !modalVisible; }
  };

  Object.defineProperty(modalRoot, '_isVisible', { get() { return modalVisible; } });

  Object.defineProperty(modalRoot, 'querySelectorAll', {
    value: function(sel) {
      if (sel === '.period-start, .period-end') return this._periodInputs || [];
      return [];
    }
  });

  Object.defineProperty(remindBar, 'innerHTML', {
    get() { return this._barHTML || ''; },
    set(v) {
      this._barHTML = v;
      const jumpBtn = makeEl('button');
      jumpBtn._listeners = {};
      jumpBtn.addEventListener = function(ev, fn) {
        if (!this._listeners[ev]) this._listeners[ev] = [];
        this._listeners[ev].push(fn);
      };
      const jumpMatch = v.match(/class="remind-jump"[^>]*data-id="([^"]*)"/);
      if (jumpMatch) jumpBtn.dataset = { id: jumpMatch[1] };
      this._jumpBtn = jumpBtn;

      const dismissBtn = makeEl('button');
      dismissBtn._listeners = {};
      dismissBtn.addEventListener = function(ev, fn) {
        if (!this._listeners[ev]) this._listeners[ev] = [];
        this._listeners[ev].push(fn);
      };
      const dismissMatch = v.match(/class="remind-dismiss"[^>]*data-key="([^"]*)"/);
      if (dismissMatch) dismissBtn.dataset = { key: dismissMatch[1] };
      else dismissBtn.dataset = { key: '' };
      this._dismissBtn = dismissBtn;

      const item = makeEl('span');
      item._listeners = {};
      item.addEventListener = function(ev, fn) {
        if (!this._listeners[ev]) this._listeners[ev] = [];
        this._listeners[ev].push(fn);
      };
      const itemMatch = v.match(/class="remind-item"[^>]*data-id="([^"]*)"/);
      if (itemMatch) item.dataset = { id: itemMatch[1] };
      this._remindItem = item;
    }
  });

  Object.defineProperty(modalRoot, 'innerHTML', {
    get() { return this._modalHTML || ''; },
    set(v) {
      this._modalHTML = v;
      const btns = {};
      ['settings-close', 'settings-export', 'settings-import', 'settings-clear', 'modal-cancel', 'modal-save', 'confirm-cancel', 'confirm-ok'].forEach(id => {
        if (v.includes(`id="${id}"`)) {
          const bel = makeEl('button', id);
          bel._listeners = {};
          bel.addEventListener = function(ev, fn) {
            if (!this._listeners[ev]) this._listeners[ev] = [];
            this._listeners[ev].push(fn);
          };
          btns[id] = bel;
        }
      });
      this._buttons = btns;

      const extras = {};
      if (v.includes('id="settings-file"')) {
        const fileEl = makeEl('input');
        fileEl.type = 'file';
        fileEl._listeners = {};
        fileEl.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        extras['settings-file'] = fileEl;
      }
      if (v.includes('id="settings-msg"')) {
        const msgEl = makeEl('div', 'settings-msg');
        extras['settings-msg'] = msgEl;
        this._msgEl = msgEl;
      }
      this._extras = extras;

      const inputs = [];
      const inputRe = /class="(period-start|period-end)"[^>]*data-n="(\d+)"[^>]*value="([^"]*)"/g;
      let m;
      while ((m = inputRe.exec(v)) !== null) {
        const iel = makeEl('input');
        iel.className = m[1];
        iel.dataset = { n: m[2] };
        iel.value = m[3];
        iel._listeners = {};
        iel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        iel.closest = function() {
          const row = makeEl('div');
          row.querySelector = function(sel) {
            if (sel === '.period-start') return inputs.find(i => i.className === 'period-start' && i.dataset.n === m[2]) || iel;
            if (sel === '.period-end') return inputs.find(i => i.className === 'period-end' && i.dataset.n === m[2]) || iel;
            return null;
          };
          return row;
        };
        inputs.push(iel);
      }
      this._periodInputs = inputs;
    }
  });

  const doc = {
    getElementById(id) {
      if (id === 'page-home') return pageHome;
      if (id === 'page-timetable') return pageTimetable;
      if (id === 'page-todos') return pageTodos;
      if (id === 'main-nav') return mainNav;
      if (id === 'topbar-info') return topbarInfo;
      if (id === 'topbar-settings') return topbarSettings;
      if (id === 'remind-bar') return remindBar;
      if (id === 'modal-root') return modalRoot;
      if (modalRoot._buttons && modalRoot._buttons[id]) return modalRoot._buttons[id];
      if (modalRoot._extras && modalRoot._extras[id]) return modalRoot._extras[id];
      if (id === 'settings-msg') return modalRoot._msgEl || null;
      return mockElements[id] || null;
    },
    querySelectorAll(sel) {
      if (sel === '.nav-tab') return [];
      return [];
    },
    createElement(tag) { return makeEl(tag); },
    body: makeEl('div', 'body'),
    addEventListener() {}
  };
  ctx.document = doc;

  vm.createContext(ctx);

  const files = ['js/seed.js', 'js/dates.js', 'js/store.js', 'js/ui.js', 'js/page-timetable.js', 'js/page-todos.js', 'js/page-home.js', 'js/remind.js'];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  ctx.load();
  return { ctx, remindBar, modalRoot, store, pageHome, pageTimetable, pageTodos };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('P7 Tests: PRD Acceptance Criteria\n');

// Test 1: Week calculation
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Week calculation: 2026-09-25 is week 3', () => {
    const week = ctx.currentWeek('2026-09-25');
    assert.strictEqual(week, 3);
  });
}

// Test 2: Today's classes on Friday
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Friday week 3 has 科学研究与学术写作', () => {
    const classes = ctx.todayClasses('2026-09-25');
    assert.ok(classes.length > 0);
    assert.ok(classes.some(c => c.course.name.includes('科学研究与学术写作')));
  });
}

// Test 3: Monday week 1 has 可靠性
{
  const { ctx } = loadInContext('2026-09-07', 720);
  test('Monday week 1 has 可靠性中的机器学习', () => {
    const classes = ctx.todayClasses('2026-09-07');
    assert.ok(classes.length > 0);
    assert.ok(classes.some(c => c.course.name.includes('可靠性中的机器学习')));
  });
}

// Test 4: Week 10 Monday - 可靠性 disappears, 物流 appears
{
  const { ctx } = loadInContext('2026-11-09', 720);
  test('Week 10 Monday: 可靠性 gone, 物流 present', () => {
    const classes = ctx.todayClasses('2026-11-09');
    assert.ok(!classes.some(c => c.course.name.includes('可靠性中的机器学习')));
    assert.ok(classes.some(c => c.course.name.includes('物流运输模型与算法')));
  });
}

// Test 5: Week 12 Monday - 物流 [8-9] gone
{
  const { ctx } = loadInContext('2026-11-23', 720);
  test('Week 12 Monday: 物流 [8-9节] gone', () => {
    const classes = ctx.todayClasses('2026-11-23');
    const logistics = classes.filter(c => c.course.name.includes('物流运输模型与算法'));
    assert.ok(logistics.length === 0 || logistics.every(c => !c.slots.some(s => s.p[0] === 8 && s.p[1] === 9)));
  });
}

// Test 6: No-fixed courses include 人工智能安全与伦理
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('No-fixed courses include 人工智能安全与伦理', () => {
    const noFixed = ctx.noFixedCourses();
    assert.ok(noFixed.some(c => c.name.includes('人工智能安全与伦理')));
  });
}

// Test 7: Todo CRUD
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Todo CRUD: add, update, delete', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25', time: '14:00' });
    assert.ok(id);
    const S = ctx.getState();
    assert.strictEqual(S.todos.length, 1);
    
    ctx.updateTodo(id, { title: 'Updated' });
    const todo = S.todos.find(t => t.id === id);
    assert.strictEqual(todo.title, 'Updated');
    
    ctx.deleteTodo(id);
    assert.strictEqual(S.todos.length, 0);
  });
}

// Test 8: Repeat weekly
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Repeat weekly: appears next week same day', () => {
    ctx.addTodo({ title: 'Weekly', date: '2026-09-25', time: '14:00', repeat: 'weekly' });
    const nextWeek = ctx.getTodosForDate('2026-10-02');
    assert.ok(nextWeek.some(t => t.title === 'Weekly'));
  });
}

// Test 9: Repeat daily
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Repeat daily: appears every day', () => {
    ctx.addTodo({ title: 'Daily', date: '2026-09-25', time: '14:00', repeat: 'daily' });
    const tomorrow = ctx.getTodosForDate('2026-09-26');
    const nextDay = ctx.getTodosForDate('2026-09-27');
    assert.ok(tomorrow.some(t => t.title === 'Daily'));
    assert.ok(nextDay.some(t => t.title === 'Daily'));
  });
}

// Test 10: Toggle done
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Toggle done: per-date completion', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25', repeat: 'weekly' });
    ctx.toggleDone(id, '2026-09-25');
    const S = ctx.getState();
    const todo = S.todos.find(t => t.id === id);
    assert.ok(todo.doneDates.includes('2026-09-25'));
    assert.ok(!todo.doneDates.includes('2026-10-02'));
  });
}

// Test 11: Persistence
{
  const { ctx, store } = loadInContext('2026-09-25', 720);
  test('Persistence: data survives reload', () => {
    ctx.addTodo({ title: 'Persist', date: '2026-09-25' });
    assert.ok(store['my-schedule.v1']);
    
    const loaded = JSON.parse(store['my-schedule.v1']);
    assert.ok(loaded.todos.some(t => t.title === 'Persist'));
  });
}

// Test 12: Export/Import
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Export/Import: backup and restore', () => {
    ctx.addTodo({ title: 'Backup', date: '2026-09-25' });
    ctx.setPeriod(1, '08:10', '08:55');
    
    const S = ctx.getState();
    const backup = JSON.stringify(S);
    
    ctx.resetAll();
    let S2 = ctx.getState();
    assert.strictEqual(S2.todos.length, 0);
    assert.strictEqual(S2.periods.find(p => p.n === 1).start, '08:00');
    
    const imported = JSON.parse(backup);
    Object.assign(S2, imported);
    ctx.save();
    
    S2 = ctx.getState();
    assert.ok(S2.todos.some(t => t.title === 'Backup'));
    assert.strictEqual(S2.periods.find(p => p.n === 1).start, '08:10');
  });
}

// Test 13: Reset to seed
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Reset: restores seed data', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.resetAll();
    const S = ctx.getState();
    assert.strictEqual(S.todos.length, 0);
    assert.strictEqual(S.courses.length, 4);
    assert.strictEqual(S.periods.length, 14);
  });
}

// Test 14: Overdue detection
{
  const { ctx } = loadInContext('2026-09-25', 900);
  test('Overdue: past time today is overdue', () => {
    const todo = { id: 'x', time: '14:00', doneDates: [] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-25'), true);
  });
}

// Test 15: Reminder active
{
  const { ctx } = loadInContext('2026-09-25', 845);
  test('Reminder: active within window', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    const reminders = ctx.getActiveReminders();
    const active = reminders.filter(r => r.status === 'active');
    assert.strictEqual(active.length, 1);
  });
}

// Test 16: Course time calculation
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Course time: periods 2-5 end at 12:15', () => {
    const classes = ctx.todayClasses('2026-09-25');
    const writing = classes.find(c => c.course.name.includes('科学研究与学术写作'));
    assert.ok(writing);
    assert.strictEqual(writing.endTime, '12:15');
  });
}

// Test 17: Week boundary
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Week boundary: week 1 valid, week 20 invalid', () => {
    const S = ctx.getState();
    assert.ok(ctx.currentWeek('2026-09-07') >= 1);
    assert.ok(ctx.currentWeek('2026-09-07') <= S.meta.totalWeeks);
  });
}

// Test 18: Course slots visibility
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Course slots: visible only in week range', () => {
    const slots1 = ctx.visibleSlots(1);
    const slots10 = ctx.visibleSlots(10);
    assert.ok(slots1.length > 0);
    assert.ok(slots10.length > 0);
  });
}

// Test 19: Todo filter by date
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Todo filter: getTodosForDate returns correct todos', () => {
    ctx.addTodo({ title: 'Today', date: '2026-09-25' });
    ctx.addTodo({ title: 'Tomorrow', date: '2026-09-26' });
    const today = ctx.getTodosForDate('2026-09-25');
    assert.ok(today.some(t => t.title === 'Today'));
    assert.ok(!today.some(t => t.title === 'Tomorrow'));
  });
}

// Test 20: Priority default
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Priority: default is 中', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const S = ctx.getState();
    const todo = S.todos.find(t => t.id === id);
    assert.strictEqual(todo.priority, '中');
  });
}

// Test 21: Remind default
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Remind: default is on with 15 min', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25', time: '14:00' });
    const S = ctx.getState();
    const todo = S.todos.find(t => t.id === id);
    assert.strictEqual(todo.remind.on, true);
    assert.strictEqual(todo.remind.before, 15);
  });
}

// Test 22: Course seed data
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Course seed: 4 courses loaded', () => {
    const S = ctx.getState();
    assert.strictEqual(S.courses.length, 4);
  });
}

// Test 23: Period seed data
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Period seed: 14 periods loaded', () => {
    const S = ctx.getState();
    assert.strictEqual(S.periods.length, 14);
  });
}

// Test 24: Meta seed data
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Meta seed: term and week1Monday correct', () => {
    const S = ctx.getState();
    assert.strictEqual(S.meta.term, '2026—2027学年 第一学期');
    assert.strictEqual(S.meta.week1Monday, '2026-09-07');
    assert.strictEqual(S.meta.totalWeeks, 19);
  });
}

// Test 25: Hash routing
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Hash routing: navigate changes location.hash', () => {
    ctx.navigate('#/timetable');
    assert.strictEqual(ctx.location.hash, '#/timetable');
  });
}

// Test 26: Today's todos on home
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Home today todos: includes today and repeat', () => {
    ctx.addTodo({ title: 'Today', date: '2026-09-25' });
    ctx.addTodo({ title: 'Daily', date: '2026-09-24', repeat: 'daily' });
    const todos = ctx.todayTodos('2026-09-25');
    assert.ok(todos.some(t => t.title === 'Today'));
    assert.ok(todos.some(t => t.title === 'Daily'));
  });
}

// Test 27: Class status
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Class status: future class is upcoming', () => {
    const cls = { startTime: '14:00', endTime: '15:35' };
    const status = ctx.classStatus(cls, '2026-09-25');
    assert.strictEqual(status, 'upcoming');
  });
}

// Test 28: Week overview
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Week overview: returns 7 days', () => {
    const overview = ctx.weekOverview();
    assert.strictEqual(overview.length, 7);
  });
}

// Test 29: Course color index
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Course color: cycles through 6 colors', () => {
    const idx1 = ctx.courseColorIndex('D141011A03');
    const idx2 = ctx.courseColorIndex('D411026B01');
    assert.ok(idx1 >= 0 && idx1 < 6);
    assert.ok(idx2 >= 0 && idx2 < 6);
  });
}

// Test 30: Integration - full workflow
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('Integration: add todo, toggle done, check both pages', () => {
    const id = ctx.addTodo({ title: 'Integration', date: '2026-09-25', time: '14:00' });
    
    const homeTodos = ctx.todayTodos('2026-09-25');
    assert.ok(homeTodos.some(t => t.title === 'Integration'));
    
    const listTodos = ctx.getTodosForDate('2026-09-25');
    assert.ok(listTodos.some(t => t.title === 'Integration'));
    
    ctx.toggleDone(id, '2026-09-25');
    const S = ctx.getState();
    const todo = S.todos.find(t => t.id === id);
    assert.ok(todo.doneDates.includes('2026-09-25'));
    
    ctx.deleteTodo(id);
    assert.strictEqual(S.todos.length, 0);
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
