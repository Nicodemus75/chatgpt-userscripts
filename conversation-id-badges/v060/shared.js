(() => {
  'use strict';
  const M = window.CGPTHeaderV060 = window.CGPTHeaderV060 || {};
  M.VERSION = '0.6.0';
  M.ROOT_ID = 'cgpt-header-identity-v060';
  M.STYLE_ID = 'cgpt-header-identity-v060-style';
  M.TOOLTIP_ID = 'cgpt-header-identity-v060-tooltip';
  M.HOST_SLOT_ATTR = 'data-cgpt-header-host-slot';
  M.ROUTING_PREFIX = 'CHATGPT:CLOUD:';
  M.TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  M.clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  M.norm = (v) => M.clean(v).toLocaleLowerCase();
  M.debounce = (fn, delay) => {
    let timer = null;
    const wrapped = (...args) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; fn(...args); }, delay);
    };
    wrapped.cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; };
    return wrapped;
  };
  M.visible = (el) => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return true;
    return !(el.hidden || el.getAttribute('aria-hidden') === 'true');
  };
  M.conversationId = (href = location.href) => {
    try {
      const u = new URL(href, location.origin);
      const m = u.pathname.match(/(?:^|\/)(?:c|share)\/([^/?#]+)/i);
      return m ? decodeURIComponent(m[1]) : null;
    } catch { return null; }
  };
  M.surface = () => /\/projects?\//i.test(location.pathname || '') || document.querySelector('[data-testid*="project"], [aria-label*="Project"], [href*="/projects/"]') ? 'project' : 'regular';
  M.isInteractive = (el) => el instanceof HTMLElement && (/^(A|BUTTON)$/.test(el.tagName) || /button|link/i.test(el.getAttribute('role') || ''));
  M.isSkipLink = (el) => el instanceof HTMLAnchorElement && (/#main/i.test(el.getAttribute('href') || '') || /skip to content/i.test(M.clean(el.textContent)));
})();
