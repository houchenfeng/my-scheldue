(function(global) {
  'use strict';

  const PRIORITY_COLORS = {
    '高': 'var(--priority-high)',
    '中': 'var(--priority-medium)',
    '低': 'var(--priority-low)'
  };

  const REPEAT_OPTIONS = [
    { value: 'none', label: '不重复' },
    { value: 'daily', label: '每天' },
    { value: 'weekdays', label: '工作日(周一至周五)' },
    { value: 'weekly', label: '每周' }
  ];

  const REMIND_OPTIONS = [5, 10, 15, 30, 60];

  let filterDate = null;

  function setFilterDate(d) {
    filterDate = d;
  }

  function getFilterDate() {
    return filterDate || global.todayStr();
  }

  function getTodosForDate(dateStr) {
    const S = global.getState();
    if (!S) return [];
    const wd = global.weekdayIndex(dateStr);
    return S.todos.filter(todo => {
      if (todo.date === dateStr) return true;
      if (todo.repeat === 'daily') return true;
      if (todo.repeat === 'weekdays' && wd >= 1 && wd <= 5) return true;
      if (todo.repeat === 'weekly') {
        const todoDate = global.parseDate(todo.date);
        const targetDate = global.parseDate(dateStr);
        if (todoDate.getDay() === targetDate.getDay() && dateStr >= todo.date) return true;
      }
      return false;
    });
  }

  function todoHTML(todo, dateStr) {
    const done = global.isDone(todo, dateStr);
    const color = PRIORITY_COLORS[todo.priority] || PRIORITY_COLORS['中'];
    const timeText = todo.time || '全天';
    const doneClass = done ? 'todo-done' : '';

    let html = `<div class="todo-item ${doneClass}" data-id="${todo.id}">`;
    html += `<button class="todo-check" data-id="${todo.id}" data-done="${done ? '1' : '0'}">`;
    html += done ? '✓' : '';
    html += `</button>`;
    html += `<div class="todo-content">`;
    html += `<div class="todo-title"><span class="todo-priority" style="background:${color}"></span>${todo.title}</div>`;
    html += `<div class="todo-meta">${timeText}`;
    if (todo.loc) html += ` · ${todo.loc}`;
    if (todo.repeat !== 'none') {
      const rLabel = REPEAT_OPTIONS.find(r => r.value === todo.repeat);
      if (rLabel) html += ` · 🔁 ${rLabel.label}`;
    }
    html += `</div></div>`;
    html += `<div class="todo-actions">`;
    html += `<button class="todo-edit" data-id="${todo.id}">✎</button>`;
    html += `<button class="todo-delete" data-id="${todo.id}">×</button>`;
    html += `</div></div>`;
    return html;
  }

  function renderTodos() {
    const page = document.getElementById('page-todos');
    if (!page) return;

    const dateStr = getFilterDate();
    const todos = getTodosForDate(dateStr);
    const dateLabel = global.fmtCN(dateStr);

    let html = '<div class="card">';
    html += '<div class="card-title">';
    html += `<span>日程活动</span>`;
    html += `<button class="btn btn-primary" id="todo-add-btn">+ 新建</button>`;
    html += '</div>';

    html += '<div class="todo-date-bar">';
    html += `<button class="btn btn-secondary todo-date-prev" id="todo-date-prev">&lt;</button>`;
    html += `<span class="todo-date-label">${dateLabel}</span>`;
    html += `<button class="btn btn-secondary todo-date-next" id="todo-date-next">&gt;</button>`;
    html += `<button class="btn btn-secondary todo-date-today" id="todo-date-today">今天</button>`;
    html += '</div>';

    if (todos.length === 0) {
      html += '<div class="todo-empty">暂无日程活动</div>';
    } else {
      html += '<div class="todo-list">';
      todos.forEach(t => { html += todoHTML(t, dateStr); });
      html += '</div>';
    }

    html += '</div>';
    page.innerHTML = html;

    const addBtn = document.getElementById('todo-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => openTodoModal(null, dateStr));

    const prevBtn = document.getElementById('todo-date-prev');
    const nextBtn = document.getElementById('todo-date-next');
    const todayBtn = document.getElementById('todo-date-today');
    if (prevBtn) prevBtn.addEventListener('click', () => {
      const d = global.addDays(getFilterDate(), -1);
      setFilterDate(d);
      renderTodos();
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
      const d = global.addDays(getFilterDate(), 1);
      setFilterDate(d);
      renderTodos();
    });
    if (todayBtn) todayBtn.addEventListener('click', () => {
      setFilterDate(global.todayStr());
      renderTodos();
    });

    page.querySelectorAll('.todo-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const done = btn.dataset.done === '1';
        if (done) {
          global.toggleDone(id, dateStr);
        } else {
          global.toggleDone(id, dateStr);
        }
        renderTodos();
      });
    });

    page.querySelectorAll('.todo-edit').forEach(btn => {
      btn.addEventListener('click', () => openTodoModal(btn.dataset.id, dateStr));
    });

    page.querySelectorAll('.todo-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        openConfirmModal('确定删除这个活动吗？', () => {
          global.deleteTodo(btn.dataset.id);
          renderTodos();
        });
      });
    });
  }

  function openTodoModal(todoId, dateStr) {
    const root = document.getElementById('modal-root');
    if (!root) return;

    let todo = null;
    if (todoId) {
      const S = global.getState();
      todo = S.todos.find(t => t.id === todoId);
    }

    const isEdit = !!todo;
    const title = isEdit ? '编辑活动' : '新建活动';
    const curDate = todo ? todo.date : (dateStr || global.todayStr());
    const curTime = todo ? (todo.time || '') : '';
    const curLoc = todo ? (todo.loc || '') : '';
    const curPriority = todo ? todo.priority : '中';
    const curRemindOn = todo ? todo.remind.on : true;
    const curRemindBefore = todo ? todo.remind.before : 15;
    const curRepeat = todo ? todo.repeat : 'none';
    const curNote = todo ? (todo.note || '') : '';

    let html = `<div class="modal">`;
    html += `<div class="modal-title">${title}</div>`;
    html += `<div class="form-group"><label>标题 *</label><input id="f-title" type="text" value="${escHTML(curTitle(todo))}" placeholder="活动名称"></div>`;
    html += `<div class="form-group"><label>日期 *</label><input id="f-date" type="date" value="${curDate}"></div>`;
    html += `<div class="form-group"><label>时间</label><input id="f-time" type="time" value="${curTime}"><div class="form-hint">留空表示全天</div></div>`;
    html += `<div class="form-group"><label>地点</label><input id="f-loc" type="text" value="${escHTML(curLoc)}" placeholder="可选"></div>`;
    html += `<div class="form-group"><label>优先级</label><select id="f-priority">`;
    ['高', '中', '低'].forEach(p => {
      html += `<option value="${p}" ${p === curPriority ? 'selected' : ''}>${p}</option>`;
    });
    html += `</select></div>`;
    html += `<div class="form-group"><label>提醒</label><div class="form-row">`;
    html += `<label class="form-check"><input id="f-remind-on" type="checkbox" ${curRemindOn ? 'checked' : ''}> 开启</label>`;
    html += `<select id="f-remind-before">`;
    REMIND_OPTIONS.forEach(m => {
      html += `<option value="${m}" ${m === curRemindBefore ? 'selected' : ''}>${m} 分钟前</option>`;
    });
    html += `</select></div></div>`;
    html += `<div class="form-group"><label>重复</label><select id="f-repeat">`;
    REPEAT_OPTIONS.forEach(r => {
      html += `<option value="${r.value}" ${r.value === curRepeat ? 'selected' : ''}>${r.label}</option>`;
    });
    html += `</select></div>`;
    html += `<div class="form-group"><label>备注</label><textarea id="f-note" rows="2" placeholder="可选">${escHTML(curNote)}</textarea></div>`;
    html += `<div id="form-error" class="form-error"></div>`;
    html += `<div class="modal-actions">`;
    html += `<button class="btn btn-secondary" id="modal-cancel">取消</button>`;
    html += `<button class="btn btn-primary" id="modal-save">保存</button>`;
    html += `</div></div>`;

    root.innerHTML = html;
    root.classList.add('visible');

    const cancelBtn = document.getElementById('modal-cancel');
    const saveBtn = document.getElementById('modal-save');
    const errorEl = document.getElementById('form-error');

    cancelBtn.addEventListener('click', () => closeModal());

    saveBtn.addEventListener('click', () => {
      const fTitle = document.getElementById('f-title').value.trim();
      const fDate = document.getElementById('f-date').value;
      const fTime = document.getElementById('f-time').value || null;
      const fLoc = document.getElementById('f-loc').value.trim();
      const fPriority = document.getElementById('f-priority').value;
      const fRemindOn = document.getElementById('f-remind-on').checked;
      const fRemindBefore = parseInt(document.getElementById('f-remind-before').value);
      const fRepeat = document.getElementById('f-repeat').value;
      const fNote = document.getElementById('f-note').value.trim();

      if (!fTitle) {
        errorEl.textContent = '请输入标题';
        return;
      }
      if (!fDate) {
        errorEl.textContent = '请选择日期';
        return;
      }

      const fields = {
        title: fTitle,
        date: fDate,
        time: fTime,
        loc: fLoc,
        priority: fPriority,
        remind: { on: fRemindOn, before: fRemindBefore },
        repeat: fRepeat,
        note: fNote
      };

      if (isEdit) {
        global.updateTodo(todoId, fields);
      } else {
        global.addTodo(fields);
      }

      closeModal();
      renderTodos();
    });

    root.addEventListener('click', (e) => {
      if (e.target === root) closeModal();
    });
  }

  function curTitle(todo) {
    return todo ? (todo.title || '') : '';
  }

  function escHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) {
      root.classList.remove('visible');
      root.innerHTML = '';
    }
  }

  function openConfirmModal(message, onConfirm) {
    const root = document.getElementById('modal-root');
    if (!root) return;

    let html = `<div class="modal">`;
    html += `<div class="modal-title">确认</div>`;
    html += `<div class="confirm-message">${escHTML(message)}</div>`;
    html += `<div class="modal-actions">`;
    html += `<button class="btn btn-secondary" id="confirm-cancel">取消</button>`;
    html += `<button class="btn btn-danger" id="confirm-ok">确定</button>`;
    html += `</div></div>`;

    root.innerHTML = html;
    root.classList.add('visible');

    const cancelBtn = document.getElementById('confirm-cancel');
    const okBtn = document.getElementById('confirm-ok');

    cancelBtn.addEventListener('click', () => closeModal());
    okBtn.addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });

    root.addEventListener('click', (e) => {
      if (e.target === root) closeModal();
    });
  }

  global.setFilterDate = setFilterDate;
  global.getFilterDate = getFilterDate;
  global.getTodosForDate = getTodosForDate;
  global.renderTodos = renderTodos;
  global.openTodoModal = openTodoModal;
  global.openConfirmModal = openConfirmModal;
  global.closeModal = closeModal;
  global.todoHTML = todoHTML;
})(typeof window !== 'undefined' ? window : globalThis);
