const vm = require('vm');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function loadInContext() {
  const store = {};
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
    const children = [];
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
      _children: children,
      _listeners: {},
      setAttribute(k, v) { el[k] = v; },
      getAttribute(k) { return el[k] || null; },
      addEventListener(ev, fn) {
        if (!el._listeners[ev]) el._listeners[ev] = [];
        el._listeners[ev].push(fn);
      },
      appendChild(child) { children.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      click() {}
    };
    if (id) mockElements[id] = el;
    return el;
  }

  const pageTodos = makeEl('section', 'page-todos');
  const modalRoot = makeEl('div', 'modal-root');

  // Track innerHTML for pageTodos
  Object.defineProperty(pageTodos, 'innerHTML', {
    get() { return this._innerHTML || ''; },
    set(v) {
      this._innerHTML = v;
      // Parse todo items
      const items = [];
      const itemRe = /class="todo-item([^"]*)"[^>]*data-id="([^"]*)"/g;
      let m;
      while ((m = itemRe.exec(v)) !== null) {
        const iel = makeEl('div');
        iel.dataset.id = m[2];
        iel._isDone = m[1].includes('todo-done');
        items.push(iel);
      }
      this._todoItems = items;

      // Parse check buttons
      const checks = [];
      const checkRe = /class="todo-check"[^>]*data-id="([^"]*)"[^>]*data-done="(\d)"/g;
      while ((m = checkRe.exec(v)) !== null) {
        const cel = makeEl('button');
        cel.dataset.id = m[1];
        cel.dataset.done = m[2];
        cel._listeners = {};
        cel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        checks.push(cel);
      }
      this._checkBtns = checks;

      // Parse edit buttons
      const edits = [];
      const editRe = /class="todo-edit"[^>]*data-id="([^"]*)"/g;
      while ((m = editRe.exec(v)) !== null) {
        const eel = makeEl('button');
        eel.dataset.id = m[1];
        eel._listeners = {};
        eel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        edits.push(eel);
      }
      this._editBtns = edits;

      // Parse delete buttons
      const dels = [];
      const delRe = /class="todo-delete"[^>]*data-id="([^"]*)"/g;
      while ((m = delRe.exec(v)) !== null) {
        const del = makeEl('button');
        del.dataset.id = m[1];
        del._listeners = {};
        del.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        dels.push(del);
      }
      this._delBtns = dels;

      // Parse nav buttons
      const btns = {};
      ['todo-add-btn', 'todo-date-prev', 'todo-date-next', 'todo-date-today'].forEach(id => {
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
    }
  });

  Object.defineProperty(pageTodos, 'querySelectorAll', {
    value: function(sel) {
      if (sel === '.todo-check') return this._checkBtns || [];
      if (sel === '.todo-edit') return this._editBtns || [];
      if (sel === '.todo-delete') return this._delBtns || [];
      if (sel === '.todo-item') return this._todoItems || [];
      return [];
    }
  });

  // Modal root
  let modalVisible = false;
  modalRoot.classList = {
    add(cls) { if (cls === 'visible') modalVisible = true; },
    remove(cls) { if (cls === 'visible') modalVisible = false; },
    toggle(cls) { if (cls === 'visible') modalVisible = !modalVisible; }
  };

  Object.defineProperty(modalRoot, '_isVisible', {
    get() { return modalVisible; }
  });

  Object.defineProperty(modalRoot, 'innerHTML', {
    get() { return this._modalHTML || ''; },
    set(v) {
      this._modalHTML = v;
      // Parse form elements
      const inputs = {};
      const inputRe = /id="(f-[^"]*)"[^>]*type="([^"]*)"[^>]*value="([^"]*)"/g;
      let m;
      while ((m = inputRe.exec(v)) !== null) {
        const iel = makeEl('input', m[1]);
        iel.type = m[2];
        iel.value = m[3];
        iel._listeners = {};
        iel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        inputs[m[1]] = iel;
      }
      // checkboxes
      const cbRe = /id="(f-remind-on)"[^>]*type="checkbox"([^>]*)(checked)?/g;
      while ((m = cbRe.exec(v)) !== null) {
        const cel = makeEl('input', m[1]);
        cel.type = 'checkbox';
        cel.checked = !!m[3];
        cel._listeners = {};
        cel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        inputs[m[1]] = cel;
      }
      // selects
      const selectRe = /id="(f-[^"]*)"[^>]*>[\s\S]*?<\/select>/g;
      while ((m = selectRe.exec(v)) !== null) {
        const sel = makeEl('select', m[1]);
        const selectedMatch = m[0].match(/option value="([^"]*)"[^>]*selected/);
        sel.value = selectedMatch ? selectedMatch[1] : '';
        sel._listeners = {};
        sel.addEventListener = function(ev, fn) {
          if (!this._listeners[ev]) this._listeners[ev] = [];
          this._listeners[ev].push(fn);
        };
        inputs[m[1]] = sel;
      }
      // textarea
      const taRe = /id="(f-note)"[^>]*>([\s\S]*?)<\/textarea>/g;
      while ((m = taRe.exec(v)) !== null) {
        const tel = makeEl('textarea', m[1]);
        tel.value = m[2];
        inputs[m[1]] = tel;
      }
      this._inputs = inputs;

      // Parse buttons
      const btns = {};
      ['modal-cancel', 'modal-save', 'confirm-cancel', 'confirm-ok'].forEach(id => {
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

      // error element
      const errEl = makeEl('div', 'form-error');
      this._errorEl = errEl;
    }
  });

  ctx.mockElements = mockElements;
  ctx.pageTodos = pageTodos;
  ctx.modalRoot = modalRoot;

  const doc = {
    getElementById(id) {
      if (id === 'page-todos') return pageTodos;
      if (id === 'modal-root') return modalRoot;
      if (id === 'page-home') return makeEl('section', 'page-home');
      if (id === 'page-timetable') return makeEl('section', 'page-timetable');
      return mockElements[id] || null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    body: makeEl('div', 'body'),
    addEventListener() {}
  };
  ctx.document = doc;

  vm.createContext(ctx);

  const files = ['js/seed.js', 'js/dates.js', 'js/store.js', 'js/ui.js', 'js/page-timetable.js', 'js/page-todos.js'];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  // Initialize store
  ctx.load();

  return { ctx, mockElements, pageTodos, modalRoot, store };
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

console.log('P4 Tests: Schedule Activities Page\n');

// Test 1: addTodo creates a todo
{
  const { ctx } = loadInContext();
  test('addTodo creates a todo in state', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const S = ctx.getState();
    assert.strictEqual(S.todos.length, 1);
    assert.strictEqual(S.todos[0].title, 'Test');
    assert.strictEqual(S.todos[0].date, '2026-09-25');
  });
}

