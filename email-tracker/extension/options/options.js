(function () {
  const STORAGE_KEY = 'email-tracker-settings';
  const DEFAULT_WORKER_URL = 'https://email-tracker.qwerokip.workers.dev';

  function getMessage(key) {
    try { return browser.i18n.getMessage(key) || key; } catch (_) { return key; }
  }

  function applyLocale() {
    document.getElementById('settingsTitle').textContent = getMessage('settings');
    document.getElementById('settingsDesc').textContent = 'Configure your Email Tracker extension';
    document.getElementById('serverTitle').textContent = 'Tracker Server';
    document.getElementById('workerUrlLabel').textContent = getMessage('workerUrl');
    document.getElementById('workerUrlHelp').textContent = getMessage('workerUrlHelp');
    document.getElementById('trackingTitle').textContent = 'Tracking';
    document.getElementById('trackingLabel').textContent = getMessage('trackingEnabled');
    document.getElementById('displayCountLabel').textContent = getMessage('displayCount');
    document.getElementById('displayCountHelp').textContent = getMessage('displayCountHelp');
    document.getElementById('privacyTitle').textContent = 'Privacy';
    document.getElementById('clearDataBtn').textContent = getMessage('clearData');
    document.getElementById('saveBtn').textContent = getMessage('save');
    document.getElementById('testBtn').textContent = 'Test Connection';
  }

  async function loadSettings() {
    try {
      const result = await browser.storage.local.get('settings');
      const settings = result.settings || {};
      document.getElementById('workerUrl').value = settings.workerUrl || '';
      document.getElementById('workerUrl').placeholder = DEFAULT_WORKER_URL + ' (default)';
      document.getElementById('trackingEnabled').checked = settings.enabled !== false;
      document.getElementById('displayCount').value = settings.displayCount || 5;
    } catch (_) {
      console.warn('[EmailTracker] Failed to load settings');
    }
  }

  async function saveSettings() {
    const settings = {
      workerUrl: document.getElementById('workerUrl').value.trim().replace(/\/+$/, '') || '',
      enabled: document.getElementById('trackingEnabled').checked,
      displayCount: parseInt(document.getElementById('displayCount').value) || 5,
    };

    try {
      await browser.storage.local.set({ settings });
      showStatus(getMessage('saved'), 'success');
    } catch (e) {
      showStatus('Error saving settings: ' + e.message, 'error');
    }
  }

  async function testConnection() {
    const url = document.getElementById('workerUrl').value.trim().replace(/\/+$/, '');
    const resultDiv = document.getElementById('testResult');

    if (!url) {
      resultDiv.textContent = 'Please enter a Worker URL first';
      resultDiv.className = 'test-result error';
      resultDiv.style.display = 'block';
      return;
    }

    resultDiv.textContent = 'Testing connection...';
    resultDiv.className = 'test-result loading';
    resultDiv.style.display = 'block';

    try {
      const response = await fetch(url, { method: 'GET', mode: 'cors' });
      if (response.ok) {
        const data = await response.json();
        resultDiv.textContent = 'Connection successful! Worker is running.';
        resultDiv.className = 'test-result success';
      } else {
        resultDiv.textContent = `Server responded with status ${response.status}`;
        resultDiv.className = 'test-result error';
      }
    } catch (e) {
      resultDiv.textContent = `Connection failed: ${e.message}. Make sure your Worker is deployed.`;
      resultDiv.className = 'test-result error';
    }
  }

  async function clearData() {
    if (!confirm('Are you sure you want to clear all locally stored tracking data?')) return;

    try {
      const tabs = await browser.tabs.query({ url: 'https://mail.google.com/*' });
      if (tabs.length > 0) {
        await browser.tabs.sendMessage(tabs[0].id, { type: 'clear-data' });
      }
      showStatus('Local data cleared', 'success');
    } catch (e) {
      showStatus('Error: ' + e.message, 'error');
    }
  }

  function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyLocale();
    loadSettings();

    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('testBtn').addEventListener('click', testConnection);
    document.getElementById('clearDataBtn').addEventListener('click', clearData);
  });
})();
