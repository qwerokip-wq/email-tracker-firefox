(function () {
  function g(key) {
    try {
      return browser.i18n.getMessage(key) || key;
    } catch (_) {
      const fb = {
        popupTitle: 'Email Tracker', statsSent: 'Sent', statsOpens: 'Opens',
        statsClicks: 'Clicks', statsUnique: 'Unique', noData: 'No tracked emails yet',
        sendFirstEmail: 'Send an email to start tracking', settings: 'Settings',
        refresh: 'Refresh', opensCount: 'opens', clicksCount: 'clicks',
        never: 'Never', justNow: 'Now', minutesAgo: 'min ago', hoursAgo: 'h ago',
        daysAgo: 'd ago', recipients: 'Recipients',
      };
      return fb[key] || key;
    }
  }

  function fmt(ts) {
    if (!ts) return g('never');
    const d = Date.now() - ts;
    if (d < 60000) return g('justNow');
    if (d < 3600000) return Math.floor(d / 60000) + g('minutesAgo');
    if (d < 86400000) return Math.floor(d / 3600000) + g('hoursAgo');
    return Math.floor(d / 86400000) + g('daysAgo');
  }

  function id(el) { return document.getElementById(el); }

  function applyLocale() {
    const m = { title:'popupTitle', sentLabel:'statsSent', opensLabel:'statsOpens',
      clicksLabel:'statsClicks', uniqueLabel:'statsUnique', noDataTitle:'noData',
      noDataDesc:'sendFirstEmail', settingsBtn:'settings' };
    for (const [k, v] of Object.entries(m)) {
      const el = id(k);
      if (el) el.textContent = g(v);
    }
    const r = id('refreshBtn');
    if (r) r.title = g('refresh');
  }

  async function fetchFromContent() {
    try {
      const tabs = await browser.tabs.query({ url: 'https://mail.google.com/*' });
      if (!tabs || tabs.length === 0) return null;

      const resp = await browser.tabs.sendMessage(tabs[0].id, { type: 'get-tracked-data' });
      return resp || null;
    } catch (e) {
      return null;
    }
  }

  async function loadData() {
    const sync = id('syncStatus');
    if (sync) sync.textContent = g('refresh') + '...';

    let data = await fetchFromContent();

    if (!data) {
      const tabs = await browser.tabs.query({ url: 'https://mail.google.com/*' });
      if (!tabs || tabs.length === 0) {
        if (sync) sync.textContent = 'Open Gmail';
        id('noData').style.display = 'flex';
        return;
      }
      if (sync) sync.textContent = 'Loading...';
      id('noData').style.display = 'flex';
      id('noDataTitle').textContent = 'Loading...';
      id('noDataDesc').textContent = 'Wait for Gmail to load';
      setTimeout(loadData, 2000);
      return;
    }

    if (sync) sync.textContent = '';
    const settings = (await browser.storage.local.get('settings')).settings || {};
    const displayCount = settings.displayCount || 5;
    render(data.emails || [], data.stats || {}, displayCount);
  }

  function render(emails, stats, displayCount) {
    id('sentCount').textContent = stats.totalSent || 0;
    id('opensCount').textContent = stats.totalOpens || 0;
    id('clicksCount').textContent = stats.totalClicks || 0;
    id('uniqueCount').textContent = stats.uniqueOpens || 0;

    const noData = id('noData');
    if (!emails.length) {
      noData.style.display = 'flex';
      id('emailList').innerHTML = '';
      return;
    }

    noData.style.display = 'none';
    const list = id('emailList');
    list.innerHTML = '';

    for (const e of emails.slice(0, displayCount)) {
      const item = document.createElement('li');
      item.className = 'email-item';

      const dot = document.createElement('div');
      dot.className = 'status-dot ' + (e.totalClicks > 0 ? 'clicked' : e.totalOpens > 0 ? 'opened' : 'pending');

      const ct = document.createElement('div');
      ct.className = 'email-content';

      const subj = document.createElement('div');
      subj.className = 'email-subject';
      subj.textContent = e.subject || '(no subject)';

      const meta = document.createElement('div');
      meta.className = 'email-meta';
      meta.textContent = (e.recipients || []).join(', ') || '—';

      const sr = document.createElement('div');
      sr.className = 'email-stats';
      sr.innerHTML = `<span>${e.totalOpens||0} ${g('opensCount')}</span><span>${e.totalClicks||0} ${g('clicksCount')}</span>`;

      ct.appendChild(subj);
      ct.appendChild(meta);
      ct.appendChild(sr);

      const tm = document.createElement('div');
      tm.className = 'email-time';
      tm.textContent = fmt(e.lastEvent || e.sentAt);

      item.appendChild(dot);
      item.appendChild(ct);
      item.appendChild(tm);
      list.appendChild(item);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyLocale();
    loadData();
    id('refreshBtn').addEventListener('click', loadData);
    id('settingsBtn').addEventListener('click', () => browser.runtime.openOptionsPage());
  });
})();
