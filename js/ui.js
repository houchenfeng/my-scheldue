(function(global) {
  'use strict';
  
  const PAGES = ['home', 'timetable', 'todos'];
  const NAV_LABELS = { home: '首页', timetable: '课表', todos: '日程活动' };
  
  function navigate(hash) {
    if (!hash) hash = '#/home';
    if (location.hash !== hash) {
      location.hash = hash;
    }
    renderPage();
  }
  
  function onHashChange() {
    renderPage();
  }
  
  function renderPage() {
    const hash = location.hash || '#/home';
    const page = hash.slice(2) || 'home';
    if (!PAGES.includes(page)) {
      location.hash = '#/home';
      return;
    }
    setActiveNav(page);
    PAGES.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.style.display = (p === page) ? 'block' : 'none';
    });
    if (page === 'home' && global.renderHome) global.renderHome();
    if (page === 'timetable' && global.renderTimetable) global.renderTimetable();
    if (page === 'todos' && global.renderTodos) global.renderTodos();
  }
  
  function renderTopbar() {
    const S = global.getState();
    if (!S) return;
    const week = global.currentWeek(global.todayStr());
    const inRange = week >= 1 && week <= S.meta.totalWeeks;
    const weekText = inRange ? `第 ${week} 周` : '假期中';
    const today = global.fmtCN(global.todayStr());
    const el = document.getElementById('topbar-info');
    if (el) {
      el.textContent = `${S.meta.term} · ${weekText} · ${today}`;
    }
  }
  
  function setActiveNav(page) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.page === page);
    });
  }
  
  function buildNav() {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    nav.innerHTML = PAGES.map(p => 
      `<button class="nav-tab" data-page="${p}">${NAV_LABELS[p]}</button>`
    ).join('');
    nav.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => navigate('#/' + btn.dataset.page));
    });
  }
  
  function openSettingsModal() {
    const root = document.getElementById('modal-root');
    if (!root) return;

    const S = global.getState();
    if (!S) return;

    let html = '<div class="modal modal-settings">';
    html += '<div class="modal-title">设置</div>';

    html += '<div class="settings-section">';
    html += '<div class="settings-label">学期信息</div>';
    html += `<div class="settings-readonly">${S.meta.term} · 共 ${S.meta.totalWeeks} 周</div>`;
    html += '</div>';

    html += '<div class="settings-section">';
    html += '<div class="settings-label">节次时间</div>';
    html += '<div class="period-list">';
    S.periods.forEach(p => {
      html += `<div class="period-row">`;
      html += `<span class="period-num">第${p.n}节</span>`;
      html += `<input type="time" class="period-start" data-n="${p.n}" value="${p.start}">`;
      html += `<span>—</span>`;
      html += `<input type="time" class="period-end" data-n="${p.n}" value="${p.end}">`;
      html += `</div>`;
    });
    html += '</div></div>';

    html += '<div class="settings-section">';
    html += '<div class="settings-label">数据管理</div>';
    html += '<div class="settings-actions">';
    html += '<button class="btn btn-secondary" id="settings-export">导出备份</button>';
    html += '<button class="btn btn-secondary" id="settings-import">导入备份</button>';
    html += '<input type="file" id="settings-file" accept=".json" style="display:none">';
    html += '<button class="btn btn-danger" id="settings-clear">清空全部数据</button>';
    html += '</div></div>';

    html += '<div id="settings-msg" class="settings-msg"></div>';

    html += '<div class="modal-actions">';
    html += '<button class="btn btn-primary" id="settings-close">关闭</button>';
    html += '</div></div>';

    root.innerHTML = html;
    root.classList.add('visible');

    const closeBtn = document.getElementById('settings-close');
    closeBtn.addEventListener('click', () => closeModalUI());

    root.querySelectorAll('.period-start, .period-end').forEach(input => {
      input.addEventListener('change', () => {
        const n = parseInt(input.dataset.n);
        const row = input.closest('.period-row');
        const startInput = row.querySelector('.period-start');
        const endInput = row.querySelector('.period-end');
        global.setPeriod(n, startInput.value, endInput.value);
        if (global.renderTopbar) global.renderTopbar();
      });
    });

    const exportBtn = document.getElementById('settings-export');
    exportBtn.addEventListener('click', () => {
      global.exportBackup();
    });

    const importBtn = document.getElementById('settings-import');
    const fileInput = document.getElementById('settings-file');
    const msgEl = document.getElementById('settings-msg');

    importBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;

      global.openConfirmModal('导入将覆盖当前数据，确定继续吗？', () => {
        global.importBackup(file, (err) => {
          if (err) {
            msgEl.textContent = '导入失败: ' + err.message;
            msgEl.className = 'settings-msg error';
          } else {
            msgEl.textContent = '导入成功';
            msgEl.className = 'settings-msg success';
            closeModalUI();
            if (global.renderTopbar) global.renderTopbar();
            const hash = location.hash || '#/home';
            const page = hash.slice(2) || 'home';
            if (page === 'home' && global.renderHome) global.renderHome();
            if (page === 'timetable' && global.renderTimetable) global.renderTimetable();
            if (page === 'todos' && global.renderTodos) global.renderTodos();
          }
        });
      });
    });

    const clearBtn = document.getElementById('settings-clear');
    clearBtn.addEventListener('click', () => {
      global.openConfirmModal('确定清空全部数据？此操作不可恢复。', () => {
        global.resetAll();
        msgEl.textContent = '已清空，回到初始状态';
        msgEl.className = 'settings-msg success';
        closeModalUI();
        if (global.renderTopbar) global.renderTopbar();
        const hash = location.hash || '#/home';
        const page = hash.slice(2) || 'home';
        if (page === 'home' && global.renderHome) global.renderHome();
        if (page === 'timetable' && global.renderTimetable) global.renderTimetable();
        if (page === 'todos' && global.renderTodos) global.renderTodos();
      });
    });

    root.addEventListener('click', (e) => {
      if (e.target === root) closeModalUI();
    });
  }

  function closeModalUI() {
    const root = document.getElementById('modal-root');
    if (root) {
      root.classList.remove('visible');
      root.innerHTML = '';
    }
  }

  function initUI() {
    buildNav();
    window.addEventListener('hashchange', onHashChange);
    renderTopbar();
    renderPage();

    const settingsBtn = document.getElementById('topbar-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => openSettingsModal());
    }
  }
  
  global.navigate = navigate;
  global.onHashChange = onHashChange;
  global.renderTopbar = renderTopbar;
  global.setActiveNav = setActiveNav;
  global.openSettingsModal = openSettingsModal;
  global.closeModalUI = closeModalUI;
  global.initUI = initUI;
})(typeof window !== 'undefined' ? window : globalThis);
