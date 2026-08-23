// ==UserScript==
// @name         ChatGPT Conversation ID Badges
// @namespace    churchill-ai-tools
// @version      0.5.4
// @updateURL    https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/conversation-id-badges-testing/conversation-id-badges/chatgpt-conversation-id-badges.meta.js
// @downloadURL  https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/conversation-id-badges-testing/conversation-id-badges/chatgpt-conversation-id-badges.user.js
// @description  Shows compact conversation-ID badges in ChatGPT's sidebar and title bar, and restores missing current-chat titles in Project headers. No network/API calls.
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
    activityRefreshDebounceMs: 120,
    badgeWidthPx: 40,
    nativeControlLanePx: 48,
    badgeControlGapPx: 6,
    rightInsetPx: 4,
    extraTitleGapPx: 8,
  });

  const STYLE_ID = 'cgpt-conversation-id-badge-style';
  const TOAST_ID = 'cgpt-conversation-id-badge-toast';
  const HOVER_TOOLTIP_ID = 'cgpt-conversation-id-hover-tooltip';
  const TITLEBAR_ID = 'cgpt-conversation-titlebar-identity';
  const TITLEBAR_BADGE_CLASS = 'cgpt-conversation-titlebar-badge';
  const TITLEBAR_TITLE_CLASS = 'cgpt-conversation-titlebar-title';
  const TITLEBAR_HOST_ATTR = 'data-cgpt-titlebar-host';
  const LEGACY_OVERLAY_ID = 'cgpt-conversation-id-overlay';
  const ATTR = Object.freeze({
    decorated: 'data-cgpt-id-badged',
    conversationId: 'data-cgpt-conversation-id',
    shortId: 'data-cgpt-short-id',
    titleTarget: 'data-cgpt-id-title-target',
  });

  let scanTimer = null;
  let activityRefreshTimer = null;
  let hoveredBadgeLink = null;
  let hoveredTitlebarBadge = null;
  let learnedNativeChatTitleColor = '';
  let titlebarMount = null;

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
        color: rgba(235, 235, 235, 235, 0.88) !important;
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

      #${HOVER_TOOLTIP_ID} {
        position: fixed !important;
        z-index: 2147483647 !important;
        max-width: calc(100vw - 16px) !important;
        padding: 5px 7px !important;
        border: 1px solid rgba(128, 128, 128, 0.45) !important;
        border-radius: 6px !important;
        background: rgba(20, 20, 20, 0.96) !important;
        color: rgba(245, 245, 245, 0.96) !important;
        box-shadow: 0 3px 14px rgba(0, 0, 0, 0.28) !important;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
        font-size: 10px !important;
        line-height: 1.3 !important;
        white-space: nowrap !important;
        pointer-events: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }


      #${TITLEBAR_ID} {
        display: flex !important;
        align-items: center !important;
        justify-content: flex-start !important;
        text-align: left !important;
        flex: 1 1 0 !important;
        min-width: 0 !important;
        width: auto !important;
        max-width: 100% !important;
        overflow: hidden !important;
        margin-left: 7px !important;
        margin-right: auto !important;
        gap: 7px !important;
        position: relative !important;
        z-index: 2 !important;
        vertical-align: middle !important;
        color: inherit !important;
        font: inherit !important;
        line-height: inherit !important;
      }

      #${TITLEBAR_ID} .${TITLEBAR_TITLE_CLASS} {
        display: block !important;
        text-align: left !important;
        flex: 1 1 0 !important;
        min-width: 0 !important;
        width: 100% !important;
        max-width: calc(100% - ${CONFIG.badgeWidthPx + 14}px) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        box-sizing: border-box !important;
        padding: 2px 4px !important;
        border-radius: 5px !important;
        background: var(--main-surface-primary, var(--background-primary, Canvas)) !important;
        color: var(--cgpt-native-chat-title-color, var(--text-secondary, rgba(180, 180, 180, 0.95))) !important;
        opacity: 1 !important;
        font: inherit !important;
        line-height: inherit !important;
        cursor: default !important;
      }

      #${TITLEBAR_ID} .${TITLEBAR_BADGE_CLASS} {
        flex: 0 0 auto !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: ${CONFIG.badgeWidthPx}px !important;
        height: 18px !important;
        box-sizing: border-box !important;
        padding: 0 4px !important;
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
        cursor: copy !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      #${TITLEBAR_ID} .${TITLEBAR_BADGE_CLASS}:hover {
        opacity: 0.94 !important;
        background: rgba(55, 55, 55, 0.96) !important;
        border-color: rgba(160, 160, 160, 0.76) !important;
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

  function hideBadgeTooltip() {
    hoveredBadgeLink = null;
    hoveredTitlebarBadge = null;
    document.getElementById(HOVER_TOOLTIP_ID)?.remove();
  }

  function showBadgeTooltip(link) {
    const id = link.getAttribute(ATTR.conversationId);
    if (!id) {
      hideBadgeTooltip();
      return;
    }

    if (hoveredBadgeLink === link && document.getElementById(HOVER_TOOLTIP_ID)) return;
    hideBadgeTooltip();
    hoveredBadgeLink = link;
    const tooltip = document.createElement('div');
    tooltip.id = HOVER_TOOLTIP_ID;
    tooltip.textContent = id;
    document.body.appendChild(tooltip);
    const bounds = badgeBounds(link);
    const rect = tooltip.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    let left = bounds.right - rect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

    let top = bounds.top - rect.height - gap;
    if (top < margin) top = Math.min(window.innerHeight - rect.height - margin, bounds.bottom + gap);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeSidebarTitleText(value) {
    const normalized = cleanText(value);
    if (!normalized) return '';

    return cleanText(
      normalized
        .replace(/\s*(Pinned|Archived|Selected)\s*$/i, '')
        .replace(/\s,\s*(pinned|archived)\s+conversation\s*$/i, '')
        .replace(/\s+(pinned|archived)\s+conversation\s*$/i, '')
    );
  }

  function isSidebarMetaElement(element) {
    if (!(element instanceof HTMLElement)) return false;

    const className = typeof element.className === 'string' ? element.className : '';
    const testId = element.getAttribute('data-testid') || '';
    const ariaLabel = element.getAttribute('aria-label') || '';
    const text = cleanText(element.textContent);
    const fingerprint = [className, testId, ariaLabel, text].join(' ');

    if (/(pin|pinned|meta|timestamp|time|date|badge|icon)/i.test(fingerprint)) return true;
    return /^(Pinned|Archived|Selected|\d+[smhdwy]\s+ago)$/i.test(text);
  }

  function currentConversationLink(id) {
    if (!id) return null;

    const roots = findSidebarRoots();
    for (const root of roots) {
      const links = root.querySelectorAll('a[href*="/c/"]');
      for (const link of links) {
        if (extractConversationId(link.getAttribute('href') || link.href) === id) return link;
      }
    }

    return null;
  }

  function conversationTitleFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return '';

    const explicit = link.querySelector('[data-testid="conversation-title"], [data-testid="thread-title"]');
    const marquee = link.querySelector('[data-marquee-text]');
    const truncate = link.querySelector('.truncate');

    for (const node of [explicit, marquee, truncate]) {
      if (!(node instanceof HTMLElement) || isSidebarMetaElement(node)) continue;
      const value = normalizeSidebarTitleText(node.textContent);
      if (value && value.toLowerCase() !== 'new chat') return value;
    }

    const candidates = Array.from(link.querySelectorAll('span, div, p'))
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => !isSidebarMetaElement(node))
      .filter((node) => !node.querySelector('button, a, [role="button"], svg, img'))
      .map((node) => normalizeSidebarTitleText(node.textContent))
      .filter((value) => value && value.toLowerCase() !== 'new chat')
      .sort((a, b) => b.length - a.length);

    if (candidates.length) return candidates[0];

    const aria = normalizeSidebarTitleText(link.getAttribute('aria-label') || link.getAttribute('title'));
    if (aria && aria.toLowerCase() !== 'new chat') return aria;

    return '';
  }

  function titleFromDocument(projectText = '') {
    let title = cleanText(document.title);
    if (!title) return '';

    title = title.replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '').trim();
    if (!title || /^ChatGPT$/i.test(title)) return '';

    const project = cleanText(projectText);
    if (project) {
      const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
      for (const separator of separators) {
        const prefix = `${project}${separator}`;
        if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
          title = title.slice(prefix.length).trim();
          break;
        }
      }

      if (title.toLowerCase() === project.toLowerCase()) return '';
    }

    return title;
  }

  function headerTextContainsConversationTitle(nativeText, title) {
    const haystack = cleanText(nativeText).toLowerCase();
    const needle = cleanText(title).toLowerCase();
    if (!Kaystack || !needle) return false;
    if (haystack === needle) return true;

    // For normal multi-word conversation titles, a literal normalized match is
    // stronger than breadcrumb parsing and correctly recognizes ChatGPT's
    // project/title/Work layouts even when separators are nested DOM nodes.
    const wordCount = needle.split(/\s+/)ECB1�ADEHM