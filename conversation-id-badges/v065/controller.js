(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HeaderController {
    constructor(adapter, view) {
      this.adapter = adapter;
      this.view = view;
      this.cleanup = null;
      this.currentId = null;
      this.currentSurface = null;
      this.currentLane = null;
      this.currentMode = null;
      this.refreshDebounced = M.debounce(() => this.refresh(), 70);
    }

    start() { this.cleanup = this.adapter.observeShellChanges(this.refreshDebounced); this.refresh(); }
    stop() { this.cleanup?.(); this.cleanup = null; this.view.unmount(); }

    headerBg(header) {
      if (!(header instanceof HTMLElement)) return '';
      let el = header;
      for (let i = 0; i < 4 && el; i += 1, el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      }
      return '';
    }

    titleColor(header) {
      if (!(header instanceof HTMLElement)) return '';
      const work = Array.from(header.querySelectorAll('span,div')).find((el) => M.visible(el) && /^work$/i.test(M.clean(el.textContent)));
      return work instanceof HTMLElement ? getComputedStyle(work).color : '';
    }

    safeWidth(mountInfo) {
      const root = this.view.root;
      if (!(root instanceof HTMLElement)) return 0;
      const rootRect = root.getBoundingClientRect();
      const laneRect = mountInfo.titleLane?.getBoundingClientRect?.();
      const headerRect = mountInfo.headerRoot?.getBoundingClientRect?.();
      if (!headerRect) return 0;
      const controls = Array.from(mountInfo.headerRoot.querySelectorAll('button,a[href],[role="button"]'))
        .filter((el) => el instanceof HTMLElement && M.visible(el) && !root.contains(el))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.left > rootRect.left + 50)
        .sort((a,b) => a.left - b.left);
      const firstControlLeft = controls[0]?.left;
      const rightLimit = Math.min(
        Number.isFinite(firstControlLeft) ? firstControlLeft - 18 : Infinity,
        laneRect ? laneRect.right - 8 : Infinity,
        headerRect.right - 260,
        innerWidth - 20
      );
      if (!Number.isFinite(rightLimit)) return 0;
      return Math.max(0, Math.min(Math.floor(rightLimit - rootRect.left), 620));
    }

    refresh() {
      const mountInfo = this.adapter.findHeaderMount();
      const id = this.adapter.getConversationId();
      const surface = M.surface();
      const nextLane = mountInfo?.titleLane || null;
      const laneConnected = Boolean(this.currentLane?.isConnected);

      if (!mountInfo || !id || !nextLane) {
        this.view.unmount();
        this.currentId = id;
        this.currentSurface = surface;
        this.currentLane = null;
        this.currentMode = null;
        return;
      }

      const nativeComplete = this.adapter.hasNativeConversationBreadcrumb(mountInfo.headerRoot);
      const title = this.adapter.exactConversationTitle(nextLane);
      if (!title && !nativeComplete) return;

      const remount = this.currentId !== id || this.currentSurface !== surface || !laneConnected || this.currentLane !== nextLane;
      if (remount) {
        this.view.mount(mountInfo);
        this.currentId = id;
        this.currentSurface = surface;
        this.currentLane = nextLane;
        this.currentMode = nativeComplete ? 'badge-only' : 'title-and-badge';
      }

      const renderNow = () => {
        const maxWidth = this.currentMode === 'badge-only' ? 48 : this.safeWidth(mountInfo);
        this.view.render({
          mode: this.currentMode,
          title: title || '',
          id,
          tag: this.adapter.currentTag(id),
          maxWidth,
          headerBg: this.headerBg(mountInfo.headerRoot),
          titleColor: this.titleColor(mountInfo.headerRoot)
        });
      };

      renderNow();
      requestAnimationFrame(renderNow);
    }
  }

  if (window.__cgptHeaderIdentityControllerV060?.stop) window.__cgptHeaderIdentityControllerV060.stop();
  const adapter = new M.HostAdapter();
  const view = new M.HeaderView();
  const controller = new HeaderController(adapter, view);
  controller.start();
  window.__cgptHeaderIdentityControllerV060 = controller;
})();
