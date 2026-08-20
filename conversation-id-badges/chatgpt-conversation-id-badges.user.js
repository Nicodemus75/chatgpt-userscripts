// ==UserScript==
// @name         ChatGPT Conversation ID Badges
// @namespace    churchill-ai-tools
// @version      0.4.3
// @updateURL    https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/conversation-id-badges/chatgpt-conversation-id-badges.meta.js
// @downloadURL  https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/conversation-id-badges/chatgpt-conversation-id-badges.user.js
// @description  Shows compact 4-character tags derived from full canonical conversation IDs in ChatGPT's sidebar. Click the badge lane to copy the full ID. No network/API calls.
// @author       OpenAI / user-specific utility
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = Object.freeze({
    shortLength: 4,
    badgePrefix: '#',
    routingPrefix: 'CHATGPT:CLOUD:',
    toastDurationMs: 1400,
    scanDebounceMs: 80,
    badgeWidthPx: 40,
    nativeControlLanePx: 48,
    badgeControlGapPx: 6,
    rightInsetPx: 4,
    extraTitleGapPx: 8,
  });

  const STYLE_ID = 'cgpt-conversation-id-badge-style';
  const TOAST_ID = 'cgpt-conversation-id-badge-toast';
  const LEGACY_OVERLAY_ID = 'cgpt-conversation-id-overlay';
  const ATTR = Object.freeze({
    decorated: 'data-cgpt-id-badged',
    conversationId: 'data-cgpt-conversation-id',
    shortId: 'data-cgpt-short-id',
    titleTarget: 'data-cgpt-id-title-target',
  });

  let scanTimer = null;

  function extractConversationId(href) {
    if (!href) return null;
    try {
      const url = new URL(href, window.location.origin);
      const match = url.pathname.match(/\/c\/([^/?#]+)/i);
      if (!match) return null;
      const id = decodeURIComponent(match[1]).trim();
      if (!/^[A-Za-z0-9_-]{16,}$/.test(id)) return null;
      return id;
    } catch {
      return null;
    }
  }

  const TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

  function fullIdTagSeed(id) {
    // 64-bit FNV-1a over the entire canonical conversation ID. Conversation
    // IDs are ASCII-like, so charCodeAt gives a deterministic byte stream.
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let i = 0; i < id.length; i += 1) {
      hash ^= BigInt(id.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * prime);
    }

    // Encode the whole 64-bit result in Crockford-style Base32. This gives a
    // stable tag whose leading characters depend on the whole conversation ID,
    // rather than on the common UUID prefix visible in many ChatGPT chats.
    let value = hash;
    let encoded = '';
    do {
      encoded = TAG_ALPHABET[Number(value & 31n)] + encoded;
      value >>= 5n;
    } while (value > 0n);

    return encoded.padStart(13, '0');
  }

  function computeDisplayTags(linkIds) {
    const seeds = new Map();
    for (const id of linkIds.values()) {
      if (!seeds.has(id)) seeds.set(id, fullIdTagSeed(id));
    }

    const lengths = new Map(Array.from(seeds.keys(), (id) => [id, CONFIG.shortLength]));

    // Four Base32 characters provide 1,048,576 possible visible tags. If two
    // currently loaded chats ever collide, lengthen only the colliding tags
    // until they are unique. Their underlying canonical IDs never change.
    let changed = true;
    while (changed) {
      changed = false;
      const groups = new Map();
      for (const [id, seed] of seeds) {
        const length = Math.min(lengths.get(id), seed.length);
        const tag = seed.slice(0, length);
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(id);
      }

      for (const ids of groups.values()) {
        if (ids.length < 2) continue;
        for (const id of ids) {
          const current = lengths.get(id);
          if (current < seeds.get(id).length) {
            lengths.set(id, current + 1);
            changed = true;
          }
        }
      }
    }

    const tags = new Map();
    for (const [id, seed] of seeds) {
      tags.set(id, seed.slice(0, lengths.get(id)));
    }
    return tags;
  }

  function usableTitleExists(link) {
    const text = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim();
    return Boolean(text) && text.toLowerCase() !== 'new chat';
  }

  function badgeTotalReservePx() {
    return (
      CONFIG.badgeWidthPx +
      CONFIG.nativeControlLanePx +
      CONFIG.badgeControlGapPx +
      CONFIG.rightInsetPx +
      CONFIG.extraTitleGapPx
    );
  }

  function badgeBounds(link) {
    const rect = link.getBoundingClientRect();
    const right = rect.right - CONFIG.nativeControlLanePx - CONFIG.badgeControlGapPx;
    const left = right - CONFIG.badgeWidthPx;
    return {
      left,
      right,
      top: rect.top,
      bottom: rect.bottom,
    };
  }

  function pointInside(bounds, x, y) {
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      a[${ATTR.decorated}="true"] {
        position: relative !important;
      }

      /* Reserve badge/control space only inside the title. Never change the
         conversation row's outer width, padding, flex basis or box sizing;
         those are owned by ChatGPT and the separate Sidebar Resizer. */
      a[${ATTR.decorated}="true"] [${ATTR.titleTarget}="true"] {
        box-sizing: border-box !important;
        max-width: calc(100% - ${badgeTotalReservePx()}px) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      a[${ATTR.decorated}="true"]::after {
        content: attr(${ATTR.shortId});
        position: absolute !important;
        right: ${CONFIG.nativeControlLanePx + CONFIG.badgeControlGapPx}px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        width: ${CONFIG.badgeWidthPx}px !important;
        height: 18px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 0 3px !important;
        border: 1px solid rgba(128, 128, 128, 0.38) !important;
        border-radius: 5px !important;
        background: rgba(32, 32, 32, 0.88) !important;
        color: rgba(235, 235, 235, 0.88) !important;
        opacity: 0.72 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        font-size: 9px !important;
        font-weight: 600 !important;
        letter-spacing: 0.02em !important;
        line-height: 16px !important;
        white-space: nowrap !important;
        pointer-events: auto !important;
        cursor: copy !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        z-index: 1 !important;
      }

      a[${ATTR.decorated}="true"]:hover::after {
        opacity: 0.94 !important;
        background: rgba(55, 55, 55, 0.96) !important;
        border-color: rgba(160, 160, 160, 0.76) !important;
      }

      #${TOAST_ID} {
        position: fixed !important;
        left: 50% !important;
        bottom: 28px !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        padding: 7px 10px !important;
        border-radius: 7px !important;
        background: rgba(20, 20, 20, 0.92) !important;
        color: #fff !important;
        font: 12px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28) !important;
        pointer-events: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to the legacy clipboard path.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }

    textarea.remove();
    return ok;
  }

  function showToast(message) {
    document.getElementById(TOAST_ID)?.remove();
    const toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), CONFIG.toastDurationMs);
  }

  function findSidebarRoots() {
    const roots = new Set();
    document.querySelectorAll('nav').forEach((node) => roots.add(node));
    document.querySelectorAll('aside').forEach((node) => roots.add(node));
    document.querySelectorAll('[class*="sidebar" i]').forEach((node) => roots.add(node));
    return Array.from(roots);
  }

  function collectConversationLinks() {
    const links = new Set();
    for (const root of findSidebarRoots()) {
      root.querySelectorAll('a[href*="/c/"]').forEach((link) => {
        const id = extractConversationId(link.getAttribute('href') || link.href);
        if (id) links.add(link);
      });
    }
    return links;
  }

  function decorateLink(link, displayTag) {
    const id = extractConversationId(link.getAttribute('href') || link.href);
    if (!id || !usableTitleExists(link)) return;

    const currentId = link.getAttribute(ATTR.conversationId);
    const nextShortId = `${CONFIG.badgePrefix}${displayTag}`;
    if (
      currentId === id &&
      link.getAttribute(ATTR.decorated) === 'true' &&
      link.getAttribute(ATTR.shortId) === nextShortId
    ) return;

    /* v0.4.0 briefly reserved space by changing link padding. Remove any
       leftover inline bookkeeping and reserve space on the inner title only. */
    link.removeAttribute('data-cgpt-original-padding-right');
    link.style.removeProperty('--cgpt-id-original-padding-right');

    link.querySelectorAll(`[${ATTR.titleTarget}="true"]`).forEach((node) => {
      node.removeAttribute(ATTR.titleTarget);
    });

    const titleLeaf =
      link.querySelector('[data-marquee-text]')
      || link.querySelector('.truncate')
      || Array.from(link.querySelectorAll('span, div')).find((node) => {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        return text && text.length > 1;
      });

    /*
      Pinned and ordinary ChatGPT rows do not use identical title markup.
      Applying the reserve directly to a narrow leaf (for example a pinned-row
      .truncate span) can make the visible title much shorter than the row.

      Start at the real title text, then walk upward and use the widest
      text-bearing wrapper that still belongs to this link. This keeps the
      reserve relative to the row's expandable title area instead of a
      pinned-row leaf's intrinsic width.
    */
    let titleTarget = titleLeaf instanceof HTMLElement ? titleLeaf : null;
    if (titleTarget) {
      const titleText = (titleTarget.textContent || '').replace(/\s+/g, ' ').trim();
      const linkRect = link.getBoundingClientRect();
      let node = titleTarget;

      while (node.parentElement && node.parentElement !== link) {
        const parent = node.parentElement;
        const parentText = (parent.textContent || '').replace(/\s+/g, ' ').trim();
        const rect = parent.getBoundingClientRect();

        const textStillMatches =
          titleText &&
          parentText &&
          (parentText === titleText || parentText.includes(titleText));

        const rowLikeHeight =
          rect.height > 0 &&
          rect.height <= Math.max(64, linkRect.height * 1.8);

        if (!textStillMatches || !rowLikeHeight) break;

        if (rect.width >= node.getBoundingClientRect().width) {
          titleTarget = parent;
        }
        node = parent;
      }

      titleTarget.setAttribute(ATTR.titleTarget, 'true');
    }

    link.setAttribute(ATTR.decorated, 'true');
    link.setAttribute(ATTR.conversationId, id);
    link.setAttribute(ATTR.shortId, `${CONFIG.badgePrefix}${displayTag}`);
  }

  function cleanupStaleDecorations(liveLinks) {
    document.querySelectorAll(`a[${ATTR.decorated}="true"]`).forEach((link) => {
      if (liveLinks.has(link) && link.isConnected) return;
      link.removeAttribute(ATTR.decorated);
      link.removeAttribute(ATTR.conversationId);
      link.removeAttribute(ATTR.shortId);
      link.removeAttribute('data-cgpt-original-padding-right');
      link.style.removeProperty('--cgpt-id-original-padding-right');
      link.querySelectorAll(`[${ATTR.titleTarget}="true"]`).forEach((node) => {
        node.removeAttribute(ATTR.titleTarget);
      });
    });
  }

  function scan() {
    scanTimer = null;
    installStyles();
    document.getElementById(LEGACY_OVERLAY_ID)?.remove();

    const liveLinks = collectConversationLinks();
    const linkIds = new Map();
    for (const link of liveLinks) {
      const id = extractConversationId(link.getAttribute('href') || link.href);
      if (id) linkIds.set(link, id);
    }
    const displayTags = computeDisplayTags(linkIds);
    for (const [link, id] of linkIds) decorateLink(link, displayTags.get(id));
    cleanupStaleDecorations(liveLinks);
  }

  function scheduleScan() {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, CONFIG.scanDebounceMs);
  }

  function decoratedLinkFromEvent(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    for (const node of path) {
      if (node instanceof HTMLAnchorElement && node.getAttribute(ATTR.decorated) === 'true') {
        return node;
      }
    }
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest?.(`a[${ATTR.decorated}="true"]`) || null;
  }

  function handleBadgeClick(event) {
    if (!(event instanceof MouseEvent)) return;
    if (event.button !== 0) return;

    const link = decoratedLinkFromEvent(event);
    if (!link) return;

    const bounds = badgeBounds(link);
    if (!pointInside(bounds, event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const id = link.getAttribute(ATTR.conversationId);
    if (!id) return;

    const routingRefRequested = event.ctrlKey || event.metaKey;
    const text = routingRefRequested ? `${CONFIG.routingPrefix}${id}` : id;

    void copyText(text).then((copied) => {
      showToast(
        copied
          ? routingRefRequested
            ? `Copied routing ref ${link.getAttribute(ATTR.shortId) || CONFIG.badgePrefix}`
            : `Copied conversation ID ${link.getAttribute(ATTR.shortId) || CONFIG.badgePrefix}`
          : 'Could not copy conversation ID'
      );
    });
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return;

    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'class', 'style'],
      characterData: true,
    });
  }

  function hookSpaNavigation() {
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      if (typeof original !== 'function') continue;
      history[method] = function (...args) {
        const result = original.apply(this, args);
        scheduleScan();
        return result;
      };
    }
    window.addEventListener('popstate', scheduleScan);
  }

  // Capture-phase click handling lets the pseudo-element behave as an independent
  // copy target without placing an extra DOM child inside ChatGPT's React-owned link.
  document.addEventListener('click', handleBadgeClick, true);

  installStyles();
  document.getElementById(LEGACY_OVERLAY_ID)?.remove();
  scan();
  startObserver();
  hookSpaNavigation();
})();
