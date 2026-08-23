(() => {
  'use strict';
  const M = window.CGPTHeaderV060;
  class HostAdapter {
    getConversationId() { return M.conversationId(); }
    getElementWidth(el) { return el?.getBoundingClientRect?.().width || 0; }
    isStickyHeaderCandidate(el) {
      if (!(el instanceof HTMLElement) || !M.visible(el)) return false;
      const s = getComputedStyle(el);
      return s.position === 'sticky' || s.position === 'fixed' || el.dataset?.sticky === 'true' || Boolean(el.dataset?.testid && /header|toolbar/i.test(el.dataset.testid));
    }
    isConversationToolbarCandidate(el) {
      if (!(el instanceof HTMLElement) || !M.visible(el) || !this.isStickyHeaderCandidate(el)) return false;
      if (el.querySelector('a[href$="#main"], a[href*="#main"]') || /skip to content/i.test(M.clean(el.textContent))) return false;
      return el.querySelectorAll('button, a, [role="button"]').length > 0 && el.getBoundingClientRect().top <= 140;
    }
    pickBestHeaderRoot(candidates) {
      if (!candidates.length) return null;
      return candidates.map((el) => {
        const s = getComputedStyle(el);
        let score = this.getElementWidth(el) + (el.children?.length || 0) * 10 + el.querySelectorAll('button, a, [role="button"]').length * 4;
        if (s.position === 'sticky' || s.position === 'fixed') score += 80;
        if (el.querySelector('button')) score += 20;
        return { el, score };
      }).sort((a,b) => b.score - a.score)[0].el;
    }
    findHeaderRoot() {
      const candidates = [], seen = new Set();
      for (const button of Array.from(document.querySelectorAll('button')).filter((b) => /share/i.test(M.clean(b.textContent || b.getAttribute('aria-label'))))) {
        let el = button.parentElement;
        while (el && el !== document.body) {
          if (this.isConversationToolbarCandidate(el) && !seen.has(el)) { seen.add(el); candidates.push(el); }
          el = el.parentElement;
        }
      }
      if (candidates.length) return this.pickBestHeaderRoot(candidates);
      for (const sel of ['[data-testid="conversation-header"]','[data-testid="thread-header"]','[data-testid="chat-toolbar"]','[data-testid="conversation-toolbar"]','main > header']) {
        const el = document.querySelector(sel);
        if (el && !seen.has(el) && this.isConversationToolbarCandidate(el)) { seen.add(el); candidates.push(el); }
      }
      for (const el of document.querySelectorAll('header,[role="banner"]')) if (!seen.has(el) && this.isConversationToolbarCandidate(el)) { seen.add(el); candidates.push(el); }
      return this.pickBestHeaderRoot(candidates);
    }
    findActions(header) {
      for (const sel of ['[data-testid="conversation-header-actions"]','[data-testid="thread-actions"]','[aria-label*="Chat actions"]','[aria-label*="Conversation actions"]']) {
        const el = header.querySelector(sel); if (el) return el;
      }
      const groups = Array.from(header.querySelectorAll('div,section')).filter((el) => el.querySelector('button,a,[role="button"]'));
      if (!groups.length) return null;
      if (groups.length === 1) {
        const only = groups[0], direct = Array.from(header.children || []), i = direct.indexOf(only);
        if (only.parentNode === header && i !== -1 && i < direct.length - 1) return null;
      }
      return groups[groups.length - 1];
    }
    findLeadingControl(header, actions) {
      for (const child of Array.from(header.children || []).filter((c) => c && c !== actions && !c.hasAttribute(M.HOST_SLOT_ATTR) && !M.isSkipLink(c))) {
        if (M.isInteractive(child) || child.querySelector?.('button,a[href],[role="button"]')) return child;
      }
      return null;
    }
    findTitleLane(header, actions) {
      if (header?.id === 'page-header') {
        const lane = Array.from(header.children || []).find((child) => {
          if (!child || child === actions || M.isInteractive(child) || M.isSkipLink(child)) return false;
          const cls = typeof child.className === 'string' ? child.className : '';
          const buttons = child.querySelectorAll?.('button,a[href],[role="button"]').length || 0;
          return /flex-1/.test(cls) && /items-center/.test(cls) && buttons === 0;
        });
        if (lane) return lane;
      }
      for (const sel of ['[data-testid="conversation-title-slot"]','[data-testid="thread-title-slot"]','[data-testid="conversation-title"]','[data-testid="thread-title"]','.title-lane','.conversation-title','.thread-title','[aria-label*="Conversation title"]']) {
        const el = header.querySelector(sel); if (el && el !== actions && !M.isInteractive(el)) return el;
      }
      const children = Array.from(header.children || []).filter((c) => c !== actions && !M.isSkipLink(c));
      const explicit = children.find((c) => !M.isInteractive(c) && (/title/i.test(typeof c.className === 'string' ? c.className : '') || /title/i.test(c.getAttribute?.('data-testid') || '')));
      if (explicit) return explicit;
      return children.map((child) => {
        const r = child.getBoundingClientRect?.() || {width:0}, s = getComputedStyle(child), buttons = child.querySelectorAll?.('button,a,[role="button"]').length || 0;
        let score = r.width + (parseFloat(s.flexGrow || '0') || 0) * 100;
        if (M.isInteractive(child)) score -= 500; if (buttons === 0) score += 50; else if (buttons < 2) score += 20; if (!M.clean(child.textContent)) score += 10;
        return {child,score};
      }).sort((a,b) => b.score - a.score)[0]?.child || null;
    }
    ensureSafeTitleLane(header, candidate, actions, surface) {
      if (candidate && !M.isInteractive(candidate)) return candidate;
      const leading = this.findLeadingControl(header, actions);
      const preferLeading = surface === 'regular' && leading?.parentNode === header;
      let slot = header.querySelector(`[${M.HOST_SLOT_ATTR}="true"]`);
      if (!slot) {
        slot = document.createElement('div'); slot.className = 'cgpt-header-host-slot'; slot.setAttribute(M.HOST_SLOT_ATTR,'true');
        Object.assign(slot.style,{display:'flex',alignItems:'center',justifyContent:'flex-start',flex:'1 1 auto',minWidth:'0',marginRight:'auto',overflow:'hidden'});
      }
      if (preferLeading && leading?.parentNode === header) { if (slot.previousSibling !== leading) header.insertBefore(slot, leading.nextSibling); }
      else if (actions?.parentNode === header) { if (slot.nextSibling !== actions) header.insertBefore(slot, actions); }
      else if (leading?.parentNode === header) { if (slot.previousSibling !== leading) header.insertBefore(slot, leading.nextSibling); }
      else if (slot.parentNode !== header) header.insertBefore(slot, header.firstChild);
      return slot;
    }
    findHeaderMount() {
      const headerRoot = this.findHeaderRoot(); if (!headerRoot) return null;
      const actionsLane = this.findActions(headerRoot), surface = M.surface(), preferred = this.findTitleLane(headerRoot, actionsLane);
      const titleLane = this.ensureSafeTitleLane(headerRoot, preferred, actionsLane, surface);
      return {headerRoot,titleLane:titleLane || headerRoot,actionsLane:actionsLane || null,surface};
    }
    findSidebarRows() {
      const id = this.getConversationId(), rows = [], seen = new Set();
      if (id) for (const link of document.querySelectorAll('aside a[href],nav a[href]')) { const href = link.getAttribute('href') || ''; if (href.includes(id) && !seen.has(link)) {seen.add(link);rows.push(link);} }
      if (rows.length) return rows;
      for (const el of document.querySelectorAll('aside a[aria-current="page"],nav a[aria-current="page"],aside [data-active="true"],nav [data-active="true"]')) if (!seen.has(el)) {seen.add(el);rows.push(el);}
      return rows;
    }
    normalizeSidebarTitle(text) { return M.clean(M.clean(text).replace(/\s*(Pinned|Archived|Selected)\s*$/i,'').replace(/\s*,?\s*(pinned|archived)\s+conversation\s*$/i,'')); }
    isSidebarMeta(el) {
      if (!el?.getAttribute) return false;
      const fp = [typeof el.className === 'string' ? el.className : '',el.getAttribute('data-testid')||'',el.getAttribute('aria-label')||'',M.clean(el.textContent)].join(' ');
      return /(pin|pinned|meta|timestamp|time|date|badge|icon)/i.test(fp) || /^(Pinned|Archived|Selected|\d+[smhdwy]\s+ago)$/i.test(M.clean(el.textContent));
    }
    bestSidebarTitle(row) {
      for (const sel of ['[data-testid="conversation-title"]','[data-testid="thread-title"]','[data-marquee-text]','.truncate']) {
        const el = row.querySelector?.(sel); if (el && !this.isSidebarMeta(el)) { const v = this.normalizeSidebarTitle(el.textContent); if (v && M.norm(v) !== 'new chat') return v; }
      }
      const vals = Array.from(row.querySelectorAll?.('span,div,p') || []).filter((el) => !this.isSidebarMeta(el) && el.children.length <= 1 && !el.querySelector('button,a,[role="button"],svg,img')).map((el)=>this.normalizeSidebarTitle(el.textContent)).filter((v)=>v && M.norm(v)!=='new chat').sort((a,b)=>b.length-a.length);
      if (vals.length) return vals[0];
      const aria = this.normalizeSidebarTitle(row.getAttribute?.('aria-label') || row.getAttribute?.('title')); return aria && M.norm(aria)!=='new chat' ? aria : '';
    }
    readSidebarTitle() { for (const row of this.findSidebarRows()) { const t = this.bestSidebarTitle(row); if (t) return t; } return ''; }
    readableText(el) {
      if (!(el instanceof HTMLElement)) return '';
      const clone = el.cloneNode(true); clone.querySelectorAll(`button,a,input,textarea,svg,img,[role="button"],[${M.HOST_SLOT_ATTR}="true"],#${M.ROOT_ID}`).forEach((n)=>n.remove()); return M.clean(clone.textContent);
    }
    titleFromDocument(projectText='') {
      let title = M.clean(document.title).replace(/\s+[-–—|]\s+ChatGPT\s*$/i,'').trim(), project = M.clean(projectText);
      if (project) for (const sep of [' - ',' – ',' — ',' | ',' / ']) { const prefix = `${project}${sep}`; if (M.norm(title).startsWith(M.norm(prefix))) { title=title.slice(prefix.length).trim(); break; } }
      return project && M.norm(title)===M.norm(project) ? '' : title;
    }
    nativeTitlePresent(lane,title) {
      const laneText=M.norm(this.readableText(lane)), needle=M.norm(title); if (!laneText || !needle) return false;
      if (laneText===needle) return true; if (needle.length>=8 && needle.split(/\s+/).length>=2 && laneText.includes(needle)) return true;
      return laneText.split(/\s*[\/·|]\s*/).map(M.clean).some((part)=>M.norm(part)===needle);
    }
    currentTag(id) {
      for (const row of this.findSidebarRows()) { const e=M.clean(row.getAttribute?.('data-cgpt-short-id')); if(e) return e.startsWith('#')?e:`#${e}`; }
      let hash=14695981039346656037n, prime=1099511628211n; for(let i=0;i<id.length;i++){hash^=BigInt(id.charCodeAt(i));hash=BigInt.asUintN(64,hash*prime);} let value=hash, encoded=''; do{encoded=M.TAG_ALPHABET[Number(value&31n)]+encoded;value>>=5n;}while(value>0n); return `#${encoded.padStart(13,'0').slice(0,4)}`;
    }
    installNavigation(onNavigate) {
      const push=history.pushState, replace=history.replaceState, wrap=(original)=>function(...args){const r=original.apply(history,args);onNavigate();return r;};
      const wp=typeof push==='function'?wrap(push):null, wr=typeof replace==='function'?wrap(replace):null; if(wp)history.pushState=wp;if(wr)history.replaceState=wr;addEventListener('popstate',onNavigate,true);
      return()=>{removeEventListener('popstate',onNavigate,true);if(wp&&history.pushState===wp)history.pushState=push;if(wr&&history.replaceState===wr)history.replaceState=replace;};
    }
    observeShellChanges(callback) {
      const debounced=M.debounce(callback,50); let locationKey=`${location.pathname}${location.search}${location.hash}`;
      const navCleanup=this.installNavigation(()=>{const next=`${location.pathname}${location.search}${location.hash}`;if(next!==locationKey){locationKey=next;debounced();}});
      const observer=new MutationObserver((mutations)=>{
        const rows=this.findSidebarRows(), header=this.findHeaderRoot();
        for(const mutation of mutations){const target=mutation.target;if(target?.closest?.(`#${M.ROOT_ID},[${M.HOST_SLOT_ATTR}="true"]`))continue;
          if(header && target instanceof Node && header.contains(target)){debounced();return;}
          if(target?.closest?.('aside,nav')){debounced();return;}
          const nodes=[...Array.from(mutation.addedNodes||[]),...Array.from(mutation.removedNodes||[])];
          if(nodes.some((node)=>node instanceof Element && (rows.some((row)=>row===node||row?.contains?.(node)) || node.matches?.('header,[role="banner"],aside,nav,a[href*="/c/"]') || node.querySelector?.('header,[role="banner"],a[href*="/c/"]')))){debounced();return;}
        }
      });
      observer.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','href','aria-current']});
      return()=>{debounced.cancel();observer.disconnect();navCleanup();};
    }
  }
  M.HostAdapter = HostAdapter;
})();
