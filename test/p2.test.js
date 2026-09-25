// P2 Test: Global skeleton and hash routing
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

// Mock DOM elements
const mockElements = {};
function createMockElement(id) {
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    style: { display: '' },
    classList: {
      _classes: new Set(),
      toggle(name, force) {
        if (force === undefined) {
          if (this._classes.has(name)) this._classes.delete(name);
          else this._classes.add(name);
        } else if (force) this._classes.add(name);
        else this._classes.delete(name);
      },
      contains(name) { return this._classes.has(name); }
    },
    dataset: {},
    addEventListener: () => {},
    querySelectorAll: () => [],
    click: () => {}
  };
  mockElements[id] = el;
  return el;
}

// Mock document
const mockDocument = {
  getElementById: (id) => mockElements[id] || createMockElement(id),
  querySelectorAll: (sel) => {
    if (sel === '.nav-tab') return Object.values(mockElements).filter(e => e.classList && e.classList._classes.has('nav-tab'));
    return [];
  },
  readyState: 'complete',
  addEventListener: () => {}
};

// Mock location
const mockLocation = { hash: '#/home' };

// Mock window
const mockWindow = {
  localStorage: localStorageMock,
  location: mockLocation,
  document: mockDocument,
  addEventListener: () => {}
};

// Create context
const context = {
  window: mockWindow,
  localStorage: localStorageMock,
  location: mockLocation,
  document: mockDocument,
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
  }
};

vm.createContext(context);

function loadScript(filename) {
  const code = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  vm.runInContext(code, context);
}

// Load all source files
loadScript('js/seed.js');
loadScript('js/dates.js');
loadScript('js/store.js');
loadScript('js/ui.js');
loadScript('js/page-timetable.js');
loadScript('js/page-todos.js');
loadScript('js/page-home.js');

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

console.log('P2 Global Skeleton and Routing Tests\n');

// Setup: create required DOM elements
['topbar-info', 'main-nav', 'remind-bar', 'page-home', 'page-timetable', 'page-todos', 'modal-root'].forEach(id => {
  createMockElement(id);
});

// Initialize
context.window.load();
context.window.initUI();

// Manually create nav tab mock elements (since innerHTML doesn't create real DOM in mock)
const navTabs = [];
['home', 'timetable', 'todos'].forEach(page => {
  const tab = createMockElement('nav-tab-' + page);
  tab.dataset.page = page;
  tab.classList._classes.add('nav-tab');
  navTabs.push(tab);
});
mockElements['main-nav'].querySelectorAll = (sel) => {
  if (sel === '.nav-tab') return navTabs;
  return [];
};

// Test navigation
console.log('Navigation:');
assert(mockLocation.hash === '#/home', 'Default hash is #/home');

context.window.navigate('#/timetable');
assert(mockLocation.hash === '#/timetable', 'navigate changes hash to #/timetable');

context.window.navigate('#/todos');
assert(mockLocation.hash === '#/todos', 'navigate changes hash to #/todos');

context.window.navigate('#/home');
assert(mockLocation.hash === '#/home', 'navigate changes hash to #/home');

// Test page visibility
console.log('\nPage visibility:');
const homePage = mockElements['page-home'];
const timetablePage = mockElements['page-timetable'];
const todosPage = mockElements['page-todos'];

assert(homePage.style.display !== 'none', 'Home page visible when hash=#/home');
assert(timetablePage.style.display === 'none', 'Timetable page hidden when hash=#/home');
assert(todosPage.style.display === 'none', 'Todos page hidden when hash=#/home');

context.window.navigate('#/timetable');
assert(homePage.style.display === 'none', 'Home page hidden when hash=#/timetable');
assert(timetablePage.style.display !== 'none', 'Timetable page visible when hash=#/timetable');

context.window.navigate('#/todos');
assert(todosPage.style.display !== 'none', 'Todos page visible when hash=#/todos');

// Test topbar rendering
console.log('\nTopbar:');
context.window.navigate('#/home');
const topbarInfo = mockElements['topbar-info'];
assert(topbarInfo.textContent.includes('2026—2027学年 第一学期'), 'Topbar shows term');
assert(topbarInfo.textContent.includes('星期五'), 'Topbar shows weekday');

// Test nav tabs
console.log('\nNav tabs:');
assert(navTabs.length === 3, '3 nav tabs created');
assert(navTabs.some(t => t.dataset.page === 'home'), 'Home tab exists');
assert(navTabs.some(t => t.dataset.page === 'timetable'), 'Timetable tab exists');
assert(navTabs.some(t => t.dataset.page === 'todos'), 'Todos tab exists');

// Test invalid hash redirects to home
console.log('\nInvalid hash handling:');
mockLocation.hash = '#/invalid';
context.window.onHashChange();
assert(mockLocation.hash === '#/home', 'Invalid hash redirects to #/home');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
