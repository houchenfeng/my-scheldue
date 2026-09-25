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

      // Also create non-button elements referenced by getElementById
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
      // Check modalRoot buttons and extras
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
  return { ctx, remindBar, modalRoot, store };
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

console.log('P6 Tests: Reminder System + Settings\n');

// Test 1: timeToMinutes converts correctly
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('timeToMinutes converts 14:30 to 870', () => {
    assert.strictEqual(ctx.timeToMinutes('14:30'), 870);
  });
}

// Test 2: timeToMinutes returns null for empty
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('timeToMinutes returns null for null', () => {
    assert.strictEqual(ctx.timeToMinutes(null), null);
  });
}

// Test 3: getActiveReminders returns active reminder
{
  const { ctx } = loadInContext('2026-09-25', 845);
  test('getActiveReminders returns active reminder within window', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    const reminders = ctx.getActiveReminders();
    const active = reminders.filter(r => r.status === 'active');
    assert.strictEqual(active.length, 1);
  });
}

// Test 4: getActiveReminders returns overdue when past start
{
  const { ctx } = loadInContext('2026-09-25', 900);
  test('getActiveReminders returns overdue after start time', () => {
    ctx.addTodo({ title: 'Past', date: '2026-09-25', time: '14:00', remind: { on: true, before: 15 } });
    const reminders = ctx.getActiveReminders();
    const overdue = reminders.filter(r => r.status === 'overdue');
    assert.strictEqual(overdue.length, 1);
  });
}

// Test 5: getActiveReminders skips done todos
{
  const { ctx } = loadInContext('2026-09-25', 830);
  test('getActiveReminders skips done todos', () => {
    const id = ctx.addTodo({ title: 'Done', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    ctx.toggleDone(id, '2026-09-25');
    const reminders = ctx.getActiveReminders();
    assert.strictEqual(reminders.length, 0);
  });
}

// Test 6: getActiveReminders skips todos without time
{
  const { ctx } = loadInContext('2026-09-25', 830);
  test('getActiveReminders skips todos without time', () => {
    ctx.addTodo({ title: 'No time', date: '2026-09-25', time: null });
    const reminders = ctx.getActiveReminders();
    assert.strictEqual(reminders.length, 0);
  });
}

// Test 7: getActiveReminders silent before trigger
{
  const { ctx } = loadInContext('2026-09-25', 800);
  test('getActiveReminders silent before trigger time', () => {
    ctx.addTodo({ title: 'Future', date: '2026-09-25', time: '14:30', remind: { on: true, before: 15 } });
    const reminders = ctx.getActiveReminders();
    assert.strictEqual(reminders.length, 0);
  });
}

// Test 8: renderRemindBar shows bar when active
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 845);
  test('renderRemindBar shows bar for active reminder', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    ctx.renderRemindBar();
    assert.ok(remindBar.classList.contains('visible'));
    assert.ok(remindBar.innerHTML.includes('Meeting'));
  });
}

// Test 9: renderRemindBar hides bar when no reminders
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 720);
  test('renderRemindBar hides bar when no reminders', () => {
    ctx.renderRemindBar();
    assert.ok(!remindBar.classList.contains('visible'));
  });
}

// Test 10: renderRemindBar dismiss works
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 845);
  test('renderRemindBar dismiss hides the bar', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    ctx.renderRemindBar();
    assert.ok(remindBar.classList.contains('visible'));
    const dismissBtn = remindBar._dismissBtn;
    dismissBtn._listeners.click[0]();
    assert.ok(!remindBar.classList.contains('visible'));
  });
}

// Test 11: isOverdue returns true for past time today
{
  const { ctx } = loadInContext('2026-09-25', 900);
  test('isOverdue returns true for past time today', () => {
    const todo = { id: 'x', time: '14:00', doneDates: [] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-25'), true);
  });
}

// Test 12: isOverdue returns false for future time today
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('isOverdue returns false for future time today', () => {
    const todo = { id: 'x', time: '14:00', doneDates: [] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-25'), false);
  });
}

// Test 13: isOverdue returns false for done todo
{
  const { ctx } = loadInContext('2026-09-25', 900);
  test('isOverdue returns false for done todo', () => {
    const todo = { id: 'x', time: '14:00', doneDates: ['2026-09-25'] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-25'), false);
  });
}

// Test 14: isOverdue returns false for no time
{
  const { ctx } = loadInContext('2026-09-25', 900);
  test('isOverdue returns false for todo without time', () => {
    const todo = { id: 'x', time: null, doneDates: [] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-25'), false);
  });
}

// Test 15: isOverdue returns true for past date
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('isOverdue returns true for past date with time', () => {
    const todo = { id: 'x', time: '14:00', doneDates: [] };
    assert.strictEqual(ctx.isOverdue(todo, '2026-09-24'), true);
  });
}

// Test 16: startTicker sets interval
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('startTicker sets interval', () => {
    ctx.startTicker();
    assert.ok(ctx._interval);
    ctx.stopTicker();
  });
}

// Test 17: stopTicker clears interval
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('stopTicker clears interval', () => {
    ctx.startTicker();
    ctx.stopTicker();
    assert.strictEqual(ctx._interval, null);
  });
}