// Test 2: addTodo sets defaults
{
  const { ctx } = loadInContext();
  test('addTodo sets default priority, remind, repeat', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const S = ctx.getState();
    assert.strictEqual(S.todos[0].priority, '中');
    assert.strictEqual(S.todos[0].remind.on, true);
    assert.strictEqual(S.todos[0].remind.before, 15);
    assert.strictEqual(S.todos[0].repeat, 'none');
  });
}

// Test 3: updateTodo modifies existing todo
{
  const { ctx } = loadInContext();
  test('updateTodo changes title', () => {
    const id = ctx.addTodo({ title: 'Old', date: '2026-09-25' });
    ctx.updateTodo(id, { title: 'New' });
    const S = ctx.getState();
    assert.strictEqual(S.todos[0].title, 'New');
  });
}

// Test 4: deleteTodo removes todo
{
  const { ctx } = loadInContext();
  test('deleteTodo removes the todo', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.deleteTodo(id);
    const S = ctx.getState();
    assert.strictEqual(S.todos.length, 0);
  });
}

// Test 5: toggleDone marks done
{
  const { ctx } = loadInContext();
  test('toggleDone adds date to doneDates', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.toggleDone(id, '2026-09-25');
    const S = ctx.getState();
    assert.ok(S.todos[0].doneDates.includes('2026-09-25'));
  });
}

// Test 6: toggleDone toggles off
{
  const { ctx } = loadInContext();
  test('toggleDone removes date if already done', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.toggleDone(id, '2026-09-25');
    ctx.toggleDone(id, '2026-09-25');
    const S = ctx.getState();
    assert.ok(!S.todos[0].doneDates.includes('2026-09-25'));
  });
}

