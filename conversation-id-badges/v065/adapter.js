(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    stripVisibleProjectPrefix(value, lane) {
      let title = M.clean(value);
      if (!title || !(lane instanceof HTMLElement)) return title;

      // Read only ChatGPT's native lane text; our own header UI is excluded by readableText().
      const visibleProject = M.clean(this.readableText(lane))
        .replace(/\s*[\/·•|]\s*Work\b.*$/i, '')
        .trim();
      if (!visibleProject) return title;

      const projectStem = M.norm(visibleProject.replace(/(?:\.\.\.|…)+$/,'').trim());
      if (!projectStem) return title;

      for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
        const index = title.indexOf(sep);
        if (index < 1) continue;
        const left = M.norm(title.slice(0, index));
        if (left === projectStem || left.startsWith(projectStem) || projectStem.startsWith(left)) {
          return M.clean(title.slice(index + sep.length));
        }
      }
      return title;
    }

    exactConversationTitle(lane) {
      // Prefer the exact current sidebar title. With the stable sidebar badge script
      // active, data-cgpt-id-title-target points at the actual title text and avoids
      // timestamps/Work/project metadata.
      const sidebar = this.finalCleanTitle(this.readSidebarTitle());
      if (sidebar) return this.stripVisibleProjectPrefix(sidebar, lane);

      const fallback = this.finalCleanTitle(this.exactTitleFromDocument(this.readableText(lane)));
      return this.stripVisibleProjectPrefix(fallback, lane);
    }
  }

  M.HostAdapter = HostAdapter;
})();
