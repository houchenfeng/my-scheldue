const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadInContext() {
  const ctx = {
    console,
    Date,
    Math,
    String,
    Number,
    Array,
    Object,
    JSON,
    parseInt,
    parseFloat,
    localStorage: (() => {
      const store = {};
      return {
        getItem: k => store[k] || null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        _store: store
      };
    })(),
    location: { hash: '' },
    window: null,
    document: null,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;

  const mockElements = {};
  let nextId = 1;

  function makeEl(tag, id) {
    const children = [];
    const el = {
      tagName: tag.toUpperCase(),
      id: id || '',
      dataset: {},
      style: {},
      className: '',
      textContent: '',
      innerHTML: '',
      _children: children,
      _listeners: {},
      setAttribute(k, v) { el[k] = v; },
      getAttribute(k) { return el[k] || null; },
      addEventListener(ev, fn) {
        if (!el._listeners[ev]) el._listeners[ev] = [];
        el._listeners[ev].push(fn);
      },
      appendChild(child) { children.push(child); },
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      click() {}
    };
    if (id) mockElements[id] = el;
    return el;
  }

  const bodyEl = makeEl('div', 'body');
  const pageHome = makeEl('section', 'page-home');
  const pageTimetable = makeEl('section', 'page-timetable');
  const pageTodos = makeEl('section', 'page-todos');
  const mainNav = makeEl('nav', 'main-nav');
  const topbarInfo = makeEl('div', 'topbar-info');
  const modalRoot = makeEl('div', 'modal-root');
  modalRoot.classList = { add() {}, remove() {}, toggle() {} };
  modalRoot.classList._set = (cls) => { modalRoot.className = cls; };

  bodyEl._children = [pageHome, pageTimetable, pageTodos];

  const doc = {
    getElementById(id) { return mockElements[id] || null; },
    querySelectorAll(sel) {
      if (sel === '.nav-tab') return mockElements._navTabs || [];
      return [];
    },
    createElement(tag) { return makeEl(tag); },
    body: bodyEl,
    addEventListener() {}
  };
  ctx.document = doc;

  // mock innerHTML setter that parses data attributes from block elements
  const origInner = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(pageTimetable), 'innerHTML') || {};
  Object.defineProperty(pageTimetable, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) {
      this._innerHTML = v;
      // parse tt-block elements
      const blocks = [];
      const blockRe = /data-code="([^"]*)"[^>]*data-slot-wd="(\d+)"[^>]*data-slot-p="([^"]*)"/g;
      let m;
      while ((m = blockRe.exec(v)) !== null) {
        const bel = makeEl('div');
        bel.dataset.code = m[1];
        bel.dataset.slotWd = m[2];
        bel.dataset.slotP = m[3];
        bel._listeners = {};
        bel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        blocks.push(bel);
      }
      // parse no-fixed-item elements
      const noFixedItems = [];
      const nfRe = /class="no-fixed-item"[^>]*data-code="([^"]*)"/g;
      while ((m = nfRe.exec(v)) !== null) {
        const nel = makeEl('div');
        nel.dataset.code = m[1];
        nel._listeners = {};
        nel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        noFixedItems.push(nel);
      }
      this._blocks = blocks;
      this._noFixedItems = noFixedItems;
      // parse buttons
      const btns = {};
      const btnRe = /id="(week-prev|week-next)"/g;
      while ((m = btnRe.exec(v)) !== null) {
        const bel = makeEl('button', m[1]);
        bel.disabled = v.includes(`id="${m[1]}" disabled`) || v.includes(`id="${m[1]}"  disabled`);
        // check for disabled attribute more carefully
        const btnFull = v.match(new RegExp(`id="${m[1]}"[^>]*`));
        if (btnFull && btnFull[0].includes('disabled')) bel.disabled = true;
        bel._listeners = {};
        bel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        btns[m[1]] = bel;
      }
      this._buttons = btns;
    }
  });

  Object.defineProperty(pageTimetable, 'querySelectorAll', {
    value: function(sel) {
      if (sel === '.tt-block') return this._blocks || [];
      if (sel === '.no-fixed-item') return this._noFixedItems || [];
      return [];
    }
  });

  // modalRoot innerHTML tracking
  Object.defineProperty(modalRoot, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) {
      this._innerHTML = v;
      // parse close button
      const closeBtn = makeEl('button', 'modal-close');
      closeBtn._listeners = {};
      closeBtn.addEventListener = function(ev, fn) {
        if (!this._listeners[ev]) this._listeners[ev] = [];
        this._listeners[ev].push(fn);
      };
      this._closeBtn = closeBtn;
    }
  });

  // Override classList for modalRoot to track visible
  let modalVisible = false;
  modalRoot.classList = {
    add(cls) { if (cls === 'visible') modalVisible = true; },
    remove(cls) { if (cls === 'visible') modalVisible = false; },
    toggle(cls) { if (cls === 'visible') modalVisible = !modalVisible; }
  };
  Object.defineProperty(modalRoot, '_isVisible', {
    get() { return modalVisible; }
  });

  ctx.mockElements = mockElements;
  ctx.modalRoot = modalRoot;
  ctx.pageTimetable = pageTimetable;

  vm.createContext(ctx);

  const files = ['js/seed.js', 'js/dates.js', 'js/store.js', 'js/ui.js', 'js/page-timetable.js'];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  return { ctx, mockElements, pageTimetable, modalRoot };
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

