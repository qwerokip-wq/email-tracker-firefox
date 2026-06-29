(function () {
  console.log('[EmailTracker] Background script loaded');

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'save-email') {
      (async () => {
        try {
          const storage = window.EmailTrackerStorage;
          if (storage) await storage.saveEmail(message.email);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true;
    }

    if (message.type === 'get-tracked-data') {
      (async () => {
        try {
          const storage = window.EmailTrackerStorage;
          if (!storage) { sendResponse({ emails: [], stats: {} }); return; }
          const emails = await storage.getAllEmails();
          const stats = await storage.getStats();
          sendResponse({ emails, stats });
        } catch (e) {
          sendResponse({ emails: [], stats: {} });
        }
      })();
      return true;
    }

    if (message.type === 'clear-data') {
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
  });

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
        console.log(`[EmailTracker] BG sync updated ${updated} emails`);
      }
    } catch (e) {
      console.warn('[EmailTracker] BG sync error:', e);
    }
  }

  setTimeout(syncTrackingStatus, 5000);
  setInterval(syncTrackingStatus, 30000);
})();
