// P1 Test: Foundation layer (seed, dates, store)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock localStorage
const localStorageMock = {
  _data: {},
  getItem(key) { return this._data[key] || null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; },
  clear() { this._data = {}; }
};

// Create context with browser-like globals
const context = {
  window: { localStorage: localStorageMock },
  localStorage: localStorageMock,
  console: console,
  JSON: JSON,
  Date: Date,
  Math: Math,
  Error: Error,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  isFinite: isFinite,
  undefined: undefined,
  NaN: NaN,
  Infinity: Infinity,
  URL: { createObjectURL: () => 'mock://url', revokeObjectURL: () => {} },
  Blob: class Blob { constructor() {} },
  FileReader: class FileReader {
    constructor() { this.onload = null; this.onerror = null; }
    readAsText() { if (this.onload) this.onload({ target: { result: '{}' } }); }
  },
  document: { createElement: () => ({ click: () => {} }) }
};

vm.createContext(context);

function loadScript(filename) {
  const code = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  vm.runInContext(code, context);
}

// Load source files in order
loadScript('js/seed.js');
loadScript('js/dates.js');
loadScript('js/store.js');

// Test runner
let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.log(`  ✗ ${msg}`);
    failed++;
  }
}

console.log('P1 Foundation Layer Tests\n');

// Test SEED
console.log('SEED constants:');
assert(context.window.SEED.meta.term === '2026—2027学年 第一学期', 'SEED.meta.term');
assert(context.window.SEED.meta.week1Monday === '2026-09-07', 'SEED.meta.week1Monday');
assert(context.window.SEED.meta.totalWeeks === 19, 'SEED.meta.totalWeeks');
assert(context.window.SEED.periods.length === 14, 'SEED has 14 periods');
assert(context.window.SEED.courses.length === 4, 'SEED has 4 courses');
assert(context.window.SEED.courses[0].name === '可靠性中的机器学习(博)', 'Course 1 name verbatim');
assert(context.window.SEED.courses[1].name === '人工智能安全与伦理', 'Course 2 name verbatim');
assert(context.window.SEED.courses[2].name === '科学研究与学术写作', 'Course 3 name verbatim');
assert(context.window.SEED.courses[3].name === '物流运输模型与算法', 'Course 4 name verbatim');
assert(context.window.SEED.courses[0].slots[0].wd === 1, 'Course 1 slot weekday=1 (Monday)');
assert(context.window.SEED.courses[0].slots[0].p[0] === 1 && context.window.SEED.courses[0].slots[0].p[1] === 2, 'Course 1 periods [1,2]');
assert(context.window.SEED.courses[1].slots.length === 0, 'Course 2 has no slots (online)');
assert(context.window.SEED.courses[3].slots.length === 3, 'Course 4 has 3 time slots');

// Test dates functions
console.log('\nDate utilities:');
const today = context.window.todayStr();
assert(typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today), 'todayStr returns YYYY-MM-DD');

assert(context.window.weekdayIndex('2026-09-25') === 5, '2026-09-25 is Friday (5)');
assert(context.window.weekdayIndex('2026-09-21') === 1, '2026-09-21 is Monday (1)');
assert(context.window.weekdayIndex('2026-09-27') === 7, '2026-09-27 is Sunday (7)');

assert(context.window.currentWeek('2026-09-25') === 3, '2026-09-25 is week 3');
assert(context.window.currentWeek('2026-09-07') === 1, '2026-09-07 is week 1');
assert(context.window.currentWeek('2026-09-14') === 2, '2026-09-14 is week 2');

assert(context.window.weekMondayDate(1) === '2026-09-07', 'Week 1 Monday');
assert(context.window.weekMondayDate(3) === '2026-09-21', 'Week 3 Monday');
assert(context.window.weekMondayDate(19) === '2027-01-11', 'Week 19 Monday');

assert(context.window.weekRangeText(3) === '09-21 ~ 09-27', 'Week 3 range');

assert(context.window.slotTimeText({ p: [1, 2] }) === '08:00-09:35', 'Periods 1-2 time');
assert(context.window.slotTimeText({ p: [2, 5] }) === '08:50-12:15', 'Periods 2-5 time');
assert(context.window.slotTimeText({ p: [8, 10] }) === '15:50-18:15', 'Periods 8-10 time');

assert(context.window.fmtCN('2026-09-25') === '2026-09-25 星期五', 'fmtCN Friday');
assert(context.window.fmtCN('2026-09-21') === '2026-09-21 星期一', 'fmtCN Monday');

assert(context.window.addDays('2026-09-25', 3) === '2026-09-28', 'addDays +3');
assert(context.window.addDays('2026-09-25', -5) === '2026-09-20', 'addDays -5');

assert(context.window.inWeeks([1, 9], 5) === true, 'inWeeks 5 in [1,9]');
assert(context.window.inWeeks([1, 9], 10) === false, 'inWeeks 10 not in [1,9]');
assert(context.window.inWeeks([6, 11], 6) === true, 'inWeeks 6 in [6,11]');

// Test store functions
console.log('\nStore operations:');
context.window.load();
assert(context.window.getState() !== null, 'load() initializes state');
assert(context.window.getState().meta.term === '2026—2027学年 第一学期', 'State meta.term after load');
assert(context.window.getState().todos.length === 0, 'Initial todos empty');

const id1 = context.window.addTodo({ title: 'Test 1', date: '2026-09-25', time: '14:00' });
assert(typeof id1 === 'string' && id1.length > 0, 'addTodo returns id');
assert(context.window.getState().todos.length === 1, 'todos has 1 item');
assert(context.window.getState().todos[0].title === 'Test 1', 'Todo title saved');

const id2 = context.window.addTodo({ title: 'Test 2', date: '2026-09-26', priority: '高' });
assert(context.window.getState().todos.length === 2, 'todos has 2 items');

context.window.toggleDone(id1, '2026-09-25');
assert(context.window.isDone(context.window.getState().todos[0], '2026-09-25'), 'toggleDone marks done');

context.window.toggleDone(id1, '2026-09-25');
assert(!context.window.isDone(context.window.getState().todos[0], '2026-09-25'), 'toggleDone toggles back');

context.window.updateTodo(id1, { title: 'Updated' });
assert(context.window.getState().todos[0].title === 'Updated', 'updateTodo changes title');

context.window.deleteTodo(id1);
assert(context.window.getState().todos.length === 1, 'deleteTodo removes item');
assert(context.window.getState().todos[0].id === id2, 'Correct todo remains');

context.window.setPeriod(1, '08:10', '08:55');
assert(context.window.getState().periods[0].start === '08:10', 'setPeriod updates start');
assert(context.window.getState().periods[0].end === '08:55', 'setPeriod updates end');

context.window.resetAll();
assert(context.window.getState().todos.length === 0, 'resetAll clears todos');
assert(context.window.getState().periods[0].start === '08:00', 'resetAll restores seed periods');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
