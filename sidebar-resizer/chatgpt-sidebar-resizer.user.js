// ==UserScript==
// @name         ChatGPT Sidebar Resizer
// @namespace    ai-governance.churchill.chatgpt
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/sidebar-resizer/chatgpt-sidebar-resizer.meta.js
// @downloadURL  https://raw.githubusercontent.com/Nicodemus75/chatgpt-userscripts/main/sidebar-resizer/chatgpt-sidebar-resizer.user.js
// @description  Adds a local, persistent resize handle and restrained title wrapping to ChatGPT's left sidebar.
// @author       Churchill / Codex
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = Object.freeze({
    minWidth: 255,
    maxWidth: 650,
    defaultWidth: 390,
    minimumMainWidth: 360,
    desktopMedia: '(min-width: 768px)',
    storageKey: 'chatgpt-sidebar-resizer.width.v1',
  });

  const ATTR = Object.freeze({
    sidebar: 'data-csrr-sidebar',
    wrapItem: 'data-csrr-wrap-item',
    title: 'data-csrr-title',
    titleBox: 'data-csrr-title-box',
    resizing: 'data-csrr-resizing',
  });

  const STYLE_ID = 'csrr-styles';
  const HANDLE_ID = 'csrr-resize-handle';
  const desktopMedia = window.matchMedia(CONFIG.desktopMedia);

  let currentSidebar = null;
  let preferredWidth = readStoredWidth() ?? CONFIG.defaultWidth;
  let reconcileFrame = 0;
  let observer = null;

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
  }

  function currentMaximum() {
    return Math.max(
      CONFIG.minWidth,
      Math.min(CONFIG.maxWidth, window.innerWidth - CONFIG.minimumMainWidth),
    );
  }

  function effectiveWidth(value = preferredWidth) {
    return clamp(value, CONFIG.minWidth, currentMaximum());
  }

  function readStoredWidth() {
    try {
      const value = Number.parseFloat(window.localStorage.getItem(CONFIG.storageKey));
      return Number.isFinite(value)
        ? clamp(value, CONFIG.minWidth, CONFIG.maxWidth)
        : null;
    } catch {
      return null;
    }
  }

  function storePreferredWidth() {
    try {
      window.localStorage.setItem(CONFIG.storageKey, String(Math.round(preferredWidth)));
    } catch {
      // Storage can be unavailable under unusually strict browser settings.
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [${ATTR.sidebar}="true"] {
        position: relative;
      }

      [${ATTR.sidebar}="true"] #${HANDLE_ID} {
        position: absolute;
        z-index: 50;
        top: 0;
        right: 0;
        width: 7px;
        height: 100%;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: col-resize;
        touch-action: none;
      }

      [${ATTR.sidebar}="true"] #${HANDLE_ID}::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 3px;
        width: 1px;
        background: color-mix(in srgb, currentColor 22%, transparent);
        opacity: 0;
        transition: opacity 120ms ease, width 120ms ease, left 120ms ease;
      }

      [${ATTR.sidebar}="true"] #${HANDLE_ID}:hover::before,
      [${ATTR.sidebar}="true"] #${HANDLE_ID}:focus-visible::before,
      html[${ATTR.resizing}="true"] [${ATTR.sidebar}="true"] #${HANDLE_ID}::before {
        left: 2px;
        width: 2px;
        opacity: 0.75;
      }

      [${ATTR.sidebar}="true"] #${HANDLE_ID}:focus-visible {
        outline: 2px solid var(--color-blue-500, #0b57d0);
        outline-offset: -2px;
      }

      [${ATTR.sidebar}="true"]:not([data-state="open"]) #${HANDLE_ID} {
        display: none;
      }

      @media (max-width: 767px) {
        [${ATTR.sidebar}="true"] #${HANDLE_ID} {
          display: none;
        }
      }

      html[${ATTR.resizing}="true"],
      html[${ATTR.resizing}="true"] * {
        cursor: col-resize !important;
        user-select: none !important;
      }

      [${ATTR.sidebar}="true"] [${ATTR.wrapItem}="true"] {
        height: auto !important;
        min-height: 36px !important;
        white-space: normal !important;
      }

      [${ATTR.sidebar}="true"] [${ATTR.titleBox}="true"] {
        min-width: 0 !important;
        height: auto !important;
        max-height: 2.5rem !important;
        overflow: hidden !important;
        white-space: normal !important;
        text-overflow: clip !important;
      }

      [${ATTR.sidebar}="true"] [${ATTR.title}="true"] {
        display: -webkit-box !important;
        width: 100% !important;
        min-width: 0 !important;
        height: auto !important;
        max-height: 2.5rem !important;
        overflow: hidden !important;
        white-space: normal !important;
        text-overflow: clip !important;
        line-height: 1.25rem !important;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      [${ATTR.sidebar}="true"] [${ATTR.title}="true"][data-marquee-text] {
        animation: none !important;
        transform: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isSafeSidebar(element) {
    if (!(element instanceof HTMLElement)) return false;

    const historyNavigation = element.querySelector('nav[aria-label="Chat history"]');
    const closeButton = element.querySelector(
      'button[data-testid="close-sidebar-button"][aria-controls]',
    );

    if (!historyNavigation || !closeButton) return false;

    const controlledId = closeButton.getAttribute('aria-controls');
    const structuralSignal =
      element.id === 'stage-slideover-sidebar'
      || controlledId === element.id
      || element.classList.contains('stage-sidebar-pure-surface');

    return structuralSignal;
  }

  function findSidebar() {
    const primary = document.getElementById('stage-slideover-sidebar');
    if (isSafeSidebar(primary)) return primary;

    const historyNavigation = document.querySelector('nav[aria-label="Chat history"]');
    const fallback = historyNavigation?.closest('[data-state]');
    return isSafeSidebar(fallback) ? fallback : null;
  }

  function isResizableDesktop() {
    return desktopMedia.matches;
  }

  function applyWidth() {
    if (!currentSidebar?.isConnected) return;

    if (!isResizableDesktop()) {
      currentSidebar.style.removeProperty('--sidebar-width');
      updateHandleValue();
      return;
    }

    const width = effectiveWidth();
    currentSidebar.style.setProperty('--sidebar-width', `${Math.round(width)}px`);
    updateHandleValue(width);
  }

  function updateHandleValue(width = effectiveWidth()) {
    const handle = currentSidebar?.querySelector(`#${HANDLE_ID}`);
    if (!handle) return;

    handle.setAttribute('aria-valuemin', String(CONFIG.minWidth));
    handle.setAttribute('aria-valuemax', String(Math.round(currentMaximum())));
    handle.setAttribute('aria-valuenow', String(Math.round(width)));
  }

  function finishPointerResize(handle, pointerId) {
    document.documentElement.removeAttribute(ATTR.resizing);
    if (handle.hasPointerCapture?.(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
    storePreferredWidth();
  }

  function createHandle(sidebar) {
    const existing = sidebar.querySelector(`#${HANDLE_ID}`);
    if (existing) return existing;

    const handle = document.createElement('button');
    handle.id = HANDLE_ID;
    handle.type = 'button';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize ChatGPT sidebar');
    handle.title = 'Drag to resize; double-click to reset';

    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !isResizableDesktop()) return;

      event.preventDefault();
      const sidebarRect = sidebar.getBoundingClientRect();
      const pointerId = event.pointerId;
      handle.setPointerCapture(pointerId);
      document.documentElement.setAttribute(ATTR.resizing, 'true');

      const onPointerMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        preferredWidth = clamp(
          moveEvent.clientX - sidebarRect.left,
          CONFIG.minWidth,
          currentMaximum(),
        );
        applyWidth();
      };

      const onPointerEnd = (endEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerEnd);
        handle.removeEventListener('pointercancel', onPointerEnd);
        handle.removeEventListener('lostpointercapture', onPointerEnd);
        finishPointerResize(handle, pointerId);
      };

      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerEnd);
      handle.addEventListener('pointercancel', onPointerEnd);
      handle.addEventListener('lostpointercapture', onPointerEnd);
    });

    handle.addEventListener('dblclick', (event) => {
      event.preventDefault();
      preferredWidth = CONFIG.defaultWidth;
      storePreferredWidth();
      applyWidth();
    });

    handle.addEventListener('keydown', (event) => {
      let nextWidth = null;

      if (event.key === 'ArrowLeft') nextWidth = effectiveWidth() - 16;
      if (event.key === 'ArrowRight') nextWidth = effectiveWidth() + 16;
      if (event.key === 'Home') nextWidth = CONFIG.minWidth;
      if (event.key === 'End') nextWidth = currentMaximum();
      if (nextWidth === null) return;

      event.preventDefault();
      preferredWidth = clamp(nextWidth, CONFIG.minWidth, currentMaximum());
      storePreferredWidth();
      applyWidth();
    });

    sidebar.appendChild(handle);
    return handle;
  }

  function isTitleRow(item) {
    if (!(item instanceof HTMLElement)) return false;

    const href = item.getAttribute('href') || '';
    const isConversation =
      item.tagName === 'A'
      && item.hasAttribute('data-sidebar-item')
      && /(?:^|\/)c\//.test(href);

    const isProject =
      item.getAttribute('role') === 'button'
      && item.getAttribute('data-sidebar-keep-open') === 'true';

    return isConversation || isProject;
  }

  function markTitleRow(item) {
    if (!isTitleRow(item)) return;

    const title =
      item.querySelector('[data-marquee-text]')
      || Array.from(item.querySelectorAll('[title]')).find(
        (element) => element.getAttribute('title')?.trim(),
      )
      || item.querySelector('.truncate');

    if (!(title instanceof HTMLElement)) return;

    const titleBox = title.matches('[data-marquee-text]')
      ? title.parentElement
      : title;

    item.setAttribute(ATTR.wrapItem, 'true');
    title.setAttribute(ATTR.title, 'true');
    if (titleBox instanceof HTMLElement) {
      titleBox.setAttribute(ATTR.titleBox, 'true');
    }
  }

  function markCurrentTitles(sidebar) {
    const historyNavigation = sidebar.querySelector('nav[aria-label="Chat history"]');
    if (!historyNavigation) return;

    historyNavigation.querySelectorAll('[data-sidebar-item]').forEach(markTitleRow);
  }

  function reconcile() {
    reconcileFrame = 0;
    const sidebar = findSidebar();
    if (!sidebar) return;

    currentSidebar = sidebar;
    sidebar.setAttribute(ATTR.sidebar, 'true');
    createHandle(sidebar);
    markCurrentTitles(sidebar);
    applyWidth();
  }

  function scheduleReconcile() {
    if (reconcileFrame) return;
    reconcileFrame = window.requestAnimationFrame(reconcile);
  }

  function containsRelevantSidebarNode(node) {
    if (!(node instanceof HTMLElement)) return false;

    return node.matches(
      '#stage-slideover-sidebar, nav[aria-label="Chat history"], [data-sidebar-item]',
    ) || Boolean(node.querySelector(
      '#stage-slideover-sidebar, nav[aria-label="Chat history"], [data-sidebar-item]',
    ));
  }

  function observeRelevantChanges() {
    if (!document.body || observer) return;

    observer = new MutationObserver((records) => {
      const relevant = records.some((record) => {
        if (record.type === 'attributes') {
          return record.target === currentSidebar;
        }

        if (currentSidebar?.contains(record.target)) return true;
        return Array.from(record.addedNodes).some(containsRelevantSidebarNode);
      });

      if (relevant) scheduleReconcile();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state'],
    });
  }

  function onViewportChange() {
    scheduleReconcile();
  }

  function onStorage(event) {
    if (event.key !== CONFIG.storageKey) return;
    const storedWidth = readStoredWidth();
    if (storedWidth === null) return;
    preferredWidth = storedWidth;
    applyWidth();
  }

  installStyles();
  observeRelevantChanges();
  window.addEventListener('resize', onViewportChange, { passive: true });
  desktopMedia.addEventListener?.('change', onViewportChange);
  window.addEventListener('storage', onStorage);
  scheduleReconcile();
})();