// Test 7: isDone returns correct value
{
  const { ctx } = loadInContext();
  test('isDone returns true after toggleDone', () => {
    const id = ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    ctx.toggleDone(id, '2026-09-25');
    assert.strictEqual(ctx.isDone(ctx.getState().todos[0], '2026-09-25'), true);
  });
}

// Test 8: getTodosForDate returns todos for exact date
{
  const { ctx } = loadInContext();
  test('getTodosForDate returns todo on its date', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const todos = ctx.getTodosForDate('2026-09-25');
    assert.strictEqual(todos.length, 1);
  });
}

// Test 9: getTodosForDate does not return todo on different date (no repeat)
{
  const { ctx } = loadInContext();
  test('getTodosForDate excludes non-repeating todo on other date', () => {
    ctx.addTodo({ title: 'Test', date: '2026-09-25' });
    const todos = ctx.getTodosForDate('2026-09-26');
    assert.strictEqual(todos.length, 0);
  });
}

// Test 10: daily repeat shows every day
{
  const { ctx } = loadInContext();
  test('daily repeat todo appears on any date after creation', () => {
    ctx.addTodo({ title: 'Daily', date: '2026-09-25', repeat: 'daily' });
    assert.strictEqual(ctx.getTodosForDate('2026-09-26').length, 1);
    assert.strictEqual(ctx.getTodosForDate('2026-10-01').length, 1);
  });
}

// Test 11: weekdays repeat shows on Monday
{
  const { ctx } = loadInContext();
  test('weekdays repeat shows on Monday (2026-09-28)', () => {
    ctx.addTodo({ title: 'Weekday', date: '2026-09-25', repeat: 'weekdays' });
    // 2026-09-28 is Monday
    const todos = ctx.getTodosForDate('2026-09-28');
    assert.strictEqual(todos.length, 1);
  });
}

// Test 12: weekdays repeat does not show on Sunday
{
  const { ctx } = loadInContext();
  test('weekdays repeat does not show on Sunday (2026-09-27)', () => {
    ctx.addTodo({ title: 'Weekday', date: '2026-09-25', repeat: 'weekdays' });
    // 2026-09-27 is Sunday
    const todos = ctx.getTodosForDate('2026-09-27');
    assert.strictEqual(todos.length, 0);
  });
}

// Test 13: renderTodos shows empty state
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos shows empty state when no todos', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.ok(pageTodos.innerHTML.includes('暂无日程活动'));
  });
}

// Test 14: renderTodos shows todo item
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos shows added todo', () => {
    ctx.addTodo({ title: 'Meeting', date: '2026-09-25' });
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.ok(pageTodos.innerHTML.includes('Meeting'));
  });
}

// Test 15: renderTodos shows date label
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos shows date label', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.ok(pageTodos.innerHTML.includes('2026-09-25'));
  });
}

// Test 16: renderTodos has add button
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos has add button', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.ok(pageTodos._buttons['todo-add-btn']);
  });
}

// Test 17: renderTodos has date navigation buttons
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos has prev/next/today buttons', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.ok(pageTodos._buttons['todo-date-prev']);
    assert.ok(pageTodos._buttons['todo-date-next']);
    assert.ok(pageTodos._buttons['todo-date-today']);
  });
}

// Test 18: prev button changes date backward
{
  const { ctx, pageTodos } = loadInContext();
  test('prev date button changes date to previous day', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    const prevBtn = pageTodos._buttons['todo-date-prev'];
    prevBtn._listeners.click[0]();
    assert.strictEqual(ctx.getFilterDate(), '2026-09-24');
  });
}

// Test 19: next button changes date forward
{
  const { ctx, pageTodos } = loadInContext();
  test('next date button changes date to next day', () => {
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    const nextBtn = pageTodos._buttons['todo-date-next'];
    nextBtn._listeners.click[0]();
    assert.strictEqual(ctx.getFilterDate(), '2026-09-26');
  });
}

// Test 20: today button resets to today
{
  const { ctx, pageTodos } = loadInContext();
  test('today button resets filter to today', () => {
    ctx.setFilterDate('2026-01-01');
    ctx.renderTodos();
    const todayBtn = pageTodos._buttons['todo-date-today'];
    todayBtn._listeners.click[0]();
    assert.strictEqual(ctx.getFilterDate(), ctx.todayStr());
  });
}

