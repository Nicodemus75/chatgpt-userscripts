(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    findSidebarRows() {
      const id = this.getConversationId();
      const rows = [];
      const seen = new Set();
      if (id) {
        for (const link of document.querySelectorAll('a[href*="/c/"]')) {
          if (M.conversationId(link.getAttribute('href') || link.href) === id && !seen.has(link)) {
            seen.add(link);
            rows.push(link);
          }
        }
      }
      if (rows.length) return rows;
      for (const el of document.querySelectorAll('aside a[aria-current="page"],nav a[aria-current="page"],aside [data-active="true"],nav [data-active="true"]')) {
        if (!seen.has(el)) { seen.add(el); rows.push(el); }
      }
      return rows;
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
          const v = this.normalizeSidebarTitle(el.textContent);
          if (v && M.norm(v) !== 'new chat') return v;
        }
      }
      return super.bestSidebarTitle(row);
    }

    titleFromDocument(projectText = '') {
      let title = M.clean(document.title)
        .replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '')
        .replace(/,\s*chat\s+in\s+project\s+.+$/i, '')
        .trim();

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
      return title;
    }

    nativeTitlePresentAnywhere(header, title) {
      return this.nativeTitlePresent(header, title);
    }

    firstRightControlLeft(header, titleLane) {
      if (!(header instanceof HTMLElement) || !(titleLane instanceof HTMLElement)) return null;
      const laneRect = titleLane.getBoundingClientRect();
      const controls = Array.from(header.querySelectorAll('button,a[href],[role="button"]'))
        .filter((el) => el instanceof HTMLElement && M.visible(el))
        .filter((el) => !titleLane.contains(el))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.left > laneRect.left + 40)
        .sort((a, b) => a.left - b.left);
      return controls[0]?.left ?? null;
    }
  }

  M.HostAdapter = HostAdapter;
})();
