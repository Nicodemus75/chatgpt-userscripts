(() => {
  'use strict';
  const M=window.CGPTHeaderV060;

  class HeaderController{
    constructor(adapter,view,layout){
      this.adapter=adapter;this.view=view;this.layout=layout;this.cleanup=null;
      this.currentId=null;this.currentSurface=null;this.currentLane=null;this.currentMode=null;
      this.refreshDebounced=M.debounce(()=>this.refresh(),60);
    }
    start(){this.cleanup=this.adapter.observeShellChanges(this.refreshDebounced);this.refresh();}
    stop(){this.cleanup?.();this.cleanup=null;this.layout.detach();this.view.unmount();}
    nativeTitleColor(mountInfo){
      const header=mountInfo?.headerRoot;
      if(header){
        const work=Array.from(header.querySelectorAll('span,div,p')).find((el)=>el instanceof HTMLElement && M.visible(el) && /^work$/i.test(M.clean(el.textContent)));
        if(work){const c=getComputedStyle(work).color;if(c)return c;}
      }
      return 'var(--text-secondary,rgba(180,180,180,.95))';
    }
    refresh(){
      const mountInfo=this.adapter.findHeaderMount();
      const id=this.adapter.getConversationId();
      const surface=M.surface();
      const nextLane=mountInfo?.titleLane||null;
      const laneConnected=Boolean(this.currentLane?.isConnected);

      if(!mountInfo||!id){
        this.view.unmount();this.layout.detach();
        this.currentId=id;this.currentSurface=surface;this.currentLane=null;this.currentMode=null;
        return;
      }

      const title=this.adapter.readSidebarTitle()||this.adapter.titleFromDocument(this.adapter.readableText(nextLane));
      if(!title)return;

      const remount=this.currentId!==id||this.currentSurface!==surface||!laneConnected||this.currentLane!==nextLane;
      if(remount){
        this.view.mount(mountInfo);
        this.layout.attach(this.view.root,mountInfo);
        this.currentId=id;this.currentSurface=surface;this.currentLane=nextLane;
        this.currentMode=this.adapter.nativeTitlePresent(nextLane,title)?'badge-only':'title-and-badge';
      } else {
        this.layout.refresh();
      }

      this.view.render({
        mode:this.currentMode,
        title,
        id,
        tag:this.adapter.currentTag(id),
        titleColor:this.nativeTitleColor(mountInfo),
        headerBackground:M.opaqueHeaderBackground?.(mountInfo.headerRoot),
        maxWidth:this.layout.getMaxWidth()
      });
    }
  }

  if(window.__cgptHeaderIdentityControllerV060?.stop)window.__cgptHeaderIdentityControllerV060.stop();
  const adapter=new M.HostAdapter();
  const view=new M.HeaderView();
  const layout=new M.LayoutManager();
  const controller=new HeaderController(adapter,view,layout);
  controller.start();
  window.__cgptHeaderIdentityControllerV060=controller;
})();
