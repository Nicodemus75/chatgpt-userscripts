(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HeaderController {
    constructor(adapter, view) {
      this.adapter = adapter;
      this.view = view;
      this.cleanup = null;
      this.currentId = null;
      this.currentContext = null;
      this.currentLane = null;
      this.currentMode = null;
      this.refreshDebounced = M.debounce(() => this.refresh(), 70);
      this.onWindowResize = () => this.refreshDebounced();
    }

    start() {
      this.cleanup = this.adapter.observeShellChanges(this.refreshDebounced);
      addEventListener('resize', this.onWindowResize, true);
      this.refresh();
    }

    stop() {
      this.cleanup?.();
      this.cleanup = null;
      removeEventListener('resize', this.onWindowResize, true);
      this.view.unmount();
    }

    headerBg(header) {
      if (!(header instanceof HTMLElement)) return '';
      let el = header;
      for (let i = 0; i < 4 && el; i += 1, el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      }
      return '';
    }

    projectTitleColor(header) {
      if (!(header instanceof HTMLElement)) return '';
      const work = Array.from(header.querySelectorAll('span,div')).find((el) => M.visible(el) && /^work$/i.test(M.clean(el.textContent)));
      return work instanceof HTMLElement ? getComputedStyle(work).color : '';
    }

    regularTitleColor(header) {
      if (!(header instanceof HTMLElement)) return '';
      const directText = Array.from(header.querySelectorAll('button,a,[role="button"]')).find((el) => M.visible(el));
      if (directText instanceof HTMLElement) {
        const color = getComputedStyle(directText).color;
        if (color) return color;
      }
      return getComputedStyle(header).color || '';
    }

    topRowControlRects(mountInfo) {
      const root = this.view.root;
      const header = mountInfo?.headerRoot;
      if (!(root instanceof HTMLElement) || !(header instanceof HTMLElement)) return [];
      const rootRect = root.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const top = headerRect.top - 6;
      const bottom = headerRect.bottom + 6;

      return Array.from(document.querySelectorAll('button,a[href],[role="button"]'))
        .filter((el) => el instanceof HTMLElement && M.visible(el) && !root.contains(el))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .filter(({ rect }) => rect.bottom > top && rect.top < bottom)
        .filter(({ rect }) => rect.left > rootRect.left + 44)
        .filter(({ el }) => !el.closest('aside,nav'))
        .sort((a, b) => a.rect.left - b.rect.left)
        .map(({ rect }) => rect);
    }

    safeWidth(mountInfo) {
      const root = this.view.root;
      if (!(root instanceof HTMLElement)) return 0;
      const rootRect = root.getBoundingClientRect();
      const laneRect = mountInfo.titleLane?.getBoundingClientRect?.();
      const headerRect = mountInfo.headerRoot?.getBoundingClientRect?.();
      if (!headerRect) return 0;

      const controls = this.topRowControlRects(mountInfo);
      const firstControlLeft = controls[0]?.left;
      const rightLimit = Math.min(
        Number.isFinite(firstControlLeft) ? firstControlLeft - 16 : Infinity,
        laneRect ? laneRect.right - 8 : Infinity,
        headerRect.right - 180,
        innerWidth - 20
      );
      if (!Number.isFinite(rightLimit)) return 0;
      return Math.max(0, Math.min(Math.floor(rightLimit - rootRect.left), 620));
    }

    overlapsAnyControl(mountInfo, gap = 6) {
      const root = this.view.root;
      if (!(root instanceof HTMLElement)) return false;
      const rr = root.getBoundingClientRect();
      if (rr.width <= 0 || rr.height <= 0) return false;
      return this.topRowControlRects(mountInfo).some((cr) =>
        rr.right + gap > cr.left && rr.left < cr.right + gap && rr.bottom > cr.top && rr.top < cr.bottom
      );
    }

    renderPayload(mountInfo, mode, context, title, id, maxWidth) {
      this.view.render({
        mode,
        context,
        title,
        id,
        tag: this.adapter.currentTag(id),
        maxWidth,
        headerBg: this.headerBg(mountInfo.headerRoot),
        titleColor: this.projectTitleColor(mountInfo.headerRoot),
        regularTitleColor: this.regularTitleColor(mountInfo.headerRoot)
      });
    }

    enforceNoCollision(mountInfo, intendedMode, context, title, id) {
      const root = this.view.root;
      if (!(root instanceof HTMLElement) || !root.isConnected) return;

      if (intendedMode === 'badge-only') {
        this.renderPayload(mountInfo, 'badge-only', context, title, id, 48);
        requestAnimationFrame(() => {
          if (this.overlapsAnyControl(mountInfo, 4)) {
            this.renderPayload(mountInfo, 'hidden', context, title, id, 0);
          }
        });
        return;
      }

      const width = this.safeWidth(mountInfo);
      if (width < 56) {
        this.renderPayload(mountInfo, 'badge-only', context, title, id, 48);
        requestAnimationFrame(() => {
          if (this.overlapsAnyControl(mountInfo, 4)) this.renderPayload(mountInfo, 'hidden', context, title, id, 0);
        });
        return;
      }

      this.renderPayload(mountInfo, 'title-and-badge', context, title, id, width);
      requestAnimationFrame(() => {
        if (!this.overlapsAnyControl(mountInfo, 6)) return;

        const tighter = this.safeWidth(mountInfo);
        if (tighter >= 56) {
          this.renderPayload(mountInfo, 'title-and-badge', context, title, id, tighter);
          requestAnimationFrame(() => {
            if (!this.overlapsAnyControl(mountInfo, 6)) return;
            this.renderPayload(mountInfo, 'badge-only', context, title, id, 48);
            requestAnimationFrame(() => {
              if (this.overlapsAnyControl(mountInfo, 4)) this.renderPayload(mountInfo, 'hidden', context, title, id, 0);
            });
          });
        } else {
          this.renderPayload(mountInfo, 'badge-only', context, title, id, 48);
          requestAnimationFrame(() => {
            if (this.overlapsAnyControl(mountInfo, 4)) this.renderPayload(mountInfo, 'hidden', context, title, id, 0);
          });
        }
      });
    }

    refresh() {
      const mountInfo = this.adapter.findHeaderMount();
      const id = this.adapter.getConversationId();
      const nextLane = mountInfo?.titleLane || null;
      const laneConnected = Boolean(this.currentLane?.isConnected);

      if (!mountInfo || !id || !nextLane) {
        this.view.unmount();
        this.currentId = id;
        this.currentContext = null;
        this.currentLane = null;
        this.currentMode = null;
        return;
      }

      const title = this.adapter.exactConversationTitle(nextLane);
      if (!title) return;

      const context = this.adapter.headerContext(mountInfo.headerRoot, title);
      const nativeComplete =
        this.adapter.nativeTitlePresentAnywhere(mountInfo.headerRoot, title) ||
        (context === 'project' && this.adapter.hasNativeConversationBreadcrumb?.(mountInfo.headerRoot) === true);
      const desiredMode = nativeComplete ? 'badge-only' : 'title-and-badge';

      const remount = this.currentId !== id || this.currentContext !== context || !laneConnected || this.currentLane !== nextLane;
      if (remount) {
        this.view.mount(mountInfo);
        this.currentId = id;
        this.currentContext = context;
        this.currentLane = nextLane;
        this.currentMode = desiredMode;
      } else if (desiredMode === 'badge-only' && this.currentMode !== 'badge-only') {
        // Native ChatGPT titles can appear after the initial route/header mount.
        // Upgrade monotonically to badge-only once the native title becomes
        // available. Never downgrade within the same mounted header, which
        // prevents transient DOM states from re-injecting a duplicate title.
        this.currentMode = 'badge-only';
      }

      this.enforceNoCollision(mountInfo, this.currentMode, context, title, id);
    }
  }

  if (window.__cgptHeaderIdentityControllerV060?.stop) window.__cgptHeaderIdentityControllerV060.stop();
  const adapter = new M.HostAdapter();
  const view = new M.HeaderView();
  const controller = new HeaderController(adapter, view);
  controller.start();
  window.__cgptHeaderIdentityControllerV060 = controller;
})();
