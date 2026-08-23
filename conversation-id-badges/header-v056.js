(() => {
  'use strict';

  const MOUNT_ID = 'cgpt-header-conversation-identity';
  const SLOT_ATTR = 'data-cgpt-header-host-slot';
  const STYLE_ID = 'cgpt-header-conversation-style';
  const TOOLTIP_ID = 'cgpt-header-conversation-tooltip';
  const TITLE_CLASS = 'cgpt-header-conversation-title';
  const BADGE_CLASS = 'cgpt-header-conversation-badge';
  const ROUTING_PREFIX = 'CHATGPT:CLOUD:';
  const TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timer = null;
  let resizeObserver = null;
  let observedHeader = null;

  const clean = (v) => (v || '').replace(/\s+/g, ' ').trim();
  const norm = (v) => clean(v).toLocaleLowerCase();

  function visible(el) {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || '1') > 0;
  }

  function conversationId(href = location.href) {
    try {
      const u = new URL(href, location.origin);
      const m = u.pathname.match(/\/c\/([^/?#]+)/i);
      if (!m) return null;
      const id = decodeURIComponent(m[1]).trim();
      return /^[A-Za-z0-9_-]{16,}$/.test(id) ? id : null;
    } catch { return null; }
  }

  function currentLink(id) {
    if (!id) return null;
    return Array.from(document.querySelectorAll('a[href*="/c/"]')).find((a) => conversationId(a.getAttribute('href') || a.href) === id) || null;
  }

  function titleFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return '';
    for (const sel of ['[data-testid="conversation-title"]','[data-testid="thread-title"]','[data-marquee-text]','.truncate']) {
      const el = link.querySelector(sel);
      const t = clean(el?.textContent);
      if (t && norm(t) !== 'new chat') return t;
    }
    const aria = clean(link.getAttribute('aria-label') || link.getAttribute('title'));
    if (aria && norm(aria) !== 'new chat') return aria;
    return '';
  }

  function titleFromDocument(projectText) {
    let t = clean(document.title).replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '').trim();
    const p = clean(projectText);
    if (p) {
      for (const sep of [' - ', ' – ', ' — ', ' | ', ' / ']) {
        const prefix = `${p}${sep}`;
        if (norm(t).startsWith(norm(prefix))) { t = t.slice(prefix.length).trim(); break; }
      }
      if (norm(t) === norm(p)) return '';
    }
    return t;
  }

  function findHeader() {
    const page = document.querySelector('#page-header');
    if (page instanceof HTMLElement && visible(page)) return page;
    const share = Array.from(document.querySelectorAll('button,[role="button"]')).find((el) => {
      if (!(el instanceof HTMLElement) || !visible(el)) return false;
      return /^share$/i.test(clean(el.getAttribute('aria-label') || el.textContent));
    });
    const header = share?.closest('header');
    if (header instanceof HTMLElement && visible(header)) return header;
    return Array.from(document.querySelectorAll('header')).find((el) => {
      if (!(el instanceof HTMLElement) || !visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.top <= 20 && r.height >= 32 && r.height <= 110 && r.width >= 400;
    }) || null;
  }

  function isInteractive(el) {
    if (!(el instanceof HTMLElement)) return false;
    return el.matches('a,button,[role="button"],[role="link"]');
  }

  function findActionsLane(header) {
    for (const sel of ['[data-testid="conversation-header-actions"]','[data-testid="thread-actions"]','[aria-label*="Chat actions"]','[aria-label*="Conversation actions"]']) {
      const el = header.querySelector(sel);
      if (el instanceof HTMLElement) return el;
    }
    const groups = Array.from(header.querySelectorAll('div,section')).filter((el) => el.querySelector('button,a,[role="button"]'));
    return groups.length ? groups[groups.length - 1] : null;
  }

  function findTitleLane(header, actions) {
    if (header.id === 'page-header') {
      const lane = Array.from(header.children).find((child) => {
        if (!(child instanceof HTMLElement) || child === actions || isInteractive(child)) return false;
        const cls = typeof child.className === 'string' ? child.className : '';
        const buttons = child.querySelectorAll('button,a[href],[role="button"]').length;
        return /flex-1/.test(cls) && /items-center/.test(cls) && buttons === 0;
      });
      if (lane instanceof HTMLElement) return lane;
    }
    for (const sel of ['[data-testid="conversation-title-slot"]','[data-testid="thread-title-slot"]','[data-testid="conversation-title"]','[data-testid="thread-title"]']) {
      const el = header.querySelector(sel);
      if (el instanceof HTMLElement && el !== actions && !isInteractive(el)) return el;
    }
    return null;
  }

  function ensureSafeLane(header, candidate, actions) {
    if (candidate && !isInteractive(candidate)) return candidate;
    let slot = header.querySelector(`[${SLOT_ATTR}="true"]`);
    if (!(slot instanceof HTMLElement)) {
      slot = document.createElement('div');
      slot.setAttribute(SLOT_ATTR, 'true');
      Object.assign(slot.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        flex: '1 1 auto', minWidth: '0', marginRight: 'auto', overflow: 'hidden'
      });
    }
    if (actions?.parentNode === header) {
      if (slot.nextSibling !== actions) header.insertBefore(slot, actions);
    } else if (slot.parentNode !== header) {
      header.appendChild(slot);
    }
    return slot;
  }

  function nativeTitleNode(lane, title) {
    const n = norm(title);
    if (!n) return null;
    const candidates = Array.from(lane.querySelectorAll('span,div,a,button'))
      .filter((el) => el instanceof HTMLElement && visible(el) && !el.closest(`#${MOUNT_ID}`))
      .filter((el) => norm(el.textContent) === n)
      .sort((a,b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
    return candidates[0] || null;
  }

  function projectTextFromLane(lane, title) {
    const n = norm(title);
    const candidates = Array.from(lane.querySelectorAll('span,div,a,button'))
      .filter((el) => el instanceof HTMLElement && visible(el) && !el.closest(`#${MOUNT_ID}`))
      .map((el) => clean(el.textContent))
      .filter((t) => t && norm(t) !== n && !/^(work|share)$/i.test(t))
      .sort((a,b) => b.length - a.length);
    return candidates[0] || clean(lane.textContent);
  }

  function shortTag(id, link) {
    const existing = clean(link?.getAttribute('data-cgpt-short-id'));
    if (existing) return existing.startsWith('#') ? existing : `#${existing}`;
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let i=0;i<id.length;i+=1) { hash ^= BigInt(id.charCodeAt(i)); hash = BigInt.asUintN(64, hash * prime); }
    let value = hash, encoded = '';
    do { encoded = TAG_ALPHABET[Number(value & 31n)] + encoded; value >>= 5n; } while (value > 0n);
    return `#${encoded.padStart(13,'0').slice(0,4)}`;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${MOUNT_ID}{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;max-width:720px!important;overflow:hidden!important;flex:0 1 auto!important;margin-left:7px!important;gap:7px!important;white-space:nowrap!important;}
      #${MOUNT_ID} .${TITLE_CLASS}{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;flex:0 1 auto!important;min-width:0!important;width:auto!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;font:inherit!important;line-height:inherit!important;}
      #${MOUNT_ID} .${BADGE_CLASS}{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-width:40px!important;height:18px!important;padding:0 4px!important;box-sizing:border-box!important;border:1px solid rgba(128,128,128,.38)!important;border-radius:5px!important;background:rgba(32,32,32,.88)!important;color:rgba(235,235,235,.88)!important;opacity:.72!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;font-size:9px!important;font-weight:600!important;line-height:16px!important;cursor:copy!important;user-select:none!important;}
      #${MOUNT_ID} .${BADGE_CLASS}:hover{opacity:.94!important;background:rgba(55,55,55,.96)!important;border-color:rgba(160,160,160,.76)!important;}
      #${TOOLTIP_ID}{position:fixed!important;z-index:2147483647!important;padding:5px 7px!important;border:1px solid rgba(128,128,128,.45)!important;border-radius:6px!important;background:rgba(20,20,20,.96)!important;color:rgba(245,245,245,.96)!important;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;white-space:nowrap!important;pointer-events:none!important;}
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
      let ok=false; try { ok=document.execCommand('copy'); } catch { ok=false; } ta.remove(); return ok;
    }
  }

  function tooltip(anchor, text) {
    document.getElementById(TOOLTIP_ID)?.remove();
    if (!(anchor instanceof HTMLElement) || !text) return;
    const tip = document.createElement('div'); tip.id=TOOLTIP_ID; tip.textContent=text; document.body.appendChild(tip);
    const a=anchor.getBoundingClientRect(), t=tip.getBoundingClientRect(), m=8, g=6;
    tip.style.left=`${Math.round(Math.max(m,Math.min(a.right-t.width,innerWidth-t.width-m)))}px`;
    let top=a.bottom+g; if(top+t.height>innerHeight-m) top=Math.max(m,a.top-t.height-g); tip.style.top=`${Math.round(top)}px`;
  }

  function makeBadge(id, tag) {
    const b=document.createElement('span'); b.className=BADGE_CLASS; b.textContent=tag; b.dataset.conversationId=id;
    b.addEventListener('mouseenter',()=>tooltip(b,id)); b.addEventListener('mouseleave',()=>document.getElementById(TOOLTIP_ID)?.remove());
    b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();void copyText(e.ctrlKey||e.metaKey?`${ROUTING_PREFIX}${id}`:id);});
    return b;
  }

  function observeHeader(header) {
    if (observedHeader===header && resizeObserver) return;
    resizeObserver?.disconnect(); observedHeader=header; resizeObserver=new ResizeObserver(()=>schedule()); resizeObserver.observe(header);
  }

  function sync() {
    timer=null; installStyles();
    const id=conversationId();
    if(!id){document.getElementById(MOUNT_ID)?.remove();return;}
    const header=findHeader(); if(!header)return; observeHeader(header);
    const actions=findActionsLane(header); const lane=ensureSafeLane(header,findTitleLane(header,actions),actions); if(!lane)return;
    const link=currentLink(id); const provisionalProject=projectTextFromLane(lane,'');
    const title=titleFromLink(link)||titleFromDocument(provisionalProject); if(!title)return;
    const native=nativeTitleNode(lane,title); const tag=shortTag(id,link);
    let mount=document.getElementById(MOUNT_ID); if(!(mount instanceof HTMLElement)){mount=document.createElement('span');mount.id=MOUNT_ID;}
    mount.replaceChildren();
    if(native?.parentElement){native.insertAdjacentElement('afterend',mount);mount.appendChild(makeBadge(id,tag));}
    else {
      if(mount.parentNode!==lane) lane.appendChild(mount);
      const t=document.createElement('span'); t.className=TITLE_CLASS; t.textContent=`/ ${title}`; t.title=title;
      const work=Array.from(header.querySelectorAll('span,div')).find((el)=>el instanceof HTMLElement&&visible(el)&&/^work$/i.test(clean(el.textContent)));
      t.style.color=work instanceof HTMLElement?getComputedStyle(work).color:'var(--text-secondary,rgba(180,180,180,.95))';
      mount.appendChild(t); mount.appendChild(makeBadge(id,tag));
    }
  }

  function schedule(){if(timer!==null)clearTimeout(timer);timer=setTimeout(sync,80);}
  for(const method of ['pushState','replaceState']){const original=history[method];if(typeof original==='function')history[method]=function(...args){const r=original.apply(this,args);schedule();return r;};}
  addEventListener('popstate',schedule); addEventListener('resize',schedule); addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  new MutationObserver((ms)=>{for(const m of ms){const target=m.target instanceof Element?m.target:null;if(target?.closest?.(`#${MOUNT_ID}`))continue;if(observedHeader&&(target===observedHeader||observedHeader.contains(target))){schedule();return;}for(const n of m.addedNodes){if(n instanceof Element&&(n.matches?.('#page-header,header,a[href*="/c/"]')||n.querySelector?.('#page-header,header,a[href*="/c/"]'))){schedule();return;}}}}).observe(document.body||document.documentElement,{childList:true,subtree:true});
  schedule();
})();
