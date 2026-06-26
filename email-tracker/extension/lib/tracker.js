const Tracker = (() => {
  const TRACKER_PREFIX = 'et-tracker-';

  function generateId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('');
  }

  function getPixelUrl(trackingId, recipient) {
    const api = window.EmailTrackerAPI;
    if (!api) return null;
    const base = api.getBaseUrl();
    const encodedRecipient = btoa(unescape(encodeURIComponent(recipient)));
    return `${base}/pixel/${trackingId}/${encodedRecipient}`;
  }

  function getPixelCssUrl(trackingId, recipient) {
    const api = window.EmailTrackerAPI;
    if (!api) return null;
    const base = api.getBaseUrl();
    const encodedRecipient = btoa(unescape(encodeURIComponent(recipient)));
    return `${base}/pixel-css/${trackingId}/${encodedRecipient}`;
  }

  function getClickUrl(trackingId, recipient, originalUrl) {
    const api = window.EmailTrackerAPI;
    if (!api) return originalUrl;
    const base = api.getBaseUrl();
    const encodedRecipient = btoa(unescape(encodeURIComponent(recipient)));
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${base}/click/${trackingId}/${encodedRecipient}?url=${encodedUrl}`;
  }

  function injectPixel(composeElement, trackingId, recipients) {
    const pixelHtml = recipients.map(r => {
      const url = getPixelUrl(trackingId, r);
      const cssUrl = getPixelCssUrl(trackingId, r);
      return `<img src="${url}" width="1" height="1" style="display:none!important;width:1px!important;height:1px!important;border:0!important;" alt="" />` +
             `<link rel="stylesheet" href="${cssUrl}" type="text/css" />`;
    }).join('');

    composeElement.insertAdjacentHTML('beforeend', pixelHtml);
  }

  const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

  function rewriteLinks(composeElement, trackingId, recipients) {
    const primaryRecipient = recipients[0] || 'unknown';

    const links = composeElement.querySelectorAll('a[href]');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('#') || href.startsWith(TRACKER_PREFIX)) return;
      if (link.hasAttribute(TRACKER_PREFIX + 'done')) return;

      const trackingUrl = getClickUrl(trackingId, primaryRecipient, href);
      link.setAttribute(TRACKER_PREFIX + 'original-href', href);
      link.setAttribute('href', trackingUrl);
      link.setAttribute(TRACKER_PREFIX + 'done', 'true');
    });

    wrapUrlTextNodes(composeElement, trackingId, primaryRecipient);
  }

  function wrapUrlTextNodes(root, trackingId, recipient) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const replacements = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent || !URL_REGEX.test(node.textContent)) continue;
      URL_REGEX.lastIndex = 0;

      if (node.parentNode && (node.parentNode.nodeName === 'A' || node.parentNode.closest('a'))) continue;

      const parts = node.textContent.split(URL_REGEX);
      if (parts.length <= 1) continue;

      replacements.push({ node, parts });
    }

    for (const { node, parts } of replacements) {
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (URL_REGEX.test(part)) {
          const a = document.createElement('a');
          a.href = getClickUrl(trackingId, recipient, part);
          a.textContent = part;
          a.target = '_blank';
          fragment.appendChild(a);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      }
      node.parentNode.replaceChild(fragment, node);
    }
  }

  function createBadge(status, count) {
    const badge = document.createElement('span');
    badge.className = 'et-badge';
    badge.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      margin-right: 4px; flex-shrink: 0;
    `;

    if (status === 'opened') {
      badge.style.background = '#34a853';
      if (count && count > 1) {
        badge.innerHTML = `<span style="color:white;font-size:9px;font-weight:600;">${count}</span>`;
        badge.title = `Opened ${count} times`;
      }
    } else if (status === 'clicked') {
      badge.style.background = '#1a73e8';
      badge.title = 'Link clicked';
    } else {
      badge.style.background = '#dadce0';
      badge.title = 'Not opened yet';
    }

    return badge;
  }

  function ensureTrackerStyles() {
    if (document.getElementById('et-styles')) return;
    const style = document.createElement('style');
    style.id = 'et-styles';
    style.textContent = `
      .et-badge { transition: background 0.3s ease; }
      .et-badge:hover { transform: scale(1.2); }
      .et-tracking-bar { display:flex; align-items:center; gap:4px; padding:4px 0; }
      .et-tracking-bar span { font-size:11px; color:#5f6368; }
    `;
    document.head.appendChild(style);
  }

  function findComposeElement() {
    const selectors = [
      'div[role="textbox"][aria-label*="Message Body"]',
      'div[role="textbox"][aria-label*="message body"]',
      'div[contenteditable="true"][aria-label*="Body"]',
      'div[contenteditable="true"][aria-label*="body"]',
      'div.editable[contenteditable="true"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findSendButton() {
    const selectors = [
      'div[role="button"][data-tooltip*="Send"]',
      'div[role="button"]' + '[aria-label*="Send" i]',
      'div[role="button"]' + '[data-tooltip*="send" i]',
      'div.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findEmailRows() {
    const selectors = [
      'div[role="tab"]',
      'tr.zA',
      'div[data-hovercard-id]',
    ];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return els;
    }
    return null;
  }

  function getRecipientsFromCompose() {
    const chipSelectors = [
      'div[role="chip"] span[email]',
      'span[email]',
      'div.vR div.vT span[email]',
    ];
    const recipients = [];
    for (const sel of chipSelectors) {
      const chips = document.querySelectorAll(sel);
      if (chips.length > 0) {
        chips.forEach(c => {
          const email = c.getAttribute('email');
          if (email && !recipients.includes(email)) recipients.push(email);
        });
        break;
      }
    }
    return recipients;
  }

  function getSubject() {
    const selectors = [
      'input[name="subjectbox"]',
      'input[aria-label*="Subject"]',
      'input[aria-label*="subject"]',
      'input.aoT',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.value) return el.value;
    }
    return '(no subject)';
  }

  function addTrackingBar(emailElement, trackingInfo) {
    const existing = emailElement.querySelector('.et-tracking-bar');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'et-tracking-bar';

    if (trackingInfo.totalOpens > 0) {
      bar.appendChild(createBadge('opened', trackingInfo.totalOpens));
      bar.appendChild(Object.assign(document.createElement('span'), {
        textContent: `${trackingInfo.totalOpens} ${trackingInfo.totalOpens === 1 ? 'open' : 'opens'}`
      }));
    } else {
      bar.appendChild(createBadge('pending'));
      bar.appendChild(Object.assign(document.createElement('span'), {
        textContent: 'Pending'
      }));
    }

    emailElement.querySelector('[role="link"]')?.after(bar);
  }

  return {
    generateId,
    getPixelUrl,
    getClickUrl,
    injectPixel,
    rewriteLinks,
    createBadge,
    ensureTrackerStyles,
    findComposeElement,
    findSendButton,
    findEmailRows,
    getRecipientsFromCompose,
    getSubject,
    addTrackingBar,
    TRACKER_PREFIX,
  };
})();

window.EmailTracker = Tracker;
