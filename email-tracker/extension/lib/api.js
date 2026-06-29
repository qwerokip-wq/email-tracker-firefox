const DEFAULT_WORKER_URL = 'https://email-tracker.qwerokip.workers.dev';

const EmailTrackerAPI = (() => {
  let cachedBaseUrl = '';
  let cachedEnabled = true;
  let initPromise = null;

  async function getSettings() {
    try {
      const result = await browser.storage.local.get('settings');
      return result.settings || {};
    } catch (e) {
      return {};
    }
  }

  async function init() {
    try {
      const settings = await getSettings();
      cachedBaseUrl = (settings.workerUrl || '').replace(/\/+$/, '');
      cachedEnabled = settings.enabled !== false;
    } catch (e) {
      warn('init error:', e);
    }
  }

  initPromise = init();

  try {
    browser.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        const s = changes.settings.newValue || {};
        cachedBaseUrl = (s.workerUrl || '').replace(/\/+$/, '');
        cachedEnabled = s.enabled !== false;
      }
    });
  } catch (e) {}

  async function ensureInit() {
    if (initPromise) {
      await initPromise;
      initPromise = null;
    }
  }

  function getBaseUrl() {
    return cachedBaseUrl || DEFAULT_WORKER_URL;
  }

  function isEnabled() {
    return cachedEnabled;
  }

  async function registerEmail(trackingId, subject, recipients) {
    await ensureInit();
    const baseUrl = getBaseUrl();
    if (!baseUrl) return null;

    try {
      const response = await fetch(`${baseUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingId, subject: subject || '(no subject)', recipients }),
      });
      return response.ok ? response.json() : null;
    } catch (e) {
      warn('registerEmail failed:', e);
      return null;
    }
  }

  async function fetchBatchStats(trackingIds) {
    await ensureInit();
    const baseUrl = getBaseUrl();
    if (!baseUrl || !trackingIds.length) return {};

    try {
      const response = await fetch(`${baseUrl}/api/batch-opens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingIds }),
      });
      if (response.ok) return response.json();
    } catch (e) {
      warn('fetchBatchStats failed:', e);
    }
    return {};
  }

  async function fetchAllStats() {
    await ensureInit();
    const baseUrl = getBaseUrl();
    if (!baseUrl) return [];

    try {
      const response = await fetch(`${baseUrl}/api/all-stats`);
      if (response.ok) return response.json();
    } catch (e) {
      warn('fetchAllStats failed:', e);
    }
    return [];
  }

  async function deleteFromServer(trackingId) {
    await ensureInit();
    const baseUrl = getBaseUrl();
    if (!baseUrl) return null;

    try {
      const response = await fetch(`${baseUrl}/api/delete/${trackingId}`, {
        method: 'DELETE',
      });
      return response.ok ? response.json() : null;
    } catch (e) {
      warn('deleteFromServer failed:', e);
      return null;
    }
  }

  async function fetchEvents(trackingId) {
    await ensureInit();
    const baseUrl = getBaseUrl();
    if (!baseUrl) return null;

    try {
      const response = await fetch(`${baseUrl}/api/events/${trackingId}`);
      if (response.ok) return response.json();
    } catch (e) {
      warn('fetchEvents failed:', e);
    }
    return null;
  }

  function warn(...args) {
    try { console.warn('[EmailTracker]', ...args); } catch (_) {}
  }

  return {
    getBaseUrl,
    isEnabled,
    registerEmail,
    fetchBatchStats,
    fetchAllStats,
    fetchEvents,
    deleteFromServer,
  };
})();

window.EmailTrackerAPI = EmailTrackerAPI;
