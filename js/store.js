(function(global) {
  'use strict';
  
  const KEY = 'my-schedule.v1';
  let S = null;
  
  function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        S = JSON.parse(raw);
      } catch (e) {
        S = cloneSeed();
      }
    } else {
      S = cloneSeed();
    }
    return S;
  }
  
  function save() {
    localStorage.setItem(KEY, JSON.stringify(S));
  }
  
  function cloneSeed() {
    return {
      meta: JSON.parse(JSON.stringify(global.SEED.meta)),
      periods: JSON.parse(JSON.stringify(global.SEED.periods)),
      courses: JSON.parse(JSON.stringify(global.SEED.courses)),
      todos: []
    };
  }
  
  function resetAll() {
    S = cloneSeed();
    save();
  }
  
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }
  
  function addTodo(fields) {
    const todo = {
      id: uid(),
      title: fields.title,
      date: fields.date,
      time: fields.time || null,
      loc: fields.loc || '',
      priority: fields.priority || '中',
      remind: fields.remind || { on: true, before: 15 },
      repeat: fields.repeat || 'none',
      note: fields.note || '',
      doneDates: [],
      createdAt: new Date().toISOString()
    };
    S.todos.push(todo);
    save();
    return todo.id;
  }
  
  function updateTodo(id, fields) {
    const todo = S.todos.find(t => t.id === id);
    if (!todo) return false;
    Object.assign(todo, fields);
    save();
    return true;
  }
  
  function deleteTodo(id) {
    const idx = S.todos.findIndex(t => t.id === id);
    if (idx === -1) return false;
    S.todos.splice(idx, 1);
    save();
    return true;
  }
  
  function toggleDone(id, dateStr) {
    const todo = S.todos.find(t => t.id === id);
    if (!todo) return false;
    const idx = todo.doneDates.indexOf(dateStr);
    if (idx === -1) {
      todo.doneDates.push(dateStr);
    } else {
      todo.doneDates.splice(idx, 1);
    }
    save();
    return true;
  }
  
  function isDone(todo, dateStr) {
    return todo.doneDates.indexOf(dateStr) !== -1;
  }
  
  function setPeriod(n, start, end) {
    const period = S.periods.find(p => p.n === n);
    if (!period) return false;
    period.start = start;
    period.end = end;
    save();
    return true;
  }
  
  function getState() {
    return S;
  }
  
  function exportBackup() {
    const data = JSON.stringify(S, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-schedule-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  function importBackup(file, cb) {
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.meta || !data.periods || !data.courses || !Array.isArray(data.todos)) {
          cb(new Error('Invalid backup file'));
          return;
        }
        S = data;
        save();
        cb(null);
      } catch (err) {
        cb(err);
      }
    };
    reader.onerror = function() {
      cb(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  }
  
  global.load = load;
  global.save = save;
  global.resetAll = resetAll;
  global.uid = uid;
  global.addTodo = addTodo;
  global.updateTodo = updateTodo;
  global.deleteTodo = deleteTodo;
  global.toggleDone = toggleDone;
  global.isDone = isDone;
  global.setPeriod = setPeriod;
  global.getState = getState;
  global.exportBackup = exportBackup;
  global.importBackup = importBackup;
})(typeof window !== 'undefined' ? window : globalThis);