// Test 18: openSettingsModal shows settings
{
  const { ctx, modalRoot } = loadInContext('2026-09-25', 720);
  test('openSettingsModal shows settings modal', () => {
    ctx.openSettingsModal();
    assert.ok(modalRoot._isVisible);
    assert.ok(modalRoot.innerHTML.includes('设置'));
    assert.ok(modalRoot.innerHTML.includes('节次时间'));
    assert.ok(modalRoot.innerHTML.includes('数据管理'));
  });
}

// Test 19: settings shows period inputs
{
  const { ctx, modalRoot } = loadInContext('2026-09-25', 720);
  test('openSettingsModal shows period inputs', () => {
    ctx.openSettingsModal();
    const inputs = modalRoot._periodInputs || [];
    assert.ok(inputs.length > 0);
  });
}

// Test 20: settings has export/import/clear buttons
{
  const { ctx, modalRoot } = loadInContext('2026-09-25', 720);
  test('openSettingsModal has export/import/clear buttons', () => {
    ctx.openSettingsModal();
    assert.ok(modalRoot._buttons['settings-export']);
    assert.ok(modalRoot._buttons['settings-import']);
    assert.ok(modalRoot._buttons['settings-clear']);
  });
}

// Test 21: settings close button works
{
  const { ctx, modalRoot } = loadInContext('2026-09-25', 720);
  test('settings close button hides modal', () => {
    ctx.openSettingsModal();
    assert.ok(modalRoot._isVisible);
    const closeBtn = modalRoot._buttons['settings-close'];
    closeBtn._listeners.click[0]();
    assert.strictEqual(modalRoot._isVisible, false);
  });
}

// Test 22: setPeriod updates period time
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('setPeriod updates period start/end', () => {
    ctx.setPeriod(1, '08:10', '08:55');
    const S = ctx.getState();
    const p = S.periods.find(p => p.n === 1);
    assert.strictEqual(p.start, '08:10');
    assert.strictEqual(p.end, '08:55');
  });
}

// Test 23: resetAll clears data
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('resetAll clears todos', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.resetAll();
    const S = ctx.getState();
    assert.strictEqual(S.todos.length, 0);
  });
}

// Test 24: resetAll restores seed periods
{
  const { ctx } = loadInContext('2026-09-25', 720);
  test('resetAll restores seed periods', () => {
    ctx.setPeriod(1, '09:00', '09:45');
    ctx.resetAll();
    const S = ctx.getState();
    const p = S.periods.find(p => p.n === 1);
    assert.strictEqual(p.start, '08:00');
  });
}

// Test 25: renderRemindBar shows minutes until
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 845);
  test('renderRemindBar shows minutes remaining', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    ctx.renderRemindBar();
    assert.ok(remindBar.innerHTML.includes('分钟后开始'));
  });
}

// Test 26: tick calls renderRemindBar
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 720);
  test('tick runs without error', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25', time: '14:00', remind: { on: true, before: 15 } });
    ctx.tick();
  });
}

// Test 27: getActiveReminders with remind off
{
  const { ctx } = loadInContext('2026-09-25', 830);
  test('getActiveReminders with remind off still shows at start', () => {
    ctx.addTodo({ title: 'No remind', date: '2026-09-25', time: '14:00', remind: { on: false, before: 15 } });
    // At 14:00 (840 min), with remind off, triggerMin = startMin - 0 = 840
    // nowMin = 830, so 830 < 840, silent
    const reminders = ctx.getActiveReminders();
    assert.strictEqual(reminders.length, 0);
  });
}

// Test 28: getActiveReminders with remind off at start time
{
  const { ctx } = loadInContext('2026-09-25', 840);
  test('getActiveReminders with remind off at start time shows active', () => {
    ctx.addTodo({ title: 'No remind', date: '2026-09-25', time: '14:00', remind: { on: false, before: 15 } });
    const reminders = ctx.getActiveReminders();
    const active = reminders.filter(r => r.status === 'active');
    assert.strictEqual(active.length, 1);
  });
}

// Test 29: settings shows term info
{
  const { ctx, modalRoot } = loadInContext('2026-09-25', 720);
  test('openSettingsModal shows term info', () => {
    ctx.openSettingsModal();
    assert.ok(modalRoot.innerHTML.includes('2026—2027学年'));
  });
}

// Test 30: renderRemindBar jump button navigates
{
  const { ctx, remindBar } = loadInContext('2026-09-25', 845);
  test('renderRemindBar jump button has click handler', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25', time: '14:15', remind: { on: true, before: 15 } });
    ctx.renderRemindBar();
    const jumpBtn = remindBar._jumpBtn;
    assert.ok(jumpBtn._listeners.click);
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
