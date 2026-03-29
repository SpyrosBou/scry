/**
 * Scry in-app mockup interactivity.
 * Handles sidebar tree nav, wizard, live run simulation, accordions, and dialogs.
 */
(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  // ── View switching ────────────────────────────────────────────────────
  function showView(id) {
    $$('[id^="view-"]').forEach(v => v.style.display = 'none');
    const target = document.getElementById(id);
    if (target) target.style.display = '';
  }

  // Expose for demo toggling via console: showView('view-empty-projects')
  window.showView = showView;

  // ── Sidebar tree navigation ───────────────────────────────────────────
  const tree = $('[role="tree"]');
  if (tree) {
    const items = $$('.sidebar-item', tree);

    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => {
          i.classList.remove('active');
          const li = i.closest('[role="treeitem"]');
          if (li) li.setAttribute('aria-selected', 'false');
        });
        item.classList.add('active');
        const li = item.closest('[role="treeitem"]');
        if (li) li.setAttribute('aria-selected', 'true');
      });
    });

    // Keyboard navigation (arrow keys)
    tree.addEventListener('keydown', (e) => {
      const focusable = items.filter(i => i.offsetParent !== null);
      const idx = focusable.indexOf(document.activeElement);
      if (idx === -1) return;

      let next = -1;
      switch (e.key) {
        case 'ArrowDown':
          next = Math.min(idx + 1, focusable.length - 1);
          break;
        case 'ArrowUp':
          next = Math.max(idx - 1, 0);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = focusable.length - 1;
          break;
        case 'Enter':
        case ' ':
          focusable[idx].click();
          e.preventDefault();
          return;
        default:
          return;
      }
      if (next >= 0) {
        e.preventDefault();
        focusable[next].focus();
      }
    });
  }

  // ── Wizard panel ──────────────────────────────────────────────────────
  const wizardScrim = $('#wizard-scrim');
  const wizardPanel = $('#wizard-panel');
  const step1 = $('#wizard-step-1');
  const step2 = $('#wizard-step-2');
  let wizardTrigger = null;

  function openWizard() {
    wizardTrigger = document.activeElement;
    wizardScrim && wizardScrim.classList.add('open');
    if (wizardPanel) {
      wizardPanel.classList.add('open');
      wizardPanel.removeAttribute('aria-hidden');
    }
    showWizardStep(1);
    // Focus the search input
    setTimeout(() => {
      const search = $('#wizard-search');
      if (search) search.focus();
    }, 300);
  }

  function closeWizard() {
    wizardScrim && wizardScrim.classList.remove('open');
    if (wizardPanel) {
      wizardPanel.classList.remove('open');
      wizardPanel.setAttribute('aria-hidden', 'true');
    }
    if (wizardTrigger) {
      setTimeout(() => wizardTrigger.focus(), 100);
    }
  }

  function showWizardStep(n) {
    if (step1) step1.style.display = n === 1 ? '' : 'none';
    if (step2) step2.style.display = n === 2 ? '' : 'none';
  }

  // Open wizard
  const btnRunAudit = $('#btn-run-audit');
  if (btnRunAudit) btnRunAudit.addEventListener('click', openWizard);

  const btnEmptyAdd = $('#btn-empty-add');
  if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', openWizard);

  // Close on scrim click
  if (wizardScrim) wizardScrim.addEventListener('click', closeWizard);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (wizardPanel && wizardPanel.classList.contains('open')) {
        closeWizard();
      }
      // Also close confirm dialog
      const cd = $('#confirm-cancel');
      if (cd && cd.classList.contains('open')) {
        cd.classList.remove('open');
        cd.setAttribute('aria-hidden', 'true');
      }
    }
  });

  // Site selection in wizard
  $$('.wizard-site-row').forEach(row => {
    row.addEventListener('click', () => {
      $$('.wizard-site-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      const nextBtn = $('#btn-wizard-next');
      if (nextBtn) nextBtn.disabled = false;
    });
  });

  // Wizard navigation
  const btnNext = $('#btn-wizard-next');
  if (btnNext) btnNext.addEventListener('click', () => showWizardStep(2));

  const btnBack = $('#btn-wizard-back');
  if (btnBack) btnBack.addEventListener('click', () => showWizardStep(1));

  // Suite toggles
  $$('.suite-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const pressed = toggle.getAttribute('aria-pressed') === 'true';
      toggle.setAttribute('aria-pressed', String(!pressed));
    });
  });

  // Select/Deselect all
  const btnSelectAll = $('#btn-select-all');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', (e) => {
      e.preventDefault();
      $$('.suite-toggle').forEach(t => t.setAttribute('aria-pressed', 'true'));
    });
  }

  const btnDeselectAll = $('#btn-deselect-all');
  if (btnDeselectAll) {
    btnDeselectAll.addEventListener('click', (e) => {
      e.preventDefault();
      $$('.suite-toggle').forEach(t => t.setAttribute('aria-pressed', 'false'));
    });
  }

  // ── Run audit (wizard → live run) ─────────────────────────────────────
  const btnWizardRun = $('#btn-wizard-run');
  if (btnWizardRun) {
    btnWizardRun.addEventListener('click', () => {
      closeWizard();
      showView('view-live-run');
      startRunSimulation();
    });
  }

  // ── Live run simulation ───────────────────────────────────────────────
  let runInterval = null;

  function startRunSimulation() {
    const fill = $('#progress-fill');
    const label = $('#progress-label');
    const bar = $('.progress-bar');
    const elapsed = $('#run-elapsed');

    // Set sidebar dot to running
    const activeDot = $('.sidebar-item.active .health-dot');
    if (activeDot) {
      activeDot.className = 'health-dot health-dot--running';
    }

    let progress = 0;
    let seconds = 0;
    const totalSteps = 100;

    // Simulation timeline (progress% → actions)
    const timeline = {
      5:  () => setSubIcon('sub-wcag', 'running'),
      15: () => { setSubIcon('sub-wcag', 'done'); setSubIcon('sub-keyboard', 'running'); updateSuiteProgress('a11y', '4/12'); setIcon('icon-a11y', 'running'); },
      25: () => { setSubIcon('sub-keyboard', 'done'); setSubIcon('sub-forms', 'running'); updateSuiteProgress('a11y', '8/12'); },
      35: () => { setSubIcon('sub-forms', 'done'); setSubIcon('sub-landmarks', 'running'); updateSuiteProgress('a11y', '10/12'); },
      42: () => { setSubIcon('sub-landmarks', 'done'); updateSuiteProgress('a11y', '12/12'); setIcon('icon-a11y', 'done'); setTime('time-a11y', '32s'); },
      45: () => { setSubIcon('sub-links', 'running'); setIcon('icon-func', 'running'); updateSuiteProgress('func', '2/12'); },
      55: () => { setSubIcon('sub-links', 'done'); setSubIcon('sub-smoke', 'running'); updateSuiteProgress('func', '6/12'); },
      65: () => { setSubIcon('sub-smoke', 'done'); setSubIcon('sub-infra', 'running'); updateSuiteProgress('func', '9/12'); },
      72: () => { setSubIcon('sub-infra', 'done'); updateSuiteProgress('func', '12/12'); setIcon('icon-func', 'done'); setTime('time-func', '24s'); },
      75: () => { setIcon('icon-resp', 'running'); updateSuiteProgress('resp', '4/12'); },
      85: () => { updateSuiteProgress('resp', '12/12'); setIcon('icon-resp', 'done'); setTime('time-resp', '18s'); },
      88: () => { setIcon('icon-visual', 'running'); updateSuiteProgress('visual', '6/12'); },
      96: () => { updateSuiteProgress('visual', '12/12'); setIcon('icon-visual', 'done'); setTime('time-visual', '12s'); },
    };

    runInterval = setInterval(() => {
      progress = Math.min(progress + 1, totalSteps);
      seconds++;

      if (fill) fill.style.width = progress + '%';
      if (label) label.textContent = progress + '%';
      if (bar) bar.setAttribute('aria-valuenow', progress);
      if (elapsed) elapsed.textContent = seconds + 's';

      if (timeline[progress]) timeline[progress]();

      if (progress >= 100) {
        clearInterval(runInterval);
        if (fill) fill.classList.add('progress-bar__fill--complete');

        // Restore sidebar dot
        if (activeDot) activeDot.className = 'health-dot health-dot--green';

        // Navigate to report after brief pause
        setTimeout(() => {
          window.location.href = 'report.html';
        }, 1500);
      }
    }, 100);
  }

  function setSubIcon(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    if (state === 'done') { el.textContent = '\u2713'; el.style.color = 'var(--status-green)'; }
    else if (state === 'running') { el.textContent = '\u25CF'; el.style.color = 'var(--gold)'; }
    else { el.textContent = '\u25CB'; el.style.color = ''; }
  }

  function setIcon(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    if (state === 'done') { el.innerHTML = '\u2713'; el.style.color = 'var(--status-green)'; }
    else if (state === 'running') { el.innerHTML = '<span class="health-dot health-dot--running" style="display:inline-block;width:10px;height:10px;"></span>'; }
    else { el.textContent = '\u25CB'; el.style.color = ''; }
  }

  function updateSuiteProgress(suite, text) {
    const el = document.getElementById('progress-' + suite);
    if (el) el.textContent = text + ' pages';
  }

  function setTime(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Show/hide log
  const btnShowLog = $('#btn-show-log');
  const logViewer = $('#log-viewer');
  if (btnShowLog && logViewer) {
    btnShowLog.addEventListener('click', () => {
      const open = logViewer.classList.toggle('open');
      btnShowLog.textContent = open ? 'Hide Log' : 'Show Log';
    });
  }

  // Cancel run
  const btnCancelRun = $('#btn-cancel-run');
  const confirmCancel = $('#confirm-cancel');
  if (btnCancelRun && confirmCancel) {
    btnCancelRun.addEventListener('click', () => {
      confirmCancel.classList.add('open');
      confirmCancel.removeAttribute('aria-hidden');
    });
  }

  const btnConfirmKeep = $('#btn-confirm-keep');
  if (btnConfirmKeep) {
    btnConfirmKeep.addEventListener('click', () => {
      confirmCancel.classList.remove('open');
      confirmCancel.setAttribute('aria-hidden', 'true');
    });
  }

  const btnConfirmCancel = $('#btn-confirm-cancel');
  if (btnConfirmCancel) {
    btnConfirmCancel.addEventListener('click', () => {
      confirmCancel.classList.remove('open');
      confirmCancel.setAttribute('aria-hidden', 'true');
      if (runInterval) clearInterval(runInterval);
      showView('view-dashboard');
      // Restore sidebar dot
      const activeDot = $('.sidebar-item.active .health-dot');
      if (activeDot) activeDot.className = 'health-dot health-dot--green';
    });
  }

  // ── Suite status accordions (live run) ────────────────────────────────
  $$('button[data-suite][aria-expanded]').forEach(header => {
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!expanded));
      const subtests = header.nextElementSibling;
      if (subtests) {
        subtests.style.display = expanded ? 'none' : '';
      }
    });
  });

  // ── Finding accordions (report detail) ────────────────────────────────
  $$('.finding-accordion__trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const expanded = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!expanded));
      const body = trigger.nextElementSibling;
      if (body && body.classList.contains('finding-accordion__body')) {
        body.style.display = expanded ? 'none' : '';
      }
      // Update URL hash
      const findingId = trigger.closest('.finding-accordion')?.id;
      if (findingId && !expanded) {
        history.replaceState(null, '', '#' + findingId);
      }
    });
  });

  // ── Findings section collapse/expand ──────────────────────────────────
  $$('.findings-section__header').forEach(header => {
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!expanded));
    });
  });

  // ── Settings: form toggle ─────────────────────────────────────────────
  $$('.form-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('active');
      enableSaveBtn();
    });
  });

  // ── Settings: save button enable on change ────────────────────────────
  function enableSaveBtn() {
    const btn = $('#btn-save-settings');
    if (btn) btn.disabled = false;
  }

  $$('.form-select, .form-input').forEach(el => {
    el.addEventListener('change', enableSaveBtn);
    el.addEventListener('input', enableSaveBtn);
  });

  // ── Onboarding step navigation ────────────────────────────────────────
  const onboardingSteps = $$('.onboarding__step-content');
  const stepDots = $$('.onboarding__step-dot');

  window.goToOnboardingStep = function (n) {
    onboardingSteps.forEach((s, i) => {
      s.style.display = i === n - 1 ? '' : 'none';
    });
    stepDots.forEach((d, i) => {
      d.classList.remove('active', 'done');
      if (i < n - 1) d.classList.add('done');
      if (i === n - 1) d.classList.add('active');
    });
  };

  // Simulated page discovery (onboarding step 2)
  window.simulateDiscovery = function () {
    const counter = $('#discovery-count');
    const btn = $('#btn-onboard-add-site');
    if (!counter || !btn) return;
    btn.disabled = true;
    btn.textContent = 'Discovering\u2026';
    let count = 0;
    const interval = setInterval(() => {
      count += Math.floor(Math.random() * 3) + 1;
      if (count > 12) count = 12;
      counter.textContent = count + ' pages found';
      if (count >= 12) {
        clearInterval(interval);
        btn.textContent = 'Continue';
        btn.disabled = false;
        btn.onclick = () => window.goToOnboardingStep(3);
      }
    }, 400);
  };

  // ── Init ──────────────────────────────────────────────────────────────
  showView('view-dashboard');

})();
