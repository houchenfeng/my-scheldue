(function(global) {
  'use strict';
  
  function init() {
    global.load();
    global.initUI();
    if (global.startTicker) global.startTicker();
    if (global.requestNotificationPermission) global.requestNotificationPermission();
  }
  
  global.init = init;
})(typeof window !== 'undefined' ? window : globalThis);

// Auto-init when DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', globalThis.init);
  } else {
    globalThis.init();
  }
}