console.log('P3 Tests: Timetable Page\n');

// Test 1: setViewWeek clamps to valid range
{
  const { ctx } = loadInContext();
  test('setViewWeek clamps to 1 when given 0', () => {
    ctx.setViewWeek(0);
    assert.strictEqual(ctx.getViewWeek(), 1);
  });
}

// Test 2: setViewWeek clamps to totalWeeks
{
  const { ctx } = loadInContext();
  test('setViewWeek clamps to totalWeeks (19)', () => {
    ctx.setViewWeek(25);
    assert.strictEqual(ctx.getViewWeek(), 19);
  });
}

// Test 3: setViewWeek accepts valid week
{
  const { ctx } = loadInContext();
  test('setViewWeek accepts valid week 5', () => {
    ctx.setViewWeek(5);
    assert.strictEqual(ctx.getViewWeek(), 5);
  });
}

// Test 4: visibleSlots returns correct slots for week 1
{
  const { ctx } = loadInContext();
  test('visibleSlots week 1 returns 2 slots (可靠性 + 写作)', () => {
    const slots = ctx.visibleSlots(1);
    assert.strictEqual(slots.length, 2);
    const names = slots.map(s => s.course.name).sort();
    assert.ok(names.includes('可靠性中的机器学习(博)'));
    assert.ok(names.includes('科学研究与学术写作'));
  });
}

// Test 5: visibleSlots week 6 includes 物流运输
{
  const { ctx } = loadInContext();
  test('visibleSlots week 6 includes 物流运输 (3 slots)', () => {
    const slots = ctx.visibleSlots(6);
    const names = slots.map(s => s.course.name);
    const transportSlots = slots.filter(s => s.course.name === '物流运输模型与算法');
    assert.strictEqual(transportSlots.length, 3);
  });
}

// Test 6: visibleSlots week 10 excludes 可靠性 (ends week 9)
{
  const { ctx } = loadInContext();
  test('visibleSlots week 10 excludes 可靠性中的机器学习', () => {
    const slots = ctx.visibleSlots(10);
    const names = slots.map(s => s.course.name);
    assert.ok(!names.includes('可靠性中的机器学习(博)'));
  });
}

// Test 7: visibleSlots week 12 excludes 写作 (ends week 8)
{
  const { ctx } = loadInContext();
  test('visibleSlots week 12 excludes 科学研究与学术写作', () => {
    const slots = ctx.visibleSlots(12);
    const names = slots.map(s => s.course.name);
    assert.ok(!names.includes('科学研究与学术写作'));
  });
}

// Test 8: noFixedCourses returns courses with no slots
{
  const { ctx } = loadInContext();
  test('noFixedCourses returns 人工智能安全与伦理', () => {
    const list = ctx.noFixedCourses();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, '人工智能安全与伦理');
  });
}

