(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    cleanHeaderTextWithoutOurUI(header) {
      if (!(header instanceof HTMLElement)) return '';
      const clone = header.cloneNode(true);
      clone.querySelectorAll(`#${M.ROOT_ID},[${M.HOST_SLOT_ATTR}="true"]`).forEach((n) => n.remove());
      return M.clean(clone.textContent);
    }

    hasNativeConversationBreadcrumb(header) {
      const text = this.cleanHeaderTextWithoutOurUI(header);
      if (!text) return false;
      // Native complete Project headers visibly contain a breadcrumb separator
      // between project and conversation title. Project-only headers do not.
      if (/\S\s*\/\s*\S/.test(text)) return true;
      // Alternate native rendering uses a middle dot before Work after the title.
      if (/\S\s*[·•]\s*Work\b/i.test(text) && text.trim().split(/\s+/).length >= 3) return true;
      return false;
    }

    exactTitleFromDocument(projectText = '') {
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

    finalCleanTitle(value) {
      return M.clean(value)
        .replace(/,\s*chat\s+in\s+project\s+.+$/i, '')
        .replace(/\s+(?:\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?)\s+ago).*$/i, '')
        .replace(/\s+(?:\d+[smhdwy]\s+ago).*$/i, '')
        .trim();
    }
  }

  M.HostAdapter = HostAdapter;
})();
