(function () {
  let initialized = false;
  let trackedCache = new Map();
  let syncInterval = null;

  function log(...args) {
    console.log('[EmailTracker]', ...args);
  }

  function warn(...args) {
    console.warn('[EmailTracker]', ...args);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    log('Initializing content script');

    window.EmailTracker.ensureTrackerStyles();

    const mainObserver = new MutationObserver(() => {
      checkCompose();
      checkEmailRows();
    });
    mainObserver.observe(document.body, { childList: true, subtree: true, attributes: false });

    setTimeout(checkCompose, 1000);
    setTimeout(checkCompose, 3000);
    setTimeout(checkEmailRows, 2000);

    syncInterval = setInterval(syncTrackingStatus, 30000);
    setTimeout(syncTrackingStatus, 5000);
  }

  function queryGmail(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function queryGmailAll(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els && els.length > 0) return els;
      } catch (e) {}
    }
    return null;
  }

  const COMPOSE_AREA = [
    'div[role="textbox"][aria-label*="Message Body" i]',
    'div[role="textbox"][aria-label*="body" i]',
    'div[contenteditable="true"][aria-label*="Message Body" i]',
    'div[contenteditable="true"][aria-label*="body" i]',
    'div.editable[contenteditable="true"]',
    'div[g_editable="true"][role="textbox"]',
  ];

  const COMPOSE_DIALOG = [
    'div[role="dialog"][aria-label*="New Message" i]',
    'div[role="dialog"][aria-label*="Compose" i]',
    'div[role="dialog"][aria-label*="compose" i]',
    'div.AD.Cc',
    'div.aX2',
    'div.aeN',
  ];

  const SEND_BTN = [
    'div[role="button"][data-tooltip*="Send" i]',
    'div[role="button"][aria-label*="Send " i]',
    'div[role="button"][aria-label*="send" i]',
    'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3',
    'div[data-tooltip*="Send" i]',
    'div.aoO[tabindex="0"][role="button"]',
  ];

  const SUBJECT_FIELDS = [
    'input[name="subjectbox"]',
    'input.aoT[name="subjectbox"]',
    'input[aria-label*="Subject" i][name="subjectbox"]',
  ];

  const EMAIL_ROWS = [
    'tr.zA',
    'tr[data-hovercard-id]',
    'div[role="tab"]',
    'div[data-thread-id]',
  ];

  let composeCheckRunning = false;

  async function checkCompose() {
    if (composeCheckRunning) return;
    composeCheckRunning = true;

    try {
      let composeEl = queryGmail(COMPOSE_AREA);
      if (!composeEl) {
        const dialog = queryGmail(COMPOSE_DIALOG);
        if (dialog) {
          composeEl = dialog.querySelector('[contenteditable="true"][role="textbox"]') ||
                      dialog.querySelector('div[g_editable="true"]') ||
                      dialog.querySelector('[contenteditable="true"]');
        }
      }

      if (composeEl && !composeEl.dataset.etObserved) {
        composeEl.dataset.etObserved = '1';
        attachToCompose();
      }
    } finally {
      composeCheckRunning = false;
    }
  }

  function attachToCompose() {
    log('Compose window detected');

    const attachSend = () => {
      const btn = queryGmail(SEND_BTN);
      if (!btn || btn.dataset.etAttached) return false;
      btn.dataset.etAttached = '1';
      btn.addEventListener('mousedown', (e) => {
        handleSend();
      }, true);
      log('Attached to Send button');
      return true;
    };

    attachSend();

    const dialog = queryGmail(COMPOSE_DIALOG);
    if (dialog) {
      const btnObserver = new MutationObserver(() => {
        if (!queryGmail(SEND_BTN)?.dataset.etAttached) {
          attachSend();
        }
      });
      btnObserver.observe(dialog, { childList: true, subtree: true, attributes: true });
    }
  }

  function findComposeTextBox() {
    let el = queryGmail(COMPOSE_AREA);
    if (!el) {
      const dialog = queryGmail(COMPOSE_DIALOG);
      if (dialog) {
        el = dialog.querySelector('[contenteditable="true"][role="textbox"]') ||
             dialog.querySelector('div[g_editable="true"]') ||
             dialog.querySelector('[contenteditable="true"]');
      }
    }
    return el || null;
  }

  async function handleSend() {
    try {
      const composeEl = findComposeTextBox();
      if (!composeEl) log('Compose textbox not found (might still work)');

      const recipients = getRecipients(composeEl);
      if (recipients.length === 0) {
        warn('No recipients found');
        return;
      }

      const subject = getSubject();
      const trackingId = window.EmailTracker.generateId();
      log(`Sending tracked email "${subject}" to ${recipients.join(', ')} [ID: ${trackingId}]`);

      const sentAt = Date.now();

      if (composeEl) {
        window.EmailTracker.injectPixel(composeEl, trackingId, recipients);
        window.EmailTracker.rewriteLinks(composeEl, trackingId, recipients);
      }

      try {
        const api = window.EmailTrackerAPI;
        if (api) {
          api.registerEmail(trackingId, subject, recipients);
          log('Registered with server');
        }
      } catch (e) {
        warn('Server registration failed (non-critical):', e);
      }

      const storage = window.EmailTrackerStorage;
      if (storage) {
        await storage.saveEmail({
          trackingId,
          subject: subject || '(no subject)',
          recipients,
          sentAt,
          totalOpens: 0,
          uniqueOpens: 0,
          totalClicks: 0,
          status: 'pending',
        });
        log('Saved to local storage');
      }
    } catch (e) {
      warn('Error in handleSend:', e);
    }
  }

  const COMPOSE_SCOPE_SEL = [
    'div[role="dialog"]',
    'div.AD',
    'div.aX2',
    'div.aeN',
    'div[jscontroller]',
  ];

  function getComposeScope(composeEl) {
    if (!composeEl) return document;
    for (const sel of COMPOSE_SCOPE_SEL) {
      const dlg = composeEl.closest(sel);
      if (dlg) return dlg;
    }
    let el = composeEl.parentElement;
    for (let i = 0; i < 15 && el; i++) {
      if (el.classList?.contains('AD') || el.classList?.contains('aX2') || el.hasAttribute?.('role') === 'dialog') return el;
      el = el.parentElement;
    }
    return document;
  }

  function getRecipients(composeEl) {
    const scope = getComposeScope(composeEl);
    const set = new Set();

    const chips = scope.querySelectorAll('span[email]');
    log(`Scope: ${scope === document ? 'DOCUMENT (fallback)' : scope.tagName + (scope.id ? '#' + scope.id : '')}, chips=${chips.length}`);

    for (const el of chips) {
      const email = el.getAttribute('email') || '';
      if (email && email.includes('@')) {
        set.add(email.trim());
      }
    }

    const result = Array.from(set);
    log(`Found recipients:`, result);
    return result;
  }

  function getSubject() {
    const el = queryGmail(SUBJECT_FIELDS);
    const val = el ? (el.value || '') : '';
    return val || '(no subject)';
  }

  function checkEmailRows() {
    processEmailRows();
  }

  async function processEmailRows() {
    try {
      const storage = window.EmailTrackerStorage;
      if (!storage) return;

      const emails = await storage.getAllEmails();
      if (emails.length === 0) return;

      const rows = queryGmailAll(EMAIL_ROWS);
      if (!rows || rows.length === 0) return;

      const emailMap = new Map();
      for (const e of emails) {
        if (e.trackingId) emailMap.set(e.trackingId, e);
      }

      for (const row of rows) {
        if (row.querySelector('.et-badge')) continue;

        const link = row.querySelector('[role="link"]');
        if (!link) continue;

        const subjectEl = row.querySelector('span[data-thread-id], div[data-thread-id], span.bog, span[role="link"]');
        let matched = false;

        for (const [tid, email] of emailMap) {
          if (subjectEl && subjectEl.textContent.includes(email.subject?.substring(0, 20) || '')) {
            const badge = window.EmailTracker.createBadge(
              email.totalClicks > 0 ? 'clicked' : email.totalOpens > 0 ? 'opened' : 'pending',
              email.totalClicks > 0 ? email.totalClicks : email.totalOpens
            );
            link.parentNode.insertBefore(badge, link);
            matched = true;
            break;
          }
        }
      }
    } catch (e) {
      warn('processEmailRows error:', e);
    }
  }

  async function syncTrackingStatus() {
    try {
      const api = window.EmailTrackerAPI;
      const storage = window.EmailTrackerStorage;
      if (!api || !storage) return;

      const emails = await storage.getAllEmails();
      if (emails.length === 0) return;

      const allIds = emails.map(e => e.trackingId);
      const stats = await api.fetchBatchStats(allIds);
      if (!stats || Object.keys(stats).length === 0) return;

      let updated = 0;
      for (const [id, data] of Object.entries(stats)) {
        if (!data) continue;

        const local = emails.find(e => e.trackingId === id);
        const newOpens = data.totalOpens || 0;
        const newClicks = data.totalClicks || 0;
        const hadChange = !local || (local.totalOpens !== newOpens || local.totalClicks !== newClicks);

        if (hadChange && (newOpens > 0 || newClicks > 0)) {
          await storage.updateEmailStatus(id, {
            totalOpens: newOpens,
            uniqueOpens: data.uniqueOpens || 0,
            totalClicks: newClicks,
            lastEvent: data.lastEvent,
            status: newClicks > 0 ? 'clicked' : newOpens > 0 ? 'opened' : 'pending',
          });
          updated++;
        }
      }

      if (updated > 0) {
        log(`Updated ${updated} email statuses from server`);
        processEmailRows();
      }
    } catch (e) {
      warn('Sync error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'clear-data') {
      (async () => {
        try {
          const storage = window.EmailTrackerStorage;
          if (storage) await storage.clearAll();
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (msg.type === 'get-tracked-data') {
      (async () => {
        try {
          const storage = window.EmailTrackerStorage;
          if (!storage) { sendResponse({ emails: [], stats: {} }); return; }
          const emails = await storage.getAllEmails();
          const stats = await storage.getStats();
          sendResponse({ emails, stats });
        } catch (e) {
          warn('Message handler error:', e);
          sendResponse({ emails: [], stats: {} });
        }
      })();
      return true;
    }
  });

  log('Content script loaded');
})();
