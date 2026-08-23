(() => {
  'use strict';
  const M = window.CGPTHeaderV060;

  function opaqueHeaderBackground(header) {
    let node = header;
    while (node instanceof HTMLElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
      node = node.parentElement;
    }
    return 'var(--main-surface-primary,var(--background-primary,#212121))';
  }

  class HeaderView {
    constructor(){this.root=null;this.title=null;this.badge=null;this.currentId=null;this.installStyles();}
    installStyles(){
      if(document.getElementById(M.STYLE_ID)) return;
      const s=document.createElement('style');
      s.id=M.STYLE_ID;
      s.textContent=`
        #${M.ROOT_ID}{display:flex!important;align-items:center!important;justify-content:flex-start!important;min-width:0!important;max-width:100%!important;flex:0 1 auto!important;width:auto!important;position:relative!important;gap:7px!important;overflow:hidden!important;white-space:nowrap!important;z-index:0!important;}
        #${M.ROOT_ID}[data-mode="badge-only"]{flex:0 0 auto!important;width:auto!important;max-width:none!important;margin-left:7px!important;overflow:visible!important;background:transparent!important;}
        #${M.ROOT_ID} .cgpt-header-title-v060{display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;flex:0 1 auto!important;min-width:0!important;width:auto!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;text-align:left!important;font:inherit!important;line-height:1.3!important;padding:4px 6px!important;border-radius:6px!important;opacity:1!important;}
        #${M.ROOT_ID} .cgpt-header-badge-v060{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-width:40px!important;height:18px!important;padding:0 4px!important;box-sizing:border-box!important;border:1px solid rgba(128,128,128,.38)!important;border-radius:5px!important;background:rgba(32,32,32,.88)!important;color:rgba(235,235,235,.88)!important;opacity:.72!important;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;font-size:9px!important;font-weight:600!important;line-height:16px!important;cursor:copy!important;user-select:none!important;}
        #${M.ROOT_ID} .cgpt-header-badge-v060:hover{opacity:.94!important;background:rgba(55,55,55,.96)!important;border-color:rgba(160,160,160,.76)!important;}
        #${M.TOOLTIP_ID}{position:fixed!important;z-index:2147483647!important;padding:5px 7px!important;border:1px solid rgba(128,128,128,.45)!important;border-radius:6px!important;background:rgba(20,20,20,.96)!important;color:rgba(245,245,245,.96)!important;font:10px/1.3 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace!important;white-space:nowrap!important;pointer-events:none!important;}
      `;
      (document.head||document.documentElement).appendChild(s);
    }
    ensureRoot(){
      if(this.root) return this.root;
      const root=document.createElement('div'); root.id=M.ROOT_ID; root.dataset.version='0.6.1';
      const title=document.createElement('span'); title.className='cgpt-header-title-v060';
      const badge=document.createElement('span'); badge.className='cgpt-header-badge-v060'; badge.setAttribute('role','button'); badge.tabIndex=0;
      badge.addEventListener('mouseenter',()=>this.showTooltip());
      badge.addEventListener('mouseleave',()=>document.getElementById(M.TOOLTIP_ID)?.remove());
      badge.addEventListener('click',(e)=>this.copy(e));
      badge.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();this.copy(e);}});
      root.append(title,badge); this.root=root; this.title=title; this.badge=badge; return root;
    }
    mount(mountInfo){const root=this.ensureRoot(); if(root.parentNode!==mountInfo.titleLane) mountInfo.titleLane.appendChild(root); return true;}
    render({mode,title,id,tag,titleColor,maxWidth,headerBackground}){
      const root=this.ensureRoot(); this.currentId=id; root.dataset.mode=mode;
      const safeWidth=Math.max(0,Math.min(Number(maxWidth)||0,720));
      root.style.maxWidth=mode==='badge-only'?'none':`${safeWidth}px`;
      root.style.width='auto';
      root.style.background=mode==='badge-only'?'transparent':(headerBackground||'var(--main-surface-primary,var(--background-primary,#212121))');
      root.style.borderRadius=mode==='badge-only'?'0':'6px';
      this.title.hidden=mode==='badge-only';
      this.title.textContent=mode==='badge-only'?'':`/ ${title}`;
      this.title.title=title||'';
      this.title.style.color=titleColor||'var(--text-secondary,rgba(180,180,180,.95))';
      this.title.style.background=mode==='badge-only'?'transparent':(headerBackground||'var(--main-surface-primary,var(--background-primary,#212121))');
      this.badge.textContent=tag;
      this.badge.setAttribute('aria-label',`Copy conversation ID ${id}`);
    }
    unmount(){this.root?.remove();document.getElementById(M.TOOLTIP_ID)?.remove();}
    showTooltip(){if(!this.badge||!this.currentId)return;document.getElementById(M.TOOLTIP_ID)?.remove();const t=document.createElement('div');t.id=M.TOOLTIP_ID;t.textContent=this.currentId;document.body.appendChild(t);const a=this.badge.getBoundingClientRect(),r=t.getBoundingClientRect(),m=8,g=6;t.style.left=`${Math.round(Math.max(m,Math.min(a.right-r.width,innerWidth-r.width-m)))}px`;let top=a.bottom+g;if(top+r.height>innerHeight-m)top=Math.max(m,a.top-r.height-g);t.style.top=`${Math.round(top)}px`;}
    async copy(event){if(!this.currentId)return;const text=event.ctrlKey||event.metaKey?`${M.ROUTING_PREFIX}${this.currentId}`:this.currentId;if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(text);return;}catch{}}const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch{}ta.remove();}
  }

  class LayoutManager {
    constructor(){this.root=null;this.mountInfo=null;this.lastMaxWidth=null;this.ro=null;this.onResize=M.debounce(()=>this.refresh(),80);}
    attach(root,mountInfo){
      this.detach(); this.root=root; this.mountInfo=mountInfo; addEventListener('resize',this.onResize);
      if(typeof ResizeObserver==='function'){
        this.ro=new ResizeObserver(()=>this.refresh());
        if(mountInfo?.titleLane) this.ro.observe(mountInfo.titleLane);
        if(mountInfo?.headerRoot && mountInfo.headerRoot!==mountInfo.titleLane) this.ro.observe(mountInfo.headerRoot);
        if(mountInfo?.actionsLane) this.ro.observe(mountInfo.actionsLane);
      }
      this.refresh();
    }
    dynamicRightBoundary(){
      const info=this.mountInfo, lane=info?.titleLane, header=info?.headerRoot;
      if(!lane||!header) return null;
      const laneRect=lane.getBoundingClientRect();
      const actionRect=info.actionsLane?.getBoundingClientRect?.();
      const candidates=[];
      if(actionRect && actionRect.width>0 && actionRect.left>laneRect.left+40) candidates.push(actionRect.left);
      for(const el of header.querySelectorAll('button,a[href],[role="button"],[role="link"]')){
        if(!(el instanceof HTMLElement) || !M.visible(el) || lane.contains(el) || this.root?.contains(el)) continue;
        const r=el.getBoundingClientRect();
        if(r.width>0 && r.left>laneRect.left+40) candidates.push(r.left);
      }
      return candidates.length?Math.min(...candidates):null;
    }
    refresh(){
      if(!this.root||!this.mountInfo?.titleLane) return;
      const lane=this.mountInfo.titleLane, laneRect=lane.getBoundingClientRect();
      let available=Math.max(0,laneRect.width);
      const boundary=this.dynamicRightBoundary();
      if(boundary!==null) available=Math.min(available,Math.max(0,boundary-laneRect.left-12));
      this.lastMaxWidth=Math.min(available,720);
      this.root.style.maxWidth=`${Math.max(0,this.lastMaxWidth)}px`;
      this.root.style.overflow='hidden';
    }
    getMaxWidth(){return this.lastMaxWidth;}
    detach(){removeEventListener('resize',this.onResize);this.ro?.disconnect();this.ro=null;this.root=null;this.mountInfo=null;this.lastMaxWidth=null;}
  }

  M.HeaderView=HeaderView;
  M.LayoutManager=LayoutManager;
  M.opaqueHeaderBackground=opaqueHeaderBackground;
})();
