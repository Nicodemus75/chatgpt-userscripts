(() => {
  'use strict';

  const MOUNT_ID = 'cgpt-header-conversation-identity';
  const STYLE_ID = 'cgpt-header-conversation-style';
  const TOOLTIP_ID = 'cgpt-header-conversation-tooltip';
  const TITLE_CLASS = 'cgpt-header-conversation-title';
  const BADGE_CLASS = 'cgpt-header-conversation-badge';
  const ROUTING_PREFIX = 'CHATGPT:CLOUD:';
  const TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let timer = null;

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
    for (const root of document.querySelectorAll('nav, aside, [class*="sidebar" i]')) {
      for (const link of root.querySelectorAll('a[href*="/c/"]')) {
        if (conversationId(link.getAttribute('href') || link.href) === id) return link;
      }
    }
    return null;
  }

  function titleFromLink(link) {
    if (!(link instanceof HTMLAnchorElement)) return '';
    for (const sel of ['[data-testid="conversation-title"]','[data-testid="thread-title"]','[data-marquee-text]','.truncate']) {
      const t = clean(link.querySelector(sel)?.textContent);
      if (t && norm(t) !== 'new chat') return t;
    }
    const aria = clean(link.getAttribute('aria-label') || link.getAttribute('title'));
    return aria && norm(aria) !== 'new chat' ? aria : '';
  }

  function titleFromDocument() {
    let t = clean(document.title).replace(/\s+[-–—|]\s+ChatGPT\s*$/i, '').trim();
    return /^ChatGPT$/i.test(t) ? '' : t;
  }

  function findHeader() {
    const page = document.querySelector('#page-header');
    if (page instanceof HTMLElement && visible(page)) return page;
    const share = Array.from(document.querySelectorAll('button,[role="button"]')).find((el) => {
      if (!(el instanceof HTMLElement) || !visible(el)) return false;
      return /^share$/i.test(clean(el.getAttribute('aria-label') || el.textContent));
    });
    const h = share?.closest('header');
    if (h instanceof HTMLElement && visible(h)) return h;
    return Array.from(document.querySelectorAll('header,[role="banner"]')).find((el) => {
      if (!(el instanceof HTMLElement) || !visible(el)) return false;
      const r = el.getBoundingClientRect();
      return r.top < 130 && r.width > 400 && r.height >= 30 && r.height <= 120;
    }) || null;
  }

  function textCandidates(header) {
    return Array.from(header.querySelectorAll('span,div,p,a,button'))
      .filter((el) => el instanceof HTMLElement && visible(el) && !el.closest(`#${MOUNT_ID}`))
      .map((el) => ({ el, text: clean(el.textContent), rect: el.getBoundingClientRect() }))
      .filter(({ text }) => text);
  }

  function nativeTitleNode(header, title) {
    const needle = norm(title);
    if (!needle) return null;
    const exact = textCandidates(header)
      .filter(({ text }) => norm(text) === needle)
      .sort((a,b) => a.rect.width - b.rect.width);
    if (exact.length) return exact[0].el;
    if (needle.length >= 8 && needle.split(/\s+/).length >= 2) {
      const containing = textCandidates(header)
        .filter(({ text }) => norm(text).includes(needle))
        .sort((a,b) => a.rect.width - b.rect.width);
      if (containing.length) return containing[0].el;
    }
    return null;
  }

  function findLeadingIdentityNode(header, title) {
    const hr = header.getBoundingClientRect();
    const titleNorm = norm(title);
    const candidates = textCandidates(header)
      .filter(({ text, rect }) => {
        const n = norm(text);
        if (!n || n === titleNorm) return false;
        if (/^(share|work|temporary|new chat|upgrade|log in|sign up)$/i.test(text)) return false;
        if (text.startsWith('#')) return false;
        if (rect.left > hr.left + hr.width * 0.58) return false;
        if (rect.width > Math.min(620, hr.width * 0.55)) return false;
        return true;
      })
      .sort((a,b) => (a.rect.left - b.rect.left) || (a.rect.width - b.rect.width));

    if (!candidates.length) return null;
    let el = candidates[0].el;
    const interactive = el.closest('button,a,[role="button"],[role="link"]');
    if (interactive instanceof HTMLElement && header.contains(interactive)) el = interactive;
    return el;
  }

  function shortTag(id, link) {
    const existing = clean(link?.getAttribute('data-cgpt-short-id'));
    if (existing) return existing.startsWith('#') ? existing : `#${existing}`;
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    for (let i=0;i<id.length;i+=1) { hash ^= BigInt(id.charCodeAt(i)); hash = BigInt.asUintN(64, hash * prime); }
    let v = hash, encoded = '';
    do { encoded = TAG_ALPHABET[Number(v & 31n)] + encoded; v >>= 5n; } while (v > 0n);
    return `#${encoded.padStart(13,'0').slice(0,4)}`;
  }

  function installStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement('style'); style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      #${MOUNT_ID}{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;position:static!important;flex:0 1 auto!important;min-width:0!important;max-width:min(40vw,680px)!important;overflow:hidden!important;margin-left:7px!important;gap:7px!important;white-space:nowrap!important;vertical-align:middle!important;background:var(--main-surface-primary,var(--background-primary,Canvas))!important;}
      #${MOUNT_ID} .${TITLE_CLASS}{display:inline-block!important;position:static!important;flex:0 1 auto!important;min-width:0!important;max-width:min(34vw,590px)!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;box-sizing:border-box!important;padding:2px 4px!important;background:var(--main-surface-primary,var(--background-primary,Canvas))!important;color:var(--cgpt-native-chat-title-color,var(--text-secondary,rgba(180,180,180,.95)))!important;opacity:1!important;font:inherit!important;line-height:inherit!important;}
      #${MOUNT_ID} .${BADGE_CLASS}{display:inline-flex!important;align-items:center!important;justify-content:center!important;position:static!important;flex:0 0 auto!important;min-width:40px!important;height:18px!important;padding:0 4px!important;box-sizing:border-box!important;border:1px solid rgba(128,128,128,.38)!important;border-radius:5px!important;background:rgba(32,32,32,.88)!important;color:rgba(235,235,235,.88)!important;opacity:.72!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;font-size:9px!important;font-weight:600!important;line-height:16px!important;cursor:copy!important;user-select:none!important;}
      #${MOUNT_ID} .${BADGE_CLASS}:hover{opacity:.94!important;background:rgba(55,55,55,.96)!important;border-color:rgba(160,160,160,.76)!important;}
      #${TOOLTIP_ID}{position:fixed!important;z-index:2147483647!important;padding:5px 7px!important;border:1px solid rgba(128,128,128,.45)!important;border-radius:6px!important;background:rgba(20,20,20,.96)!important;color:rgba(245,245,245,.96)!important;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;white-space:nowrap!important;pointer-events:none!important;}
    `;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(text); return true; } catch {} }
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
    let ok=false; try { ok=document.execCommand('copy'); } catch { ok=false; } ta.remove(); return ok;
  }

  function showTooltip(anchor, text) {
    document.getElementById(TOOLTIP_ID)?.remove();
    if (!(anchor instanceof HTMLElement) || !text) return;
    const tip=document.createElement('div'); tip.id=TOOLTIP_ID; tip.textContent=text; document.body.appendChild(tip);
    const a=anchor.getBoundingClientRect(), t=tip.getBoundingClientRect(), m=8, g=6;
    tip.style.left=`${Math.round(Math.max(m,Math.min(a.right-t.width,innerWidth-t.width-m)))}px`;
    let top=a.bottom+g; if(top+t.height>innerHeight-m) top=Math.max(m,a.top-t.height-g); tip.style.top=`${Math.round(top)}px`;
  }

  function badge(id, tag) {
    const b=document.createElement('span'); b.className=BADGE_CLASS; b.textContent=tag; b.dataset.conversationId=id;
    b.addEventListener('mouseenter',()=>showTooltip(b,id)); b.addEventListener('mouseleave',()=>document.getElementById(TOOLTIP_ID)?.remove());
    b.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();void copyText(e.ctrlKey||e.metaKey?`${ROUTING_PREFIX}${id}`:id);});
    return b;
  }

  function titleColor(header) {
    const work=textCandidates(header).find(({ text }) => /^work$/i.test(text));
    return work?.el instanceof HTMLElement ? getComputedStyle(work.el).color : '';
  }

  function placeAfter(node, mount) {
    if (!(node instanceof HTMLElement) || !node.parentElement) return false;
    if (mount.parentElement === node.parentElement && mount.previousSibling === node) return true;
    node.insertAdjacentElement('afterend', mount);
    return true;
  }

  function sync() {
    timer=null; installStyles();
    const id=conversationId();
    if(!id){document.getElementById(MOUNT_ID)?.remove();return;}
    const header=findHeader(); if(!header)return;
    const link=currentLink(id);
    let title=titleFromLink(link);
    if(!title) title=titleFromDocument();
    if(!title) return;

    const native=nativeTitleNode(header,title);
    const tag=shortTag(id,link);
    let mount=document.getElementById(MOUNT_ID);
    if(!(mount instanceof HTMLElement)){mount=document.createElement('span');mount.id=MOUNT_ID;}
    mount.replaceChildren();

    if(native?.parentElement){
      if(!placeAfter(native,mount)) return;
      mount.appendChild(badge(id,tag));
      return;
    }

    const leading=findLeadingIdentityNode(header,title);
    if(!leading?.parentElement){mount.remove();return;}
    if(!placeAfter(leading,mount)) return;
    const t=document.createElement('span'); t.className=TITLE_CLASS; t.textContent=`/ ${title}`; t.title=title;
    const c=titleColor(header); if(c) t.style.setProperty('--cgpt-native-chat-title-color',c);
    mount.appendChild(t); mount.appendChild(badge(id,tag));
  }

  function schedule(){if(timer!==null)clearTimeout(timer);timer=setTimeout(sync,90);}
  for(const method of ['pushState','replaceState']){const original=history[method];if(typeof original!=='function')continue;history[method]=function(...args){const r=original.apply(this,args);schedule();return r;};}
  addEventListener('popstate',schedule); addEventListener('resize',schedule); addEventListener('pageshow',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  new MutationObserver((ms)=>{for(const m of ms){const target=m.target instanceof Element?m.target:null;if(target?.closest?.(`#${MOUNT_ID}`))continue;if(target?.closest?.('#page-header,header,nav,aside,[class*="sidebar" i]')){schedule();return;}for(const n of m.addedNodes){if(n instanceof Element&&(n.matches?.('#page-header,header,a[href*="/c/"]')||n.querySelector?.('#page-header,header,a[href*="/c/"]'))){schedule();return;}}}}).observe(document.body||document.documentElement,{childList:true,subtree:true});
  schedule();
})();
