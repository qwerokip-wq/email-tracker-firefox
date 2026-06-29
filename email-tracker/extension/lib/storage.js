const EmailTrackerStorage = (() => {
  const DB_NAME = 'email-tracker-db';
  const DB_VERSION = 1;
  const STORE_EMAILS = 'emails';
  const STORE_EVENTS = 'events';

  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORE_EMAILS)) {
          const store = database.createObjectStore(STORE_EMAILS, { keyPath: 'trackingId' });
          store.createIndex('sentAt', 'sentAt', { unique: false });
        }
        if (!database.objectStoreNames.contains(STORE_EVENTS)) {
          const store = database.createObjectStore(STORE_EVENTS, { keyPath: 'id', autoIncrement: true });
          store.createIndex('trackingId', 'trackingId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  async function saveEmail(emailData) {
    const database = await openDB();
    const tx = database.transaction(STORE_EMAILS, 'readwrite');
    const store = tx.objectStore(STORE_EMAILS);
    store.put({
      trackingId: emailData.trackingId,
      subject: emailData.subject || '(no subject)',
      recipients: emailData.recipients || [],
      sentAt: emailData.sentAt || Date.now(),
      totalOpens: emailData.totalOpens || 0,
      uniqueOpens: emailData.uniqueOpens || 0,
      totalClicks: emailData.totalClicks || 0,
      lastEvent: emailData.lastEvent || null,
      status: emailData.status || 'pending',
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllEmails() {
    const database = await openDB();
    const tx = database.transaction(STORE_EMAILS, 'readonly');
    const store = tx.objectStore(STORE_EMAILS);
    const index = store.index('sentAt');
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getEmail(trackingId) {
    const database = await openDB();
    const tx = database.transaction(STORE_EMAILS, 'readonly');
    const store = tx.objectStore(STORE_EMAILS);
    return new Promise((resolve, reject) => {
      const request = store.get(trackingId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function updateEmailStatus(trackingId, updates) {
    const database = await openDB();
    const tx = database.transaction(STORE_EMAILS, 'readwrite');
    const store = tx.objectStore(STORE_EMAILS);
    return new Promise((resolve, reject) => {
      const getRequest = store.get(trackingId);
      getRequest.onsuccess = () => {
        const data = getRequest.result || { trackingId };
        Object.assign(data, updates);
        store.put(data);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function addEvent(eventData) {
    const database = await openDB();
    const tx = database.transaction(STORE_EVENTS, 'readwrite');
    const store = tx.objectStore(STORE_EVENTS);
    store.add({
      trackingId: eventData.trackingId,
      type: eventData.type,
      recipientId: eventData.recipientId || '',
      timestamp: eventData.timestamp || Date.now(),
      details: eventData.details || {},
    });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function getEvents(trackingId, limit = 50) {
    const database = await openDB();
    const tx = database.transaction(STORE_EVENTS, 'readonly');
    const store = tx.objectStore(STORE_EVENTS);
    const index = store.index('trackingId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(trackingId, limit);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getAllEvents(limit = 200) {
    const database = await openDB();
    const tx = database.transaction(STORE_EVENTS, 'readonly');
    const store = tx.objectStore(STORE_EVENTS);
    const index = store.index('timestamp');
    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'prev');
      const results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function getStats() {
    const emails = await getAllEmails();
    return {
      totalSent: emails.length,
      totalOpens: emails.reduce((s, e) => s + (e.totalOpens || 0), 0),
      totalClicks: emails.reduce((s, e) => s + (e.totalClicks || 0), 0),
      openedEmails: emails.filter(e => (e.totalOpens || 0) > 0).length,
      uniqueOpens: emails.reduce((s, e) => s + (e.uniqueOpens || 0), 0),
    };
  }

  async function deleteEmail(trackingId) {
    const database = await openDB();
    const tx = database.transaction(STORE_EMAILS, 'readwrite');
    const store = tx.objectStore(STORE_EMAILS);
    store.delete(trackingId);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async function clearAll() {
    const database = await openDB();
    for (const store of [STORE_EMAILS, STORE_EVENTS]) {
      const tx = database.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    }
  }

  return {
    saveEmail, getAllEmails, getEmail, updateEmailStatus, deleteEmail,
    addEvent, getEvents, getAllEvents,
    getStats, clearAll,
  };
})();

window.EmailTrackerStorage = EmailTrackerStorage;
