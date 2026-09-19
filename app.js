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
      return[t[0]*(1-v)+b[0]*v,t[1]*(1-v)+b[1]*v];
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

    const N=20;
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
  document.documentElement.dataset.hakiVersion='0.2.2';
})().catch(err=>{
  console.error(err);
  const b=document.getElementById('boot');
  if(b)b.innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar el editor. Revisa tu conexión.</span>';
});