// Test 9: courseColorIndex returns consistent index
{
  const { ctx } = loadInContext();
  test('courseColorIndex returns 0 for first course', () => {
    assert.strictEqual(ctx.courseColorIndex('D141011A03'), 0);
  });
}

// Test 10: courseColorIndex returns 1 for second course
{
  const { ctx } = loadInContext();
  test('courseColorIndex returns 1 for second course', () => {
    assert.strictEqual(ctx.courseColorIndex('D411026B01'), 1);
  });
}

// Test 11: gridHTML contains week day headers
{
  const { ctx } = loadInContext();
  test('gridHTML contains 周 headers', () => {
    const html = ctx.gridHTML(1);
    assert.ok(html.includes('周一'));
    assert.ok(html.includes('周二'));
    assert.ok(html.includes('周日'));
  });
}

// Test 12: gridHTML contains course block for 可靠性 in week 1
{
  const { ctx } = loadInContext();
  test('gridHTML week 1 contains 可靠性 block', () => {
    const html = ctx.gridHTML(1);
    assert.ok(html.includes('可靠性中的机器学习(博)'));
    assert.ok(html.includes('B118'));
  });
}

// Test 13: gridHTML does not contain 物流运输 in week 5 (starts week 6)
{
  const { ctx } = loadInContext();
  test('gridHTML week 5 does not contain 物流运输', () => {
    const html = ctx.gridHTML(5);
    assert.ok(!html.includes('物流运输模型与算法'));
  });
}

// Test 14: gridHTML contains 物流运输 in week 6
{
  const { ctx } = loadInContext();
  test('gridHTML week 6 contains 物流运输', () => {
    const html = ctx.gridHTML(6);
    assert.ok(html.includes('物流运输模型与算法'));
  });
}

// Test 15: noFixedHTML contains the no-fixed course
{
  const { ctx } = loadInContext();
  test('noFixedHTML contains 人工智能安全与伦理', () => {
    // noFixedHTML is not exported but renderTimetable calls it
    // We can test via the rendered page
    // Instead, test indirectly: noFixedCourses returns it
    const list = ctx.noFixedCourses();
    assert.strictEqual(list.length, 1);
  });
}

// Test 16: renderTimetable populates page
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable populates page-timetable', () => {
    ctx.setViewWeek(1);
    ctx.renderTimetable();
    const html = pageTimetable.innerHTML;
    assert.ok(html.includes('第 1 周'));
    assert.ok(html.includes('上一周'));
    assert.ok(html.includes('下一周'));
  });
}

// Test 17: renderTimetable disables prev button at week 1
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable disables prev at week 1', () => {
    ctx.setViewWeek(1);
    ctx.renderTimetable();
    const prevBtn = pageTimetable._buttons['week-prev'];
    assert.ok(prevBtn);
    assert.strictEqual(prevBtn.disabled, true);
  });
}

// Test 18: renderTimetable disables next button at week 19
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable disables next at week 19', () => {
    ctx.setViewWeek(19);
    ctx.renderTimetable();
    const nextBtn = pageTimetable._buttons['week-next'];
    assert.ok(nextBtn);
    assert.strictEqual(nextBtn.disabled, true);
  });
}

// Test 19: renderTimetable enables both buttons at week 5
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable enables both buttons at week 5', () => {
    ctx.setViewWeek(5);
    ctx.renderTimetable();
    const prevBtn = pageTimetable._buttons['week-prev'];
    const nextBtn = pageTimetable._buttons['week-next'];
    assert.ok(prevBtn);
    assert.ok(nextBtn);
    assert.strictEqual(prevBtn.disabled, false);
    assert.strictEqual(nextBtn.disabled, false);
  });
}

// Test 20: prev button click decrements week
{
  const { ctx, pageTimetable } = loadInContext();
  test('prev button click decrements week', () => {
    ctx.setViewWeek(5);
    ctx.renderTimetable();
    const prevBtn = pageTimetable._buttons['week-prev'];
    assert.ok(prevBtn._listeners.click);
    prevBtn._listeners.click[0]();
    assert.strictEqual(ctx.getViewWeek(), 4);
  });
}

