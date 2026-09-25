const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadInContext(fakeToday) {
  const store = {};
  const ctx = {
    console,
    Date: class extends Date {
      constructor(...args) {
        if (args.length === 0 && fakeToday) {
          super(fakeToday + 'T12:00:00');
        } else if (args.length === 0) {
          super();
        } else {
          super(...args);
        }
      }
      static now() {
        if (fakeToday) {
          return new Date(fakeToday + 'T12:00:00').getTime();
        }
        return Date.now();
      }
    },
    Math,
    String,
    Number,
    Array,
    Object,
    JSON,
    parseInt,
    parseFloat,
    localStorage: {
      getItem: k => store[k] || null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      _store: store
    },
    location: { hash: '' },
    window: null,
    document: null,
    setTimeout,
    clearTimeout
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
      _listeners: {},
      setAttribute(k, v) { el[k] = v; },
      getAttribute(k) { return el[k] || null; },
      addEventListener(ev, fn) {
        if (!el._listeners[ev]) el._listeners[ev] = [];
        el._listeners[ev].push(fn);
      },
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      click() {}
    };
    if (id) mockElements[id] = el;
    return el;
  }

  const pageHome = makeEl('section', 'page-home');

  Object.defineProperty(pageHome, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) {
      this._innerHTML = v;
      const items = [];
      const re = /class="home-class-item[^"]*"[^>]*data-code="([^"]*)"/g;
      let m;
      while ((m = re.exec(v)) !== null) {
        const iel = makeEl('div');
        iel.dataset.code = m[1];
        iel._listeners = {};
        iel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        items.push(iel);
      }
      this._classItems = items;
    }
  });

  Object.defineProperty(pageHome, 'querySelectorAll', {
    value: function(sel) {
      if (sel === '.home-class-item') return this._classItems || [];
      return [];
    }
  });

  ctx.mockElements = mockElements;
  ctx.pageHome = pageHome;

  const doc = {
    getElementById(id) {
      if (id === 'page-home') return pageHome;
      if (id === 'page-todos') return makeEl('section', 'page-todos');
      if (id === 'page-timetable') return makeEl('section', 'page-timetable');
      if (id === 'modal-root') return makeEl('div', 'modal-root');
      return mockElements[id] || null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    body: makeEl('div', 'body'),
    addEventListener() {}
  };
  ctx.document = doc;

  vm.createContext(ctx);

  const files = ['js/seed.js', 'js/dates.js', 'js/store.js', 'js/ui.js', 'js/page-timetable.js', 'js/page-todos.js', 'js/page-home.js'];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  ctx.load();
  return { ctx, pageHome };
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

console.log('P5 Tests: Home Page\n');

// 2026-09-25 is Friday (weekdayIndex=5), week 3
// 2026-09-28 is Monday (weekdayIndex=1), week 4

// Test 1: todayClasses returns classes for Friday week 3
{
  const { ctx } = loadInContext('2026-09-25');
  test('todayClasses returns 科学研究与学术写作 on Fri week 3', () => {
    const classes = ctx.todayClasses('2026-09-25');
    assert.strictEqual(classes.length, 1);
    assert.strictEqual(classes[0].course.name, '科学研究与学术写作');
  });
}

// Test 2: todayClasses returns 1 class on Mon week 1 (only 可靠性, 写作 is Fri)
{
  const { ctx } = loadInContext('2026-09-07');
  test('todayClasses returns 1 class on Mon week 1 (可靠性)', () => {
    const classes = ctx.todayClasses('2026-09-07');
    assert.strictEqual(classes.length, 1);
    assert.strictEqual(classes[0].course.name, '可靠性中的机器学习(博)');
  });
}

// Test 3: todayClasses returns empty on Sunday
{
  const { ctx } = loadInContext('2026-09-27');
  test('todayClasses returns empty on Sunday week 3', () => {
    const classes = ctx.todayClasses('2026-09-27');
    assert.strictEqual(classes.length, 0);
  });
}

// Test 4: todayClasses returns 2 物流运输 on Mon week 6 (wd:1 has 2 slots, wd:2 is Tue)
{
  const { ctx } = loadInContext('2026-10-12');
  test('todayClasses returns 2 物流运输 slots on Mon week 6', () => {
    const classes = ctx.todayClasses('2026-10-12');
    const transport = classes.filter(c => c.course.name === '物流运输模型与算法');
    assert.strictEqual(transport.length, 2);
  });
}

// Test 5: todayClasses returns empty outside term
{
  const { ctx } = loadInContext('2026-01-01');
  test('todayClasses returns empty outside term', () => {
    const classes = ctx.todayClasses('2026-01-05');
    assert.strictEqual(classes.length, 0);
  });
}

// Test 6: todayClasses sorted by start period
{
  const { ctx } = loadInContext('2026-10-12');
  test('todayClasses sorted by start period', () => {
    const classes = ctx.todayClasses('2026-10-12');
    assert.ok(classes.length >= 2);
    assert.ok(classes[0].startPeriod <= classes[1].startPeriod);
  });
}

// Test 7: todayTodos returns todos for today
{
  const { ctx } = loadInContext('2026-09-25');
  test('todayTodos returns todos for today', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const todos = ctx.todayTodos('2026-09-25');
    assert.strictEqual(todos.length, 1);
  });
}

// Test 8: todayTodos includes daily repeat
{
  const { ctx } = loadInContext('2026-09-25');
  test('todayTodos includes daily repeat todo', () => {
    ctx.addTodo({ title: 'Daily', date: '2026-09-20', repeat: 'daily' });
    const todos = ctx.todayTodos('2026-09-25');
    assert.strictEqual(todos.length, 1);
  });
}

