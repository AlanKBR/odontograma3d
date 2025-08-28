// Visibility menu logic for the consolidated 2D chart only
// Expects window.setComponentTypeVisibility(type, isVisible) defined by app.js

const DEFAULTS = {
  dente: true,
  raiz: true,
  canal: false,
  nucleo: false,
  implante: false,
};

function applyAll() {
  const form = document.getElementById('visibility-form');
  if (!form || typeof window.setComponentTypeVisibility !== 'function') return;
  const inputs = form.querySelectorAll('input[type="checkbox"][data-type]');
  inputs.forEach((cb) => {
    const type = cb.getAttribute('data-type');
    window.setComponentTypeVisibility(type, cb.checked);
  });
}

function initVisibilityMenu() {
  const form = document.getElementById('visibility-form');
  if (!form) return;

  // Initialize states based on DEFAULTS (can be edited here)
  const inputs = form.querySelectorAll('input[type="checkbox"][data-type]');
  inputs.forEach((cb) => {
    const type = cb.getAttribute('data-type');
    if (type in DEFAULTS) cb.checked = !!DEFAULTS[type];
  });

  // Wire events
  form.addEventListener('change', (ev) => {
    const target = ev.target;
    if (target && target.matches('input[type="checkbox"][data-type]')) {
      const type = target.getAttribute('data-type');
      const isVisible = target.checked;
      if (typeof window.setComponentTypeVisibility === 'function') {
        window.setComponentTypeVisibility(type, isVisible);
      }
    }
  });

  // Provide a helper to reapply current state after chart rebuilds
  if (typeof window !== 'undefined') {
    window.ComponentVisibility = {
      apply: applyAll,
      set(type, isVisible) {
        const cb = form.querySelector(`input[data-type="${type}"]`);
        if (cb) {
          cb.checked = !!isVisible;
          applyAll();
        }
      },
      getState() {
        const state = {};
        const cbs = form.querySelectorAll('input[type="checkbox"][data-type]');
        cbs.forEach((cb) => { state[cb.getAttribute('data-type')] = cb.checked; });
        return state;
      },
    };
  }

  // Apply once now in case chart is ready; otherwise app.js will call apply() after build
  applyAll();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVisibilityMenu);
} else {
  initVisibilityMenu();
}
