(() => {
  'use strict';
  const M=window.CGPTHeaderV060;
  class HeaderController{
    constructor(adapter,view,layout){this.adapter=adapter;this.view=view;this.layout=layout;this.cleanup=null;this.currentId=null;this.currentSurface=null;this.currentLane=null;this.currentMode=null;this.refreshDebounced=M.debounce(()=>this.refresh(),60);}
    start(){this.cleanup=this.adapter.observeShellChanges(this.refreshDebounced);this.refresh();}
    stop(){this.cleanup?.();this.cleanup=null;this.layout.detach();this.view.unmount();}
    nativeColor(mountInfo){for(const root of [mountInfo.actionsLane,mountInfo.headerRoot].filter(Boolean)){const c=root.querySelector?.('button,a[href],[role="button"]');if(c){const color=getComputedStyle(c).color;if(color)return color;}}return '';}
    refresh(){const mountInfo=this.adapter.findHeaderMount(),id=this.adapter.getConversationId(),surface=M.surface(),nextLane=mountInfo?.titleLane||null,laneConnected=Boolean(this.currentLane?.isConnected);
      if(!mountInfo||!id){this.view.unmount();this.layout.detach();this.currentId=id;this.currentSurface=surface;this.currentLane=null;this.currentMode=null;return;}
      const title=this.adapter.readSidebarTitle()||this.adapter.titleFromDocument(this.adapter.readableText(nextLane));if(!title)return;
      const remount=this.currentId!==id||this.currentSurface!==surface||!laneConnected||this.currentLane!==nextLane;
      if(remount){this.view.mount(mountInfo);this.layout.attach(this.view.root,mountInfo);this.currentId=id;this.currentSurface=surface;this.currentLane=nextLane;this.currentMode=this.adapter.nativeTitlePresent(nextLane,title)?'badge-only':'title-and-badge';}
      else this.layout.refresh();
      this.view.render({mode:this.currentMode,title,id,tag:this.adapter.currentTag(id),titleColor:this.nativeColor(mountInfo),maxWidth:this.layout.getMaxWidth()});
    }
  }
  if(window.__cgptHeaderIdentityControllerV060?.stop)window.__cgptHeaderIdentityControllerV060.stop();
  const adapter=new M.HostAdapter(),view=new M.HeaderView(),layout=new M.LayoutManager(),controller=new HeaderController(adapter,view,layout);controller.start();window.__cgptHeaderIdentityControllerV060=controller;
})();
