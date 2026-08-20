// ==UserScript==
// @name         ChatGPT Conversation ID Badges
// @namespace    churchill-ai-tools
// @version      0.3.3
// @updateURL    https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/conversation-id-badges/chatgpt-conversation-id-badges.meta.js
// @downloadURL  https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/conversation-id-badges/chatgpt-conversation-id-badges.user.js
// @description  Shows short canonical conversation-ID badges beside loaded ChatGPT sidebar chats. Badges live in a separate overlay and never modify ChatGPT's conversation-link contents. Click to copy full ID. No network/API calls.
// @author       OpenAI / user-specific utility
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = Object.freeze({
    shortLength: 8,
    badgePrefix: '#',
    routingPrefix: 'CHATGPT:CLOUD:',
    toastDurationMs: 1400,
    scanDebounceMs: 80,
    positionDebounceMs: 16,
    rightInsetPx: 8,
    nativeControlGapPx: 6,
    hoverFallbackLanePx: 44,
    badgeHeightPx: 16,
  });

  const BADGE_CLASS = 'cgpt-conversation-id-badge';
  const OVERLAY_ID = 'cgpt-conversation-id-overlay';
  const STYLE_ID = 'cgpt-conversation-id-badge-style';
  const TOAST_ID = 'cgpt-conversation-id-badge-toast';

  let scanTimer = null;
  let positionTimer = null;

  // Map ChatGPT-owned link elements to our overlay badges. We never append
  // anything to those links; the map is only used to track viewport position.
  const tracked = new Map();

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

  function compactId(id) {
    const normalized = id.replace(/[^A-Za-z0-9]/g, '');
    return normalized.slice(0, CONFIG.shortLength).toUpperCase();
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483000 !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }

      .${BADGE_CLASS} {
        position: fixed !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box !important;
        padding: 0 4px !important;
        min-width: 0 !important;
        height: ${CONFIG.badgeHeightPx}px !important;
        line-height: ${CONFIG.badgeHeightPx}px !important;
        border: 1px solid rgba(128, 128, 128, 0.38) !important;
        border-radius: 5px !important;
        background: rgba(32, 32, 32, 0.88) !important;
        color: rgba(235, 235, 235, 0.88) !important;
        opacity: 0.72 !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        font-size: 9px !important;
        font-weight: 600 !important;
        letter-spacing: 0.02em !important;
        white-space: nowrap !important;
        cursor: copy !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        pointer-events: auto !important;
        transition: opacity 100ms ease, background-color 100ms ease, border-color 100ms ease !important;
      }

      .${BADGE_CLASS}:hover {
        opacity: 0.98 !important;
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
    document.head.appendChild(style);
  }

  function getOverlay() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    return overlay;
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

  function makeBadge(id) {
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.dataset.conversationId = id;
    badge.textContent = `${CONFIG.badgePrefix}${compactId(id)}`;
    badge.title = [
      `Conversation ID: ${id}`,
      'Click: copy full conversation ID',
      `Ctrl/Command-click: copy ${CONFIG.routingPrefix}<ID> routing reference`,
    ].join('\n');

    badge.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const routingRefRequested = event.ctrlKey || event.metaKey;
      const text = routingRefRequested ? `${CONFIG.routingPrefix}${id}` : id;
      const copied = await copyText(text);

      showToast(
        copied
          ? routingRefRequested
            ? `Copied routing ref ${CONFIG.badgePrefix}${compactId(id)}`
            : `Copied conversation ID ${CONFIG.badgePrefix}${compactId(id)}`
          : 'Could not copy conversation ID'
      );
    });

    return badge;
  }

  function usableTitleExists(link) {
    // Read only. Never alter the link. Newly-created ChatGPT rows can have an href
    // before their generated title has settled; keep our overlay hidden until the
    // row has some real visible text.
    const text = (link.innerText || link.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return false;
    return text.toLowerCase() !== 'new chat';
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

  function ensureTracked(link) {
    const id = extractConversationId(link.getAttribute('href') || link.href);
    if (!id) return;

    const current = tracked.get(link);
    if (current?.id === id && current.badge.isConnected) return;

    if (current?.badge) current.badge.remove();

    const badge = makeBadge(id);
    getOverlay().appendChild(badge);
    tracked.set(link, { id, badge });
  }

  function findRowContainer(link) {
    const linkRect = link.getBoundingClientRect();
    let row = link;

    for (let depth = 0; depth < 4 && row.parentElement; depth += 1) {
      const parent = row.parentElement;
      const rect = parent.getBoundingClientRect();
      const rowLike =
        rect.width >= linkRect.width * 0.8 &&
        rect.height >= linkRect.height * 0.8 &&
        rect.height <= Math.max(64, linkRect.height * 1.8);
      if (!rowLike) break;
      row = parent;
    }

    return row;
  }

  function nativeControlLeftEdge(link, linkRect) {
    const row = findRowContainer(link);
    if (!row) return null;

    const minControlX = linkRect.left + linkRect.width * 0.55;
    let leftEdge = null;

    for (const el of row.querySelectorAll('*')) {
      if (el === link || el.closest?.(`#${OVERLAY_ID}`)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6 || rect.width > 48 || rect.height > 48) continue;
      if (rect.left < minControlX || rect.left >= linkRect.right + 2) continue;
      if (rect.bottom <= linkRect.top || rect.top >= linkRect.bottom) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;

      const aria = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-testid') || ''} ${el.className || ''}`;
      const semantic =
        el.tagName === 'BUTTON' ||
        el.tagName === 'SVG' ||
        el.getAttribute('role') === 'button' ||
        el.getAttribute('role') === 'progressbar' ||
        el.getAttribute('aria-busy') === 'true' ||
        /spinner|loading|progress|menu|more|pin/i.test(aria);

      const compactRightSide = rect.left >= linkRect.right - 110;
      if (!semantic && !compactRightSide) continue;

      leftEdge = leftEdge === null ? rect.left : Math.min(leftEdge, rect.left);
    }

    // Hover-only controls may appear after the first pointer event. If the row
    // is hovered but OpenAI has not rendered a measurable control yet, reserve
    // a small fallback lane so our overlay does not prevent it from appearing.
    if (leftEdge === null && (link.matches(':hover') || row.matches?.(':hover'))) {
      return linkRect.right - CONFIG.hoverFallbackLanePx;
    }

    return leftEdge;
  }

  function positionBadges() {
    positionTimer = null;

    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    for (const [link, state] of tracked) {
      const { badge } = state;

      if (!link.isConnected) {
        badge.remove();
        tracked.delete(link);
        continue;
      }

      if (!usableTitleExists(link)) {
        badge.style.display = 'none';
        continue;
      }

      const rect = link.getBoundingClientRect();
      const visible =
        rect.width > 20 &&
        rect.height > 10 &&
        rect.bottom > 0 &&
        rect.top < viewportHeight &&
        rect.right > 0 &&
        rect.left < viewportWidth;

      if (!visible) {
        badge.style.display = 'none';
        continue;
      }

      badge.style.display = 'inline-flex';

      // Measure after display is enabled. Keep the badge at the clean far-right
      // position unless ChatGPT is using that space for native status/actions.
      // When a spinner, pin/status icon, or hover menu is present, put the badge
      // immediately to the left of the left-most native control.
      const badgeWidth = badge.getBoundingClientRect().width || 58;
      const normalLeft = rect.right - badgeWidth - CONFIG.rightInsetPx;
      const controlLeft = nativeControlLeftEdge(link, rect);
      const left = Math.max(
        rect.left + 4,
        controlLeft === null
          ? normalLeft
          : Math.min(normalLeft, controlLeft - CONFIG.nativeControlGapPx - badgeWidth)
      );
      const top = rect.top + Math.max(0, (rect.height - CONFIG.badgeHeightPx) / 2);

      badge.style.left = `${Math.round(left)}px`;
      badge.style.top = `${Math.round(top)}px`;
    }
  }

  function schedulePosition() {
    if (positionTimer !== null) return;
    positionTimer = window.setTimeout(positionBadges, CONFIG.positionDebounceMs);
  }

  function scan() {
    scanTimer = null;
    installStyles();
    getOverlay();

    const liveLinks = collectConversationLinks();

    for (const link of liveLinks) ensureTracked(link);

    for (const [link, state] of tracked) {
      if (!liveLinks.has(link) || !link.isConnected) {
        state.badge.remove();
        tracked.delete(link);
      }
    }

    schedulePosition();
  }

  function scheduleScan() {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, CONFIG.scanDebounceMs);
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    if (!target) return;

    const observer = new MutationObserver(() => {
      // Title text, hrefs, lazy-loaded chats, and sidebar rerenders are all handled
      // by one cheap debounced rescan. No network requests are made.
      scheduleScan();
    });

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

  function startViewportTracking() {
    window.addEventListener('resize', schedulePosition, { passive: true });
    // Capture is required because the sidebar itself is a scrolling element.
    document.addEventListener('scroll', schedulePosition, { passive: true, capture: true });

    // ChatGPT's three-dot menu is hover-driven and may not cause a DOM mutation.
    // Reposition on pointer transitions so the badge yields the native control
    // area as soon as the row is hovered.
    document.addEventListener('pointerover', schedulePosition, { passive: true, capture: true });
    document.addEventListener('pointerout', schedulePosition, { passive: true, capture: true });
  }

  installStyles();
  getOverlay();
  scan();
  startObserver();
  hookSpaNavigation();
  startViewportTracking();
})();
