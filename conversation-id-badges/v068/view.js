(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  class HeaderView {
    constructor() {
      this.root = null;
      this.title = null;
      this.badge = null;
      this.currentId = null;
      this.installStyles();
    }

    installStyles() {
      let s = document.getElementById(M.STYLE_ID);
      if (!(s instanceof HTMLStyleElement)) {
        s = document.createElement('style');
        s.id = M.STYLE_ID;
        (document.head || document.documentElement).appendChild(s);
      }
      s.textContent = `
        #${M.ROOT_ID}{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;width:auto!important;max-width:100%!important;flex:0 1 auto!important;position:relative!important;gap:7px!important;overflow:hidden!important;white-space:nowrap!important;box-sizing:border-box!important;}
        #${M.ROOT_ID}[data-mode="badge-only"]{flex:0 0 auto!important;width:auto!important;max-width:none!important;margin-left:7px!important;overflow:visible!important;}
        #${M.ROOT_ID} .cgpt-header-title-v068{display:block!important;flex:0 1 auto!important;min-width:0!important;width:auto!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;font:inherit!important;line-height:1.3!important;padding:3px 6px!important;border-radius:6px!important;background:var(--cgpt-header-bg,var(--main-surface-primary,var(--background-primary,Canvas)))!important;color:var(--cgpt-header-title-color,var(--text-secondary,rgba(180,180,180,.95)))!important;opacity:1!important;box-sizing:border-box!important;}
        #${M.ROOT_ID}[data-context="regular"] .cgpt-header-title-v068{color:var(--cgpt-header-regular-title-color,var(--text-primary,rgba(245,245,245,.96)))!important;}
        #${M.ROOT_ID} .cgpt-header-badge-v068{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-width:40px!important;height:18px!important;padding:0 4px!important;box-sizing:border-box!important;border:1px solid rgba(128,128,128,.38)!important;border-radius:5px!important;background:rgba(32,32,32,.88)!important;color:rgba(235,235,235,.88)!important;opacity:.72!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;font-size:9px!important;font-weight:600!important;line-height:16px!important;cursor:copy!important;user-select:none!important;}
        #${M.ROOT_ID} .cgpt-header-badge-v068:hover{opacity:.94!important;background:rgba(55,55,55,.96)!important;border-color:rgba(160,160,160,.76)!important;}
        #${M.TOOLTIP_ID}{position:fixed!important;z-index:2147483647!important;padding:5px 7px!important;border:1px solid rgba(128,128,128,.45)!important;border-radius:6px!important;background:rgba(20,20,20,.96)!important;color:rgba(245,245,245,.96)!important;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;white-space:nowrap!important;pointer-events:none!important;}
      `;
    }

    ensureRoot() {
      if (this.root) return this.root;
      const root = document.createElement('span');
      root.id = M.ROOT_ID;
      root.dataset.version = '0.6.8';
      const title = document.createElement('span');
      title.className = 'cgpt-header-title-v068';
      const badge = document.createElement('span');
      badge.className = 'cgpt-header-badge-v068';
      badge.setAttribute('role', 'button');
      badge.tabIndex = 0;
      badge.addEventListener('mouseenter', () => this.showTooltip());
      badge.addEventListener('mouseleave', () => document.getElementById(M.TOOLTIP_ID)?.remove());
      badge.addEventListener('click', (e) => this.copy(e));
      badge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.copy(e); } });
      root.append(title, badge);
      this.root = root;
      this.title = title;
      this.badge = badge;
      return root;
    }

    mount(mountInfo) {
      const root = this.ensureRoot();
      if (root.parentNode !== mountInfo.titleLane) mountInfo.titleLane.appendChild(root);
      return true;
    }

    render({ mode, context, title, id, tag, maxWidth, headerBg, titleColor, regularTitleColor }) {
      const root = this.ensureRoot();
      this.currentId = id;
      root.dataset.mode = mode;
      root.dataset.context = context || 'regular';
      if (headerBg) root.style.setProperty('--cgpt-header-bg', headerBg);
      if (titleColor) root.style.setProperty('--cgpt-header-title-color', titleColor);
      if (regularTitleColor) root.style.setProperty('--cgpt-header-regular-title-color', regularTitleColor);

      if (mode === 'badge-only') {
        root.style.maxWidth = 'none';
        this.title.hidden = true;
        this.title.textContent = '';
      } else {
        const width = Math.max(0, Number(maxWidth) || 0);
        root.style.maxWidth = `${width}px`;
        this.title.hidden = false;
        this.title.textContent = context === 'project' ? `/ ${title}` : title;
        this.title.title = title || '';
        this.title.style.maxWidth = `${Math.max(0, width - 47)}px`;
      }

      this.badge.textContent = tag;
      this.badge.setAttribute('aria-label', `Copy conversation ID ${id}`);
    }

    unmount() { this.root?.remove(); document.getElementById(M.TOOLTIP_ID)?.remove(); }

    showTooltip() {
      if (!this.badge || !this.currentId) return;
      document.getElementById(M.TOOLTIP_ID)?.remove();
      const t = document.createElement('div');
      t.id = M.TOOLTIP_ID;
      t.textContent = this.currentId;
      document.body.appendChild(t);
      const a = this.badge.getBoundingClientRect(), r = t.getBoundingClientRect(), m = 8, g = 6;
      t.style.left = `${Math.round(Math.max(m, Math.min(a.right-r.width, innerWidth-r.width-m)))}px`;
      let top = a.bottom + g;
      if (top + r.height > innerHeight - m) top = Math.max(m, a.top-r.height-g);
      t.style.top = `${Math.round(top)}px`;
    }

    async copy(event) {
      if (!this.currentId) return;
      const text = event.ctrlKey || event.metaKey ? `${M.ROUTING_PREFIX}${this.currentId}` : this.currentId;
      if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return; } catch {} }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
    }
  }

  M.HeaderView = HeaderView;
})();