// Test 9: classStatus returns 'future' for non-today
{
  const { ctx } = loadInContext('2026-09-25');
  test('classStatus returns future for non-today', () => {
    const cls = { startTime: '08:00', endTime: '09:35' };
    assert.strictEqual(ctx.classStatus(cls, '2026-09-26'), 'future');
  });
}

// Test 10: classStatus returns 'upcoming' for future class today
{
  const { ctx } = loadInContext('2026-09-25');
  test('classStatus returns upcoming for future class today', () => {
    const cls = { startTime: '22:00', endTime: '22:15' };
    assert.strictEqual(ctx.classStatus(cls, '2026-09-25'), 'upcoming');
  });
}

// Test 11: classStatus returns 'finished' for past class today
{
  const { ctx } = loadInContext('2026-09-25');
  test('classStatus returns finished for past class today', () => {
    const cls = { startTime: '00:00', endTime: '00:45' };
    assert.strictEqual(ctx.classStatus(cls, '2026-09-25'), 'finished');
  });
}

// Test 12: statusText returns correct labels
{
  const { ctx } = loadInContext('2026-09-25');
  test('statusText returns correct labels', () => {
    assert.strictEqual(ctx.statusText('upcoming'), '未开始');
    assert.strictEqual(ctx.statusText('ongoing'), '上课中');
    assert.strictEqual(ctx.statusText('finished'), '已下课');
    assert.strictEqual(ctx.statusText('future'), '');
  });
}

// Test 13: weekOverview returns 7 days
{
  const { ctx } = loadInContext('2026-09-25');
  test('weekOverview returns 7 days', () => {
    const overview = ctx.weekOverview();
    assert.strictEqual(overview.length, 7);
  });
}

// Test 14: weekOverview marks today
{
  const { ctx } = loadInContext('2026-09-25');
  test('weekOverview marks today correctly', () => {
    const overview = ctx.weekOverview();
    const todayDays = overview.filter(d => d.isToday);
    assert.strictEqual(todayDays.length, 1);
    assert.strictEqual(todayDays[0].dateStr, '2026-09-25');
  });
}

// Test 15: weekOverview shows class counts
{
  const { ctx } = loadInContext('2026-09-25');
  test('weekOverview shows class counts for Friday', () => {
    const overview = ctx.weekOverview();
    const fri = overview.find(d => d.dateStr === '2026-09-25');
    assert.strictEqual(fri.classes.length, 1);
  });
}

// Test 16: weekOverview Monday has 1 class in week 3 (only 可靠性)
{
  const { ctx } = loadInContext('2026-09-21');
  test('weekOverview Mon week 3 has 1 class (可靠性)', () => {
    const overview = ctx.weekOverview();
    const mon = overview.find(d => d.wd === 1);
    assert.strictEqual(mon.classes.length, 1);
  });
}

// Test 17: renderHome populates page
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome populates page-home', () => {
    ctx.renderHome();
    const html = pageHome.innerHTML;
    assert.ok(html.includes('今日课程'));
    assert.ok(html.includes('今日待办'));
    assert.ok(html.includes('本周概览'));
  });
}

// Test 18: renderHome shows date
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows today date', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('09-25'));
  });
}

// Test 19: renderHome shows class name
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows class name for today', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('科学研究与学术写作'));
  });
}

// Test 20: renderHome shows empty message when no classes
{
  const { ctx, pageHome } = loadInContext('2026-09-27');
  test('renderHome shows 今天没有课 on Sunday', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('今天没有课'));
  });
}

// Test 21: renderHome shows todos
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows added todo', () => {
    ctx.addTodo({ title: 'Buy milk', date: '2026-09-25' });
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('Buy milk'));
  });
}

// Test 22: renderHome shows empty todos message
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows 今天没有待办 when no todos', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('今天没有待办'));
  });
}

// Test 23: renderHome shows week overview with 7 days
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows 7 day overview', () => {
    ctx.renderHome();
    const html = pageHome.innerHTML;
    assert.ok(html.includes('周一'));
    assert.ok(html.includes('周日'));
  });
}

// Test 24: renderHome marks today in overview
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome marks today in overview', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('week-day-today'));
  });
}

// Test 25: renderHome class items are clickable
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome class items have click handlers', () => {
    ctx.renderHome();
    const items = pageHome._classItems || [];
    assert.ok(items.length > 0);
    assert.ok(items[0]._listeners.click);
  });
}

// Test 26: renderHome shows class time
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows class time', () => {
    ctx.renderHome();
    // 科学研究与学术写作: periods 2-5, 08:50-12:15
    assert.ok(pageHome.innerHTML.includes('08:50'));
    assert.ok(pageHome.innerHTML.includes('12:15'));
  });
}

// Test 27: renderHome shows class location
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows class location', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('计算机房(R1-4093)'));
  });
}

// Test 28: renderHome shows class teacher
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows class teacher', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('黄雪飞,张莹莹'));
  });
}

// Test 29: weekOverview outside term returns empty
{
  const { ctx } = loadInContext('2026-01-05');
  test('weekOverview outside term returns empty array', () => {
    const overview = ctx.weekOverview();
    assert.strictEqual(overview.length, 0);
  });
}

// Test 30: renderHome shows class count in overview
{
  const { ctx, pageHome } = loadInContext('2026-09-25');
  test('renderHome shows class count in overview', () => {
    ctx.renderHome();
    assert.ok(pageHome.innerHTML.includes('1节课'));
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