// Test 21: openTodoModal shows form
{
  const { ctx, modalRoot } = loadInContext();
  test('openTodoModal shows create form', () => {
    ctx.openTodoModal(null, '2026-09-25');
    assert.ok(modalRoot._isVisible);
    assert.ok(modalRoot.innerHTML.includes('新建活动'));
    assert.ok(modalRoot.innerHTML.includes('f-title'));
    assert.ok(modalRoot.innerHTML.includes('f-date'));
  });
}

// Test 22: openTodoModal shows edit form with existing data
{
  const { ctx, modalRoot } = loadInContext();
  test('openTodoModal shows edit form with data', () => {
    const id = ctx.addTodo({ title: 'Edit Me', date: '2026-09-25', priority: '高' });
    ctx.openTodoModal(id, '2026-09-25');
    assert.ok(modalRoot.innerHTML.includes('编辑活动'));
    assert.ok(modalRoot.innerHTML.includes('Edit Me'));
  });
}

// Test 23: openConfirmModal shows message
{
  const { ctx, modalRoot } = loadInContext();
  test('openConfirmModal shows message', () => {
    ctx.openConfirmModal('Delete this?', () => {});
    assert.ok(modalRoot._isVisible);
    assert.ok(modalRoot.innerHTML.includes('Delete this?'));
    assert.ok(modalRoot.innerHTML.includes('confirm-ok'));
  });
}

// Test 24: confirm ok calls callback
{
  const { ctx, modalRoot } = loadInContext();
  test('confirm ok button calls callback', () => {
    let called = false;
    ctx.openConfirmModal('Sure?', () => { called = true; });
    const okBtn = modalRoot._buttons['confirm-ok'];
    okBtn._listeners.click[0]();
    assert.strictEqual(called, true);
  });
}

// Test 25: confirm cancel closes modal without callback
{
  const { ctx, modalRoot } = loadInContext();
  test('confirm cancel closes modal', () => {
    let called = false;
    ctx.openConfirmModal('Sure?', () => { called = true; });
    const cancelBtn = modalRoot._buttons['confirm-cancel'];
    cancelBtn._listeners.click[0]();
    assert.strictEqual(modalRoot._isVisible, false);
    assert.strictEqual(called, false);
  });
}

// Test 26: closeModal hides modal
{
  const { ctx, modalRoot } = loadInContext();
  test('closeModal hides modal', () => {
    ctx.openTodoModal(null, '2026-09-25');
    assert.ok(modalRoot._isVisible);
    ctx.closeModal();
    assert.strictEqual(modalRoot._isVisible, false);
  });
}

// Test 27: todoHTML includes priority color
{
  const { ctx } = loadInContext();
  test('todoHTML includes priority indicator', () => {
    const todo = { id: 'x', title: 'Test', date: '2026-09-25', priority: '高', time: '10:00', loc: '', repeat: 'none', note: '', doneDates: [] };
    const html = ctx.todoHTML(todo, '2026-09-25');
    assert.ok(html.includes('todo-priority'));
    assert.ok(html.includes('priority-high'));
  });
}

// Test 28: todoHTML marks done items
{
  const { ctx } = loadInContext();
  test('todoHTML adds todo-done class when done', () => {
    const todo = { id: 'x', title: 'Test', date: '2026-09-25', priority: '中', time: null, loc: '', repeat: 'none', note: '', doneDates: ['2026-09-25'] };
    const html = ctx.todoHTML(todo, '2026-09-25');
    assert.ok(html.includes('todo-done'));
  });
}

// Test 29: todoHTML shows repeat indicator
{
  const { ctx } = loadInContext();
  test('todoHTML shows repeat label for daily', () => {
    const todo = { id: 'x', title: 'Test', date: '2026-09-25', priority: '中', time: null, loc: '', repeat: 'daily', note: '', doneDates: [] };
    const html = ctx.todoHTML(todo, '2026-09-25');
    assert.ok(html.includes('每天'));
  });
}

// Test 30: renderTodos shows check buttons for each todo
{
  const { ctx, pageTodos } = loadInContext();
  test('renderTodos creates check buttons', () => {
    ctx.addTodo({ title: 'A', date: '2026-09-25' });
    ctx.addTodo({ title: 'B', date: '2026-09-25' });
    ctx.setFilterDate('2026-09-25');
    ctx.renderTodos();
    assert.strictEqual(pageTodos._checkBtns.length, 2);
  });
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