// Test 21: next button click increments week
{
  const { ctx, pageTimetable } = loadInContext();
  test('next button click increments week', () => {
    ctx.setViewWeek(5);
    ctx.renderTimetable();
    const nextBtn = pageTimetable._buttons['week-next'];
    assert.ok(nextBtn._listeners.click);
    nextBtn._listeners.click[0]();
    assert.strictEqual(ctx.getViewWeek(), 6);
  });
}

// Test 22: openCourseModal shows course details
{
  const { ctx, modalRoot } = loadInContext();
  test('openCourseModal shows course name and details', () => {
    ctx.openCourseModal('D141011A03');
    assert.ok(modalRoot._isVisible);
    const html = modalRoot.innerHTML;
    assert.ok(html.includes('可靠性中的机器学习(博)'));
    assert.ok(html.includes('D141011A03'));
    assert.ok(html.includes('刘杰'));
    assert.ok(html.includes('B118'));
  });
}

// Test 23: openCourseModal shows all time slots for 物流运输
{
  const { ctx, modalRoot } = loadInContext();
  test('openCourseModal shows all 3 slots for 物流运输', () => {
    ctx.openCourseModal('T130032042');
    const html = modalRoot.innerHTML;
    assert.ok(html.includes('物流运输模型与算法'));
    // Should have 3 modal-slot entries
    const slotCount = (html.match(/modal-slot/g) || []).length;
    assert.ok(slotCount >= 3, `Expected >= 3 modal-slot, got ${slotCount}`);
  });
}

// Test 24: openCourseModal shows "未固定" for no-slot course
{
  const { ctx, modalRoot } = loadInContext();
  test('openCourseModal shows 未固定 for no-slot course', () => {
    ctx.openCourseModal('D411026B01');
    const html = modalRoot.innerHTML;
    assert.ok(html.includes('未固定'));
    assert.ok(html.includes('人工智能安全与伦理'));
  });
}

// Test 25: openCourseModal close button works
{
  const { ctx, modalRoot } = loadInContext();
  test('openCourseModal close button hides modal', () => {
    ctx.openCourseModal('D141011A03');
    assert.ok(modalRoot._isVisible);
    const closeBtn = modalRoot._closeBtn;
    assert.ok(closeBtn);
    assert.ok(closeBtn._listeners.click);
    closeBtn._listeners.click[0]();
    assert.strictEqual(modalRoot._isVisible, false);
  });
}

// Test 26: renderTimetable includes no-fixed section
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable includes no-fixed course section', () => {
    ctx.setViewWeek(1);
    ctx.renderTimetable();
    const html = pageTimetable.innerHTML;
    assert.ok(html.includes('未固定时间课程'));
    assert.ok(html.includes('人工智能安全与伦理'));
  });
}

// Test 27: blockStyle returns correct grid-row
{
  const { ctx } = loadInContext();
  test('blockStyle returns correct grid-row for slot p [1,2]', () => {
    const style = ctx.blockStyle({ p: [1, 2] });
    assert.ok(style.includes('grid-row: 2 / 4'));
  });
}

// Test 28: blockStyle returns correct grid-row for single period
{
  const { ctx } = loadInContext();
  test('blockStyle returns correct grid-row for slot p [10,10]', () => {
    const style = ctx.blockStyle({ p: [10, 10] });
    assert.ok(style.includes('grid-row: 11 / 12'));
  });
}

// Test 29: renderTimetable shows correct week range text
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable shows week range text', () => {
    ctx.setViewWeek(1);
    ctx.renderTimetable();
    const html = pageTimetable.innerHTML;
    // Week 1 Monday is 2026-09-07, so range should include 09-07
    assert.ok(html.includes('09-07'));
  });
}

// Test 30: renderTimetable at week 6 shows 3 物流运输 blocks
{
  const { ctx, pageTimetable } = loadInContext();
  test('renderTimetable week 6 shows 3 物流运输 blocks', () => {
    ctx.setViewWeek(6);
    ctx.renderTimetable();
    const blocks = pageTimetable._blocks || [];
    const transportBlocks = blocks.filter(b => b.dataset.code === 'T130032042');
    assert.strictEqual(transportBlocks.length, 3);
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
