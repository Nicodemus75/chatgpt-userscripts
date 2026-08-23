(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    cleanTitleNoise(value) {
      return M.clean(value)
        .replace(/,?\s*chat\s+in\s+project\s+.+$/i, '')
        .replace(/(?:today|yesterday)\s*Work\b.*$/i, '')
        .replace(/\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?)\s+ago\s*Work\b.*$/i, '')
        .replace(/\d+[smhdwy]\s+ago\s*Work\b.*$/i, '')
        .replace(/Work\s*-\s*Churchill\s*\+\d+\s*$/i, '')
        .replace(/\+\d+\s*$/i, '')
        .trim();
    }

    stripProjectPrefix(value, lane) {
      let title = M.clean(value);
      if (!title) return '';

      const nativeLaneText = lane instanceof HTMLElement ? M.clean(this.readableText(lane)) : '';
      const visibleProject = nativeLaneText
        .replace(/\s*[\/·•|]\s*Work\b.*$/i, '')
        .replace(/(?:\.\.\.|…)+$/,'')
        .trim();
      const projectStem = M.norm(visibleProject);

      for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
        const idx = title.indexOf(sep);
        if (idx < 1) continue;
        const left = M.norm(title.slice(0, idx));
        if (!projectStem || left === projectStem || left.startsWith(projectStem) || projectStem.startsWith(left)) {
          return M.clean(title.slice(idx + sep.length));
        }
      }
      return title;
    }

    exactSidebarTitle() {
      for (const row of this.findSidebarRows()) {
        // Prefer the actual title leaf. Do NOT prefer data-cgpt-id-title-target:
        // that marker can be on a wider wrapper that also contains Pro Tools metadata.
        for (const sel of [
          '[data-testid="conversation-title"]',
          '[data-testid="thread-title"]',
          '[data-marquee-text]',
          '.truncate'
        ]) {
          const el = row.querySelector?.(sel);
          if (!(el instanceof HTMLElement) || this.isSidebarMeta(el)) continue;
          const value = this.cleanTitleNoise(this.normalizeSidebarTitle(el.textContent));
          if (value && M.norm(value) !== 'new chat') return value;
        }

        // Conservative leaf fallback: text-bearing leaf elements only, excluding
        // known meta/icon/date elements and anything containing controls.
        const leaves = Array.from(row.querySelectorAll?.('span,div,p') || [])
          .filter((el) => el instanceof HTMLElement && !this.isSidebarMeta(el))
          .filter((el) => !el.querySelector('button,a,[role="button"],svg,img'))
          .filter((el) => Array.from(el.children).every((child) => !M.clean(child.textContent)))
          .map((el) => this.cleanTitleNoise(this.normalizeSidebarTitle(el.textContent)))
          .filter((value) => value && M.norm(value) !== 'new chat')
          .sort((a,b) => b.length - a.length);
        if (leaves.length) return leaves[0];
      }
      return '';
    }

    documentConversationTitle(lane) {
      let title = M.clean(document.title)
        .replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '')
        .trim();
      title = this.cleanTitleNoise(title);
      return this.cleanTitleNoise(this.stripProjectPrefix(title, lane));
    }

    exactConversationTitle(lane) {
      // The sidebar's real title leaf is the primary source. The document title
      // is a fallback only, because browser/extension metadata can alter it.
      const sidebar = this.exactSidebarTitle();
      if (sidebar) return this.cleanTitleNoise(this.stripProjectPrefix(sidebar, lane));
      return this.documentConversationTitle(lane);
    }

    nativeTitlePresentAnywhere(header, title) {
      if (!(header instanceof HTMLElement) || !title) return false;
      const clone = header.cloneNode(true);
      clone.querySelectorAll(`#${M.ROOT_ID},[${M.HOST_SLOT_ATTR}="true"]`).forEach((n) => n.remove());
      const native = M.norm(M.clean(clone.textContent));
      const needle = M.norm(title);
      if (!native || !needle) return false;
      return native === needle || native.includes(needle);
    }
  }

  M.HostAdapter = HostAdapter;
})();
