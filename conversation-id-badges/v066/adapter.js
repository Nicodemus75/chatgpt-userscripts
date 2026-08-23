(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HostAdapter extends M.HostAdapter {
    cleanTitleNoise(value) {
      return M.clean(value)
        .replace(/,\s*chat\s+in\s+project\s+.+$/i, '')
        .replace(/\s+(?:today|yesterday)\s*Work\b.*$/i, '')
        .replace(/\s+\d+\s*(?:seconds?|minutes?|hours?|days?|weeks?|months?)\s+ago\s*Work\b.*$/i, '')
        .replace(/\s+\d+[smhdwy]\s+ago\s*Work\b.*$/i, '')
        .replace(/\s+Work\s*-\s*Churchill\s*\+\d+\s*$/i, '')
        .replace(/\s*\+\d+\s*$/i, '')
        .trim();
    }

    documentConversationTitle(lane) {
      let title = M.clean(document.title)
        .replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '')
        .trim();
      title = this.cleanTitleNoise(title);
      return this.stripVisibleProjectPrefix(title, lane);
    }

    exactConversationTitle(lane) {
      // document.title is generated from ChatGPT's current route state and does
      // not contain Pro Tools/sidebar metadata such as timestamps, Work labels,
      // or "+0" counters. Prefer it for the header title.
      const fromDocument = this.documentConversationTitle(lane);
      if (fromDocument) return fromDocument;

      // Sidebar remains the fallback only. Clean all known UI metadata before
      // allowing it into the header.
      const sidebar = this.cleanTitleNoise(this.finalCleanTitle(this.readSidebarTitle()));
      if (sidebar) return this.stripVisibleProjectPrefix(sidebar, lane);

      return '';
    }
  }

  M.HostAdapter = HostAdapter;
})();
