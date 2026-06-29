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
          await syncTrackingStatus();
          const emails = await storage.getAllEmails();
          const stats = await storage.getStats();
          sendResponse({ emails, stats });
        } catch (e) {
          sendResponse({ emails: [], stats: {} });
        }
      })();
      return true;
    }

    if (message.type === 'delete-email') {
      (async () => {
        try {
          const storage = window.EmailTrackerStorage;
          if (storage && message.trackingId) await storage.deleteEmail(message.trackingId);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
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

      const allServer = await api.fetchAllStats();
      if (!allServer || allServer.length === 0) return;

      const localEmails = await storage.getAllEmails();
      let updated = 0;

      for (const item of allServer) {
        if (!item.trackingId) continue;
        const local = localEmails.find(e => e.trackingId === item.trackingId);
        const newOpens = item.totalOpens || 0;
        const newClicks = item.totalClicks || 0;

        if (!local) {
          await storage.saveEmail({
            trackingId: item.trackingId,
            subject: item.subject || '(no subject)',
            recipients: item.recipients || [],
            sentAt: item.sentAt || Date.now(),
            totalOpens: newOpens,
            uniqueOpens: item.uniqueOpens || 0,
            totalClicks: newClicks,
            lastEvent: item.lastEvent || null,
            status: newClicks > 0 ? 'clicked' : newOpens > 0 ? 'opened' : 'pending',
          });
          updated++;
        } else if (newOpens !== local.totalOpens || newClicks !== local.totalClicks) {
          await storage.updateEmailStatus(item.trackingId, {
            totalOpens: newOpens,
            uniqueOpens: item.uniqueOpens || 0,
            totalClicks: newClicks,
            lastEvent: item.lastEvent || local.lastEvent,
            status: newClicks > 0 ? 'clicked' : newOpens > 0 ? 'opened' : 'pending',
          });
          updated++;
        }
      }

      if (updated > 0) {
        console.log(`[EmailTracker] BG sync: ${updated} emails updated from server`);
      }
    } catch (e) {
      console.warn('[EmailTracker] BG sync error:', e);
    }
  }

  setTimeout(syncTrackingStatus, 5000);
  setInterval(syncTrackingStatus, 30000);
})();
