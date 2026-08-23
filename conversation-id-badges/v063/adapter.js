(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    cleanConversationTitle(value) {
      return M.clean(value)
        .replace(/\s*,?\s*chat\s+in\s+(?:the\s+)?project\s+.+$/i, '')
        .replace(/\s*[-–—|]\s*ChatGPT\s*$/i, '')
        .trim();
    }

    normalizeSidebarTitle(text) {
      const base = super.normalizeSidebarTitle(text);
      return this.cleanConversationTitle(base);
    }

    bestSidebarTitle(row) {
      for (const sel of [
        '[data-cgpt-id-title-target="true"]',
        '[data-testid="conversation-title"]',
        '[data-testid="thread-title"]',
        '[data-marquee-text]',
        '.truncate'
      ]) {
        const el = row.querySelector?.(sel);
        if (el && !this.isSidebarMeta(el)) {
          const v = this.cleanConversationTitle(this.normalizeSidebarTitle(el.textContent));
          if (v && M.norm(v) !== 'new chat') return v;
        }
      }
      return this.cleanConversationTitle(super.bestSidebarTitle(row));
    }

    titleFromDocument(projectText = '') {
      let title = this.cleanConversationTitle(document.title);
      const project = M.clean(projectText);
      if (project) {
        for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
          const prefix = `${project}${sep}`;
          if (M.norm(title).startsWith(M.norm(prefix))) {
            title = title.slice(prefix.length).trim();
            break;
          }
        }
        if (M.norm(title) === M.norm(project)) return '';
      }
      return this.cleanConversationTitle(title);
    }

    nativeTitlePresentAnywhere(header, title) {
      return this.nativeTitlePresent(header, this.cleanConversationTitle(title));
    }

    firstRightControlLeft(header, titleLane, rootLeft = null) {
      if (!(header instanceof HTMLElement)) return null;
      const hr = header.getBoundingClientRect();
      const leftFloor = Number.isFinite(rootLeft) ? rootLeft + 120 : hr.left + hr.width * 0.48;
      const controls = Array.from(header.querySelectorAll('button,a[href],[role="button"]'))
        .filter((el) => el instanceof HTMLElement && M.visible(el))
        .filter((el) => !el.closest?.(`#${M.ROOT_ID}`))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0)
        .filter(({ r }) => r.bottom >= hr.top && r.top <= hr.bottom)
        .filter(({ r }) => r.left > leftFloor)
        .sort((a, b) => a.r.left - b.r.left);
      return controls[0]?.r.left ?? null;
    }
  }

  M.HostAdapter = HostAdapter;
})();
