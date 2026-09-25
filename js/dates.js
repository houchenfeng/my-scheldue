(function(global) {
  'use strict';
  
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  
  function weekdayIndex(dateStr) {
    const d = parseDate(dateStr);
    const w = d.getDay();
    return w === 0 ? 7 : w;
  }
  
  function currentWeek(dateStr) {
    const today = dateStr ? parseDate(dateStr) : new Date();
    const week1 = parseDate(global.SEED.meta.week1Monday);
    const diff = Math.floor((today - week1) / (1000 * 60 * 60 * 24));
    const week = Math.floor(diff / 7) + 1;
    return week;
  }
  
  function weekMondayDate(w) {
    const week1 = parseDate(global.SEED.meta.week1Monday);
    const d = new Date(week1);
    d.setDate(d.getDate() + (w - 1) * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  
  function weekRangeText(w) {
    const mon = parseDate(weekMondayDate(w));
    const sun = new Date(mon);
    sun.setDate(sun.getDate() + 6);
    const fmt = d => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${fmt(mon)} ~ ${fmt(sun)}`;
  }
  
  function slotTimeText(slot) {
    const [startP, endP] = slot.p;
    const startPeriod = global.SEED.periods.find(p => p.n === startP);
    const endPeriod = global.SEED.periods.find(p => p.n === endP);
    if (!startPeriod || !endPeriod) return '';
    return `${startPeriod.start}-${endPeriod.end}`;
  }
  
  function fmtCN(dateStr) {
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const d = parseDate(dateStr);
    const w = weekdays[d.getDay()];
    return `${dateStr} 星期${w}`;
  }
  
  function addDays(dateStr, n) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  
  function inWeeks(weeks, w) {
    const [start, end] = weeks;
    return w >= start && w <= end;
  }
  
  global.todayStr = todayStr;
  global.parseDate = parseDate;
  global.weekdayIndex = weekdayIndex;
  global.currentWeek = currentWeek;
  global.weekMondayDate = weekMondayDate;
  global.weekRangeText = weekRangeText;
  global.slotTimeText = slotTimeText;
  global.fmtCN = fmtCN;
  global.addDays = addDays;
  global.inWeeks = inWeeks;
})(typeof window !== 'undefined' ? window : globalThis);
