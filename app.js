(async()=>{
  const base='https://raw.githack.com/henmario99-art/HAKI/haki-studio/studio/';
  const load=src=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.onload=resolve;
    s.onerror=reject;
    document.head.appendChild(s);
  });
  if(!window.fabric) await load(base+'vendor/fabric.min.js');
  for(const file of ['core.js','editor.js','warp.js','storage.js','ui.js']){
    await load(base+file);
  }
  await load('./ai.js?v=4');
  

  // Mobile-friendly print zones: always anchor to the visible mockup/design.
  HAKI.addPrintZone=()=>{
    const objects=HAKI.canvas.getObjects();
    const zones=objects.filter(o=>o.hakiKind==='printzone');
    const active=HAKI.active();
    const mockup=objects.find(o=>o.hakiKind==='mockup' && o.visible!==false);
    const design=objects.find(o=>o.hakiKind==='design' && o.visible!==false);
    const anchor=(active && active.hakiKind!=='printzone') ? active : (mockup||design||null);

    let cx=HAKI.canvas.getWidth()/2, cy=HAKI.canvas.getHeight()/2;
    let w=320, h=240;

    if(anchor){
      const p=anchor.getCenterPoint();
      cx=p.x; cy=p.y;
      const aw=Math.max(1,anchor.getScaledWidth());
      const ah=Math.max(1,anchor.getScaledHeight());
      w=Math.max(180,Math.min(360,aw*.42));
      h=Math.max(140,Math.min(300,ah*.30));
    }

    const z=HAKI.addMeta(new fabric.Rect({
      left:cx,top:cy,width:w,height:h,
      originX:'center',originY:'center',
      fill:'rgba(0,240,255,.28)',
      stroke:'#00ffff',
      strokeWidth:10,
      strokeDashArray:null,
      strokeUniform:true,
      objectCaching:false,
      selectable:true,
      evented:true,
      transparentCorners:false,
      cornerColor:'#ffffff',
      cornerStrokeColor:'#00ffff',
      cornerStyle:'circle',
      cornerSize:24,
      borderColor:'#00ffff',
      borderScaleFactor:4
    }),'printzone','Zona '+(zones.length+1));

    HAKI.canvas.add(z);
    z.bringToFront();
    HAKI.canvas.setActiveObject(z);
    z.setCoords();
    HAKI.canvas.requestRenderAll();
    HAKI.snapshot();
    HAKI.refresh();

  
  // Two-finger pinch zoom + pan directly on the editor canvas.
  if(!HAKI._pinchInstalled && HAKI.canvas?.upperCanvasEl){
    HAKI._pinchInstalled=true;
    const el=HAKI.canvas.upperCanvasEl;
    let pinch=null;
    const pointFromTouches=touches=>{
      const r=el.getBoundingClientRect();
      const x=(touches[0].clientX+touches[1].clientX)/2-r.left;
      const y=(touches[0].clientY+touches[1].clientY)/2-r.top;
      return {x,y};
    };
    const distFromTouches=touches=>{
      const dx=touches[0].clientX-touches[1].clientX;
      const dy=touches[0].clientY-touches[1].clientY;
      return Math.hypot(dx,dy);
    };
    el.addEventListener('touchstart',e=>{
      if(e.touches.length!==2)return;
      e.preventDefault();
      pinch={
        dist:Math.max(1,distFromTouches(e.touches)),
        zoom:HAKI.canvas.getZoom(),
        vpt:HAKI.canvas.viewportTransform.slice(),
        center:pointFromTouches(e.touches)
      };
    },{passive:false});
    el.addEventListener('touchmove',e=>{
      if(!pinch||e.touches.length!==2)return;
      e.preventDefault();
      const nowDist=Math.max(1,distFromTouches(e.touches));
      const center=pointFromTouches(e.touches);
      const z=Math.max(.08,Math.min(8,pinch.zoom*(nowDist/pinch.dist)));
      HAKI.canvas.setViewportTransform(pinch.vpt.slice());
      HAKI.canvas.zoomToPoint(new fabric.Point(pinch.center.x,pinch.center.y),z);
      const v=HAKI.canvas.viewportTransform;
      v[4]+=center.x-pinch.center.x;
      v[5]+=center.y-pinch.center.y;
      HAKI.canvas.setViewportTransform(v);
      HAKI.canvas.requestRenderAll();
      HAKI.updateZoom();
    },{passive:false});
    const endPinch=e=>{if(!e.touches||e.touches.length<2)pinch=null};
    el.addEventListener('touchend',endPinch,{passive:true});
    el.addEventListener('touchcancel',()=>{pinch=null},{passive:true});
  }

  const panel=document.getElementById('sidepanel');
    if(panel)panel.classList.remove('open');
    HAKI.toast('Zona visible creada sobre el mockup');
  };

  // HAKI Studio mobile-safe warp: preserve RGB/alpha and never inherit destructive blend modes.
  HAKI.applyWarp=()=>{
    const o=HAKI.active();
    if(!HAKI.isImage(o)){HAKI.toast('Selecciona una imagen');return}
    const el=o.getElement();
    const sw=el.naturalWidth||el.videoWidth||el.width;
    const sh=el.naturalHeight||el.videoHeight||el.height;
    if(!sw||!sh){HAKI.toast('Imagen no disponible');return}

    const W=Math.max(32,Math.round(o.getScaledWidth()));
    const HH=Math.max(32,Math.round(o.getScaledHeight()));
    const q=[
      [+HAKI.$('#warpTLX').value,+HAKI.$('#warpTLY').value],
      [W+(+HAKI.$('#warpTRX').value),+HAKI.$('#warpTRY').value],
      [W+(+HAKI.$('#warpBRX').value),HH+(+HAKI.$('#warpBRY').value)],
      [+HAKI.$('#warpBLX').value,HH+(+HAKI.$('#warpBLY').value)]
    ];
    const minX=Math.min(...q.map(p=>p[0])), minY=Math.min(...q.map(p=>p[1]));
    const maxX=Math.max(...q.map(p=>p[0])), maxY=Math.max(...q.map(p=>p[1]));
    q.forEach(p=>{p[0]-=minX;p[1]-=minY});

    const affine=(s,d)=>{
      const [a,b,c]=s,[A,B,C]=d;
      const x0=a[0],y0=a[1],x1=b[0],y1=b[1],x2=c[0],y2=c[1];
      const D=x0*(y1-y2)+x1*(y2-y0)+x2*(y0-y1);
      if(Math.abs(D)<1e-7)return null;
      return[
        (A[0]*(y1-y2)+B[0]*(y2-y0)+C[0]*(y0-y1))/D,
        (A[1]*(y1-y2)+B[1]*(y2-y0)+C[1]*(y0-y1))/D,
        (A[0]*(x2-x1)+B[0]*(x0-x2)+C[0]*(x1-x0))/D,
        (A[1]*(x2-x1)+B[1]*(x0-x2)+C[1]*(x1-x0))/D,
        (A[0]*(x1*y2-x2*y1)+B[0]*(x2*y0-x0*y2)+C[0]*(x0*y1-x1*y0))/D,
        (A[1]*(x1*y2-x2*y1)+B[1]*(x2*y0-x0*y2)+C[1]*(x0*y1-x1*y0))/D
      ];
    };
    const bilerp=(u,v)=>{
      const t=[q[0][0]*(1-u)+q[1][0]*u,q[0][1]*(1-u)+q[1][1]*u];
      const b=[q[3][0]*(1-u)+q[2][0]*u,q[3][1]*(1-u)+q[2][1]*u];
      let px=t[0]*(1-v)+b[0]*v, py=t[1]*(1-v)+b[1]*v;

      // AI mesh profile: adds interior curvature, not only corner perspective.
      const p=HAKI.aiWarpProfile;
      if(p){
        const strength=Math.max(0,Math.min(1,p.strength||0));
        const relief=Math.max(0,Math.min(1,p.relief||0));
        const power=strength*(0.65+relief*0.75);
        const dome=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
        const side=(u-.5)*2;
        const vertical=Math.sin(Math.PI*v);

        if(['chest','chest-left','chest-right'].includes(p.region)){
          // Convex torso/chest: middle bows outward and slightly upward.
          px += side*vertical*W*.075*power;
          py -= dome*HH*.055*power;
          if(p.region==='chest-left') px -= dome*W*.035*power;
          if(p.region==='chest-right') px += dome*W*.035*power;
        }else if(p.region==='sleeve-left'){
          // Sleeve wraps away from the torso.
          px -= (v*.75+dome*.35)*W*.115*power;
          py += side*HH*.045*power;
        }else if(p.region==='sleeve-right'){
          px += (v*.75+dome*.35)*W*.115*power;
          py -= side*HH*.045*power;
        }else if(p.region==='full'){
          // Full front/back: subtle torso barrel curve.
          px += side*vertical*W*.055*power;
          py -= dome*HH*.032*power;
        }else if((p.region||'').startsWith('leg-')){
          const dir=p.region==='leg-left'?-1:1;
          px += dir*dome*W*.055*power;
          py += side*HH*.02*power;
        }else{
          px += side*vertical*W*.04*power;
          py -= dome*HH*.025*power;
        }
      }
      return[px,py];
    };
    const off=document.createElement('canvas');
    off.width=Math.max(1,Math.ceil(maxX-minX));
    off.height=Math.max(1,Math.ceil(maxY-minY));
    const ctx=off.getContext('2d',{alpha:true});
    ctx.clearRect(0,0,off.width,off.height);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    const tri=(s,d)=>{
      const m=affine(s,d); if(!m)return;
      ctx.save();
      ctx.globalCompositeOperation='source-over';
      ctx.beginPath();
      ctx.moveTo(d[0][0],d[0][1]);ctx.lineTo(d[1][0],d[1][1]);ctx.lineTo(d[2][0],d[2][1]);
      ctx.closePath();ctx.clip();
      ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);
      ctx.drawImage(el,0,0);
      ctx.restore();
    };

    const N=28;
    for(let iy=0;iy<N;iy++)for(let ix=0;ix<N;ix++){
      const u0=ix/N,u1=(ix+1)/N,v0=iy/N,v1=(iy+1)/N;
      const s00=[u0*sw,v0*sh],s10=[u1*sw,v0*sh],s11=[u1*sw,v1*sh],s01=[u0*sw,v1*sh];
      const d00=bilerp(u0,v0),d10=bilerp(u1,v0),d11=bilerp(u1,v1),d01=bilerp(u0,v1);
      tri([s00,s10,s11],[d00,d10,d11]);
      tri([s00,s11,s01],[d00,d11,d01]);
    }

    const data=off.toDataURL('image/png');
    fabric.Image.fromURL(data,img=>{
      HAKI.addMeta(img,o.hakiKind||'design',HAKI.objectName(o)+' warp');
      img.set({
        left:o.left+minX,top:o.top+minY,angle:o.angle,
        originX:o.originX,originY:o.originY,opacity:o.opacity,
        globalCompositeOperation:'source-over'
      });
      img.filters=[];
      img.hakiFilters={brightness:0,contrast:0,saturation:0,blur:0};
      img.hakiMaskId=o.hakiMaskId||'';
      if(o.clipPath)img.clipPath=o.clipPath;
      const idx=HAKI.canvas.getObjects().indexOf(o);
      HAKI.canvas.remove(o);
      HAKI.canvas.insertAt(img,Math.max(0,idx),false);
      HAKI.canvas.setActiveObject(img);
      HAKI.snapshot();HAKI.refresh();
      HAKI.toast('Perspectiva aplicada · color conservado');
    });
  };

  window.HAKI.init();

  if(window.HAKI.installAIUI)window.HAKI.installAIUI();

  // Always-visible mobile Undo / Redo controls.
  if(!document.getElementById('mobileHistory')){
    const history=document.createElement('div');
    history.id='mobileHistory';
    history.innerHTML='<button id="mobileUndo" type="button">↶ Deshacer</button><button id="mobileRedo" type="button">↷ Rehacer</button><button id="mobileFit" type="button">Ajustar</button>';
    history.setAttribute('style','position:fixed;z-index:47;left:62px;top:62px;display:flex;gap:6px;padding:4px;background:rgba(14,16,20,.88);border:1px solid #303641;border-radius:11px;backdrop-filter:blur(8px)');
    const styleBtn=b=>b.setAttribute('style','border:1px solid #3b424d;background:#20242c;color:#fff;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700');
    const ub=history.querySelector('#mobileUndo'),rb=history.querySelector('#mobileRedo'),fb=history.querySelector('#mobileFit');
    styleBtn(ub);styleBtn(rb);styleBtn(fb);
    ub.onclick=()=>HAKI.undo();
    rb.onclick=()=>HAKI.redo();
    fb.onclick=()=>HAKI.fit();
    document.body.appendChild(history);
    const syncHistoryVisibility=()=>{history.style.display=window.innerWidth<=900?'flex':'none'};
    syncHistoryVisibility();
    window.addEventListener('resize',syncHistoryVisibility);
  }
  const panel=document.getElementById('sidepanel');
  if(panel && !document.getElementById('mobileBack')){
    const back=document.createElement('button');
    back.id='mobileBack';
    back.type='button';
    back.textContent='← Volver al editor';
    back.setAttribute('style','display:flex;position:sticky;top:0;z-index:100;width:100%;border:0;border-bottom:1px solid #303641;border-radius:0;background:#f5f5f5;color:#101114;font-weight:800;padding:14px;justify-content:flex-start');
    back.onclick=()=>panel.classList.remove('open');
    panel.prepend(back);
  }
  document.documentElement.dataset.hakiVersion='0.3.3-mobilezoom';
})().catch(err=>{
  console.error(err);
  const b=document.getElementById('boot');
  if(b)b.innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar el editor. Revisa tu conexión.</span>';
});
