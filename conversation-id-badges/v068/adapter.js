(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    headerContext(header, title) {
      const cleanTitle = M.clean(title);
      if (!cleanTitle) return 'regular';

      // Strongest signal: Project chats use "Project - Conversation" as the
      // browser document title. Ordinary chats use only the conversation title.
      let doc = M.clean(document.title)
        .replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '')
        .replace(/,?\s*chat\s+in\s+project\s+.+$/i, '')
        .trim();

      if (M.norm(doc) === M.norm(cleanTitle)) return 'regular';

      for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
        const suffix = `${sep}${cleanTitle}`;
        if (M.norm(doc).endsWith(M.norm(suffix))) {
          const project = M.clean(doc.slice(0, doc.length - suffix.length));
          if (project) return 'project';
        }
      }

      // Explicit project routes and a complete native Project breadcrumb are
      // secondary signals. Do not use generic "Project" links elsewhere in the
      // page/sidebar: those exist even on ordinary chats.
      if (/\/projects?\//i.test(location.pathname || '')) return 'project';
      if (this.hasNativeConversationBreadcrumb?.(header) === true) return 'project';

      return 'regular';
    }
  }

  M.HostAdapter = HostAdapter;
})();
