(() => {
  'use strict';

  const MOUNT_ID = 'cgpt-header-conversation-identity';
  const STYLE_ID = 'cgpt-header-conversation-style';
  const TOOLTIP_ID = 'cgpt-header-conversation-tooltip';
  const TITLE_CLASS = 'cgpt-header-conversation-title';
  const BADGE_CLASS = 'cgpt-header-conversation-badge';
  const ROUTING_PREFIX = 'CHATGPT:CLOUD:';
  const TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timer = null;

  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  const norm = (v) => clean(v).toLocaleLowerCase();

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || '1') > 0;
  }

  function conversationId(href = location.href) {
    try {
      const u = new URL(href, location.origin);
      const m = u.pathname.match(/\/c\/([^/?#]+)/i);
      if (!m) return null;
      const id = decodeURIComponent(m[1]).trim();
      return /^[A-Za-z0-9_-]{16,}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  function currentLink(id) {
    if (!id) return null;
    for (const root of document.querySelectorAll('nav, aside, [class*="sidebar" i]')) {
      for (const link of root.querySelectorAll('a[href*="/c/"]')) {
        if (conversationId(link.getAttribute('href') || link.href) === id) return link;
      }
    }
    return null;
  }

  function titleFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return '';
    for (const sel of ['[data-testid="conversation-title"]', '[data-testid="thread-title"]', '[data-marquee-text]', '.truncate']) {
      const t = clean(link.querySelector(sel)?.textContent);
      if (t && norm(t) !== 'new chat') return t;
    }
    const aria = clean(link.getAttribute('aria-label') || link.getAttribute('title'));
    return aria && norm(aria) !== 'new chat' ? aria : '';
  }

  function titleFromDocument(projectText = '') {
    let t = clean(document.title).replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '').trim();
    if (!t || /^ChatGPT$/i.test(t)) return '';
    const p = clean(projectText);
    if (p) {
      for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
        const prefix = `${p}${sep}`;
        if (norm(t).startsWith(norm(prefix))) {
          t = t.slice(prefix.length).trim();
          break;
        }
      }
      if (norm(t) === norm(p)) return '';
    }
    return t;
  }

  function findHeader() {
    const pageHeader = document.querySelector('#page-header');
    if (pageHeader instanceof HTMLElement && visible(pageHeader)) return pageHeader;

    const share = Array.from(document.querySelectorAll('button')).find((button) => {
      if (!(button instanceof HTMLElement) || !visible(button)) return false;
      return /share/i.test(clean(button.getAttribute('aria-label') || button.textContent));
    });
    const fromShare = share?.closest('header');
    if (fromShare instanceof HTMLElement && visible(fromShare)) return fromShare;

    return Array.from(document.querySelectorAll('header, [role="banner"]')).find((el) => {
      if (!(el instanceof HTMLElement) || !visible(el)) return false;
      const r = el.getBoundingClientRect();
      const pos = getComputedStyle(el).position;
      return r.top <= 140 && r.width >= 400 && (pos === 'sticky' || pos === 'fixed');
    }) || null;
  }

  function isInteractive(el) {
    return el instanceof HTMLElement && el.matches('a, button, [role="button"], [role="link"]');
  }

  function safeNativeTitleLane(header) {
    if (header.id === 'page-header') {
      const direct = Array.from(header.children).find((child) => {
        if (!(child instanceof HTMLElement) || isInteractive(child)) return false;
        const cls = typeof child.className === 'string' ? child.className : '';
        const interactiveCount = child.querySelectorAll('button, a[href], [role="button"]').length;
        return /flex-1/.test(cls) && /items-center/.test(cls) && interactiveCount === 0;
      });
      if (direct instanceof HTMLElement) return direct;
    }

    for (const sel of [
      '[data-testid="conversation-title-slot"]',
      '[data-testid="thread-title-slot"]',
      '[data-testid="conversation-title"]',
      '[data-testid="thread-title"]',
      '.title-lane', '.conversation-title', '.thread-title'
    ]) {
      const el = header.querySelector(sel);
      if (el instanceof HTMLElement && visible(el) && !isInteractive(el)) return el;
    }

    const hr = header.getBoundingClientRect();
    const candidates = Array.from(header.children)
      .filter((child) => child instanceof HTMLElement && visible(child) && !isInteractive(child))
      .filter((child) => child.querySelectorAll('button, a[href], [role="button"]').length === 0)
      .filter((child) => {
        const r = child.getBoundingClientRect();
        return r.left < hr.left + hr.width * 0.72 && r.width >= 120;
      })
      .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    return candidates[0] || null;
  }

  function textLeafCandidates(root) {
    if (!(root instanceof HTMLElement)) return [];
    return Array.from(root.querySelectorAll('span, div, p, a, button'))
      .filter((el) => el instanceof HTMLElement && visible(el) && !el.closest(`#${MOUNT_ID}`))
      .filter((el) => clean(el.textContent));
  }

  function nativeTitleNode(lane, title) {
    const needle = norm(title);
    if (!needle) return null;
    const exact = textLeafCandidates(lane)
      .filter((el) => norm(el.textContent) === needle)
      .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
    if (exact.length) return exact[0];

    if (needle.split(/\s+/).length >= 2 && needle.length >= 8) {
      const containing = textLeafCandidates(lane)
        .filter((el) => norm(el.textContent).includes(needle))
        .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
      if (containing.length) return containing[0];
    }
    return null;
  }

  function projectText(lane, title = '') {
    const titleNorm = norm(title);
    const values = textLeafCandidates(lane)
      .map((el) => clean(el.textContent))
      .filter((t) => t && norm(t) !== titleNorm)
      .filter((t) => !/^(work|share|temporary)$/i.test(t))
      .filter((t) => !t.startsWith('#'))
      .sort((a, b) => b.length - a.length);
    return values[0] || clean(lane.textContent);
  }

  function shortTag(id, link) {
    const existing = clean(link?.getAttribute('data-cgpt-short-id'));
    if (existing) return existing.startsWith('#') ? existing : `#${existing}`;
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let i = 0; i < id.length; i += 1) {
      hash ^= BigInt(id.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * prime);
    }
    let value = hash;
    let encoded = '';
    do {
      encoded = TAG_ALPHABET[Number(value & 31n)] + encoded;
      value >>= 5n;
    } while (value > 0n);
    return `#${encoded.padStart(13, '0').slice(0, 4)}`;
  }

  function installStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      #${MOUNT_ID}{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;flex:0 1 auto!important;min-width:0!important;max-width:min(52vw,760px)!important;overflow:hidden!important;margin-left:7px!important;gap:7px!important;white-space:nowrap!important;vertical-align:middle!important;}
      #${MOUNT_ID} .${TITLE_CLASS}{display:inline-block!important;flex:0 1 auto!important;min-width:0!important;max-width:min(44vw,650px)!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;box-sizing:border-box!important;padding:2px 6px!important;border-radius:6px!important;background:var(--main-surface-primary,var(--background-primary,Canvas))!important;color:var(--text-secondary,rgba(180,180,180,.95))!important;opacity:1!important;font:inherit!important;line-height:inherit!important;}
      #${MOUNT_ID} .${BADGE_CLASS}{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-width:40px!important;height:18px!important;padding:0 4px!important;box-sizing:border-box!important;border:1px solid rgba(128,128,128,.38)!important;border-radius:5px!important;background:rgba(32,32,32,.88)!important;color:rgba(235,235,235,.88)!important;opacity:.72!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;font-size:9px!important;font-weight:600!important;line-height:16px!important;cursor:copy!important;user-select:none!important;}
      #${MOUNT_ID} .${BADGE_CLASS}:hover{opacity:.94!important;background:rgba(55,55,55,.96)!important;border-color:rgba(160,160,160,.76)!important;}
      #${TOOLTIP_ID}{position:fixed!important;z-index:2147483647!important;padding:5px 7px!important;border:1px solid rgba(128,128,128,.45)!important;border-radius:6px!important;background:rgba(20,20,20,.96)!important;color:rgba(245,245,245,.96)!important;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;white-space:nowrap!important;pointer-events:none!important;}
    `;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch { }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  function showTooltip(anchor, text) {
    document.getElementById(TOOLTIP_ID)?.remove();
    if (!(anchor instanceof HTMLElement) || !text) return;
    const tip = document.createElement('div');
    tip.id = TOOLTIP_ID;
    tip.textContent = text;
    document.body.appendChild(tip);
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    tip.style.left = `${Math.round(Math.max(margin, Math.min(a.right - t.width, innerWidth - t.width - margin)))}px`;
    let top = a.bottom + gap;
    if (top + t.height > innerHeight - margin) top = Math.max(margin, a.top - t.height - gap);
    tip.style.top = `${Math.round(top)}px`;
  }

  function makeBadge(id, tag) {
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.textContent = tag;
    badge.dataset.conversationId = id;
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-label', `Copy conversation ID ${id}`);
    badge.addEventListener('mouseenter', () => showTooltip(badge, id));
    badge.addEventListener('mouseleave', () => document.getElementById(TOOLTIP_ID)?.remove());
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void copyText(event.ctrlKey || event.metaKey ? `${ROUTING_PREFIX}${id}` : id);
    });
    return badge;
  }

  function sync() {
    timer = null;
    installStyles();

    const id = conversationId();
    if (!id) {
      document.getElementById(MOUNT_ID)?.remove();
      return;
    }

    const header = findHeader();
    if (!header) return;
    const lane = safeNativeTitleLane(header);
    if (!lane) {
      document.getElementById(MOUNT_ID)?.remove();
      return;
    }

    const link = currentLink(id);
    const provisionalProject = projectText(lane, '');
    const title = titleFromLink(link) || titleFromDocument(provisionalProject);
    if (!title) return;

    const native = nativeTitleNode(lane, title);
    const tag = shortTag(id, link);
    let mount = document.getElementById(MOUNT_ID);
    if (!(mount instanceof HTMLElement)) {
      mount = document.createElement('span');
      mount.id = MOUNT_ID;
    }
    mount.replaceChildren();

    if (native?.parentElement) {
      native.insertAdjacentElement('afterend', mount);
      mount.appendChild(makeBadge(id, tag));
      return;
    }

    if (mount.parentNode !== lane) lane.appendChild(mount);
    const titleNode = document.createElement('span');
    titleNode.className = TITLE_CLASS;
    titleNode.textContent = `/ ${title}`;
    titleNode.title = title;
    mount.appendChild(titleNode);
    mount.appendChild(makeBadge(id, tag));
  }

  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(sync, 90);
  }

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function (...args) {
      const result = original.apply(this, args);
      schedule();
      return result;
    };
  }
  addEventListener('popstate', schedule);
  addEventListener('resize', schedule);
  addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      const target = m.target instanceof Element ? m.target : null;
      if (target?.closest?.(`#${MOUNT_ID}`)) continue;
      if (target?.closest?.('#page-header, header, nav, aside, [class*="sidebar" i]')) {
        schedule();
        return;
      }
      for (const node of m.addedNodes) {
        if (node instanceof Element && (node.matches?.('#page-header, header, a[href*="/c/"]') || node.querySelector?.('#page-header, header, a[href*="/c/"]'))) {
          schedule();
          return;
        }
      }
    }
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });

  schedule();
})();
