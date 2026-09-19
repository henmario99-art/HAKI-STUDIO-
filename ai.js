(()=>{
'use strict';
const H=window.HAKI;
if(!H)return;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(r,g,b,c)=>Math.hypot(r-c[0],g-c[1],b-c[2]);
const mockup=()=>H.canvas?.getObjects().find(o=>o.hakiKind==='mockup'&&o.visible!==false);

function largestComponent(mask,w,h){
  const seen=new Uint8Array(mask.length);
  let best=[];
  const qx=new Int16Array(mask.length), qy=new Int16Array(mask.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(!mask[i]||seen[i])continue;
    let head=0,tail=0,comp=[];
    qx[tail]=x;qy[tail++]=y;seen[i]=1;
    while(head<tail){
      const cx=qx[head],cy=qy[head++],ci=cy*w+cx; comp.push(ci);
      const ns=[[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
      for(const [nx,ny] of ns){
        if(nx<0||ny<0||nx>=w||ny>=h)continue;
        const ni=ny*w+nx;
        if(mask[ni]&&!seen[ni]){seen[ni]=1;qx[tail]=nx;qy[tail++]=ny}
      }
    }
    if(comp.length>best.length)best=comp;
  }
  const out=new Uint8Array(mask.length); best.forEach(i=>out[i]=1); return out;
}

function analyzePixels(o){
  const el=o.getElement(), sw=el.naturalWidth||el.videoWidth||el.width, sh=el.naturalHeight||el.videoHeight||el.height;
  const maxSide=240, s=Math.min(1,maxSide/Math.max(sw,sh)), w=Math.max(32,Math.round(sw*s)), h=Math.max(32,Math.round(sh*s));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(el,0,0,w,h);
  const im=ctx.getImageData(0,0,w,h), d=im.data;

  let tr=0,tg=0,tb=0,tn=0,transparent=0;
  const border=[];
  for(let x=0;x<w;x++){border.push(x,(h-1)*w+x)}
  for(let y=1;y<h-1;y++){border.push(y*w,y*w+w-1)}
  for(const i of border){
    const a=d[i*4+3]; if(a<30){transparent++;continue}
    tr+=d[i*4];tg+=d[i*4+1];tb+=d[i*4+2];tn++;
  }
  const bg=tn?[tr/tn,tg/tn,tb/tn]:[255,255,255];
  let noise=0,nn=0;
  for(const i of border){
    if(d[i*4+3]<30)continue;
    noise+=dist(d[i*4],d[i*4+1],d[i*4+2],bg);nn++;
  }
  noise=nn?noise/nn:0;
  const threshold=clamp(noise*3+42,34,95);
  const raw=new Uint8Array(w*h);
  const useAlpha=transparent>border.length*.18;
  for(let i=0;i<w*h;i++){
    const a=d[i*4+3];
    if(useAlpha)raw[i]=a>45?1:0;
    else raw[i]=(a>30&&dist(d[i*4],d[i*4+1],d[i*4+2],bg)>threshold)?1:0;
  }
  const mask=largestComponent(raw,w,h);
  let minX=w,minY=h,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);count++;
  }
  if(maxX<0||count<w*h*.01)throw new Error('No pude separar la prenda del fondo');

  const bw=maxX-minX+1,bh=maxY-minY+1;
  const runsAt=(yy)=>{
    let runs=0,on=false;
    for(let x=minX;x<=maxX;x++){const v=!!mask[yy*w+x];if(v&&!on){runs++;on=true}else if(!v)on=false}
    return runs;
  };
  const lowerY=clamp(Math.round(minY+bh*.78),0,h-1);
  const lowerRuns=runsAt(lowerY);
  const ratio=bh/bw;
  let type='camiseta';
  if(lowerRuns>=2)type=ratio>1.35?'pants':'short';
  else{
    const topY=clamp(Math.round(minY+bh*.25),0,h-1), midY=clamp(Math.round(minY+bh*.52),0,h-1);
    const widthAt=yy=>{let a=w,b=-1;for(let x=minX;x<=maxX;x++)if(mask[yy*w+x]){a=Math.min(a,x);b=Math.max(b,x)}return b>=a?b-a+1:0};
    const tw=widthAt(topY),mw=widthAt(midY);
    if(tw>mw*1.18)type='camiseta';
    else type='prenda superior';
  }

  const cx=Math.round((minX+maxX)/2);
  let centerStart=minY;
  while(centerStart<=maxY&&!mask[centerStart*w+cx])centerStart++;
  const neckDepth=(centerStart-minY)/bh;
  const view=(type==='camiseta'||type==='prenda superior')?(neckDepth>.055?'frente':'espalda'):'vista';

  let lumMean=0,lumSq=0,lumN=0;
  for(let y=minY;y<=maxY;y+=2)for(let x=minX;x<=maxX;x+=2)if(mask[y*w+x]){
    const i=(y*w+x)*4,L=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];
    lumMean+=L;lumSq+=L*L;lumN++;
  }
  lumMean/=Math.max(1,lumN);
  const variance=Math.max(0,lumSq/Math.max(1,lumN)-lumMean*lumMean);
  const relief=clamp(Math.sqrt(variance)/70,0,1);

  const left=[],right=[];
  const step=Math.max(2,Math.round(bh/30));
  for(let y=minY;y<=maxY;y+=step){
    let l=-1,r=-1;
    for(let x=minX;x<=maxX;x++)if(mask[y*w+x]){l=x;break}
    for(let x=maxX;x>=minX;x--)if(mask[y*w+x]){r=x;break}
    if(l>=0&&r>=0){left.push([l,y]);right.push([r,y])}
  }
  const contour=[...left,...right.reverse()];

  return {sw,sh,w,h,mask,bg,threshold,bbox:{minX,minY,maxX,maxY,bw,bh},type,view,relief,contour,scaleX:sw/w,scaleY:sh/h};
}

function srcToCanvas(o,x,y){
  const lx=x-o.width/2, ly=y-o.height/2;
  return fabric.util.transformPoint(new fabric.Point(lx,ly),o.calcTransformMatrix());
}

function zoneRect(o,a,rx,ry,rw,rh,name,region){
  const b=a.bbox;
  const sx=(b.minX+b.bw*rx)*a.scaleX, sy=(b.minY+b.bh*ry)*a.scaleY;
  const p=srcToCanvas(o,sx,sy);
  const w=b.bw*rw*a.scaleX, h=b.bh*rh*a.scaleY;
  const z=H.addMeta(new fabric.Rect({
    left:p.x,top:p.y,width:w,height:h,originX:'center',originY:'center',
    scaleX:Math.abs(o.scaleX||1),scaleY:Math.abs(o.scaleY||1),angle:o.angle||0,
    fill:'rgba(0,240,255,.08)',stroke:'#00eaff',strokeWidth:4,strokeDashArray:[14,10],strokeUniform:true,
    objectCaching:false,cornerColor:'#fff',cornerStrokeColor:'#00eaff',cornerStyle:'circle',cornerSize:18,
    transparentCorners:false,borderColor:'#00eaff'
  }),'printzone',name);
  z.hakiAI=true;z.hakiRegion=region;return z;
}

function silhouettePath(o,a){
  const pts=a.contour.map(([x,y])=>srcToCanvas(o,x*a.scaleX,y*a.scaleY));
  if(pts.length<6)return null;
  const path='M '+pts.map((p,i)=>(i?'L ':'')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ')+' Z';
  const z=H.addMeta(new fabric.Path(path,{
    fill:'rgba(0,240,255,.025)',stroke:'#00eaff',strokeWidth:3,strokeDashArray:[10,8],
    strokeUniform:true,objectCaching:false,selectable:false,evented:false,excludeFromExport:true
  }),'printzone','Silueta IA');
  z.hakiAI=true;z.hakiRegion='silhouette';z.hakiGuide=true;return z;
}

H.analyzeMockupAI=async()=>{
  const o=mockup(); if(!o){H.toast('Primero añade un mockup');return null}
  H.status('Analizando mockup…');
  await new Promise(r=>setTimeout(r,30));
  try{
    const a=analyzePixels(o); H.aiAnalysis={...a,mockupId:o.hakiId};
    const label=(a.type==='camiseta'?'Camiseta':a.type==='pants'?'Pants':a.type==='short'?'Short':'Prenda superior');
    const view=a.view==='frente'?'Frente':a.view==='espalda'?'Espalda':'Vista';
    const rel=a.relief>.55?'alto':a.relief>.28?'medio':'suave';
    const out=document.getElementById('aiResult');
    if(out)out.innerHTML='<strong>'+label+' · '+view+'</strong><br><span>Relieve estimado: '+rel+' · Silueta detectada</span>';
    document.getElementById('aiZones')?.removeAttribute('disabled');
    document.getElementById('aiAutoFit')?.removeAttribute('disabled');
    H.status('Mockup analizado');H.toast('IA: '+label+' · '+view);
    return a;
  }catch(e){
    H.status('Listo'); H.toast(e.message||'No pude analizar el mockup'); return null;
  }
};

H.createAIZones=()=>{
  const o=mockup(),a=H.aiAnalysis;if(!o||!a){H.toast('Analiza el mockup primero');return}
  H.canvas.getObjects().filter(x=>x.hakiAI).forEach(x=>H.canvas.remove(x));
  const zs=[];
  const sil=silhouettePath(o,a); if(sil)zs.push(sil);
  if(a.type==='pants'||a.type==='short'){
    zs.push(zoneRect(o,a,.34,.48,.27,.72,'Pierna izquierda IA','leg-left'));
    zs.push(zoneRect(o,a,.66,.48,.27,.72,'Pierna derecha IA','leg-right'));
    zs.push(zoneRect(o,a,.50,.23,.48,.26,'Cintura IA','waist'));
  }else{
    zs.push(zoneRect(o,a,.50,.43,.48,.30,'Pecho completo IA','chest'));
    zs.push(zoneRect(o,a,.37,.39,.22,.20,'Pecho izquierdo IA','chest-left'));
    zs.push(zoneRect(o,a,.63,.39,.22,.20,'Pecho derecho IA','chest-right'));
    zs.push(zoneRect(o,a,.16,.31,.20,.20,'Manga izquierda IA','sleeve-left'));
    zs.push(zoneRect(o,a,.84,.31,.20,.20,'Manga derecha IA','sleeve-right'));
    zs.push(zoneRect(o,a,.50,.55,.55,.58,(a.view==='espalda'?'Espalda':'Frente')+' completo IA','full'));
  }
  zs.forEach(z=>H.canvas.add(z));
  if(zs[0])H.canvas.setActiveObject(zs[0]);
  H.snapshot();H.refresh();
  const p=document.getElementById('sidepanel');if(p)p.classList.remove('open');
  H.toast(zs.length+' zonas IA creadas');
};

function nearestZone(obj){
  const zones=H.canvas.getObjects().filter(z=>z.hakiAI&&z.hakiKind==='printzone'&&z.hakiRegion!=='silhouette');
  if(!zones.length)return null;
  const p=obj.getCenterPoint();
  return zones.reduce((best,z)=>{
    const q=z.getCenterPoint(),dd=(p.x-q.x)**2+(p.y-q.y)**2;
    return !best||dd<best.d?{z,d:dd}:best;
  },null).z;
}

H.autoFitAI=()=>{
  let d=H.active();
  if(!d||d.hakiKind!=='design'||!H.isImage(d))d=[...H.canvas.getObjects()].reverse().find(x=>x.hakiKind==='design'&&H.isImage(x));
  if(!d){H.toast('Selecciona o añade un diseño');return}

  let z=null;
  if(d.hakiMaskId)z=H.canvas.getObjects().find(x=>x.hakiId===d.hakiMaskId);
  if(!z)z=nearestZone(d);
  if(!z){H.toast('Primero crea las zonas IA');return}

  // Capture the exact pre-AI state so one Undo can return here.
  H.snapshot();

  // Do not create intermediate history states: one Undo returns to the pre-AI state.
  const zw=z.getScaledWidth(),zh=z.getScaledHeight();
  const fit=Math.min(zw/d.width,zh/d.height)*.90;
  const center=z.getCenterPoint();
  d.set({
    left:center.x,top:center.y,
    originX:'center',originY:'center',
    scaleX:fit,scaleY:fit,
    angle:z.angle||0,
    globalCompositeOperation:'source-over'
  });
  d.setCoords();
  H.canvas.setActiveObject(d);

  // Apply the zone mask without taking an intermediate snapshot.
  d.hakiMaskId=z.hakiId;
  d.clipPath=new fabric.Rect({
    left:z.left,top:z.top,width:z.width,height:z.height,
    scaleX:z.scaleX,scaleY:z.scaleY,angle:z.angle,
    skewX:z.skewX,skewY:z.skewY,
    originX:z.originX,originY:z.originY,
    absolutePositioned:true,fill:'#000'
  });

  const rawStrength=+(document.getElementById('aiWarpStrength')?.value||55)/100;
  const relief=H.aiAnalysis?.depthStrength ?? H.aiAnalysis?.relief ?? .35;
  // Keep a useful minimum so Auto adaptar is visibly different even at modest slider values.
  const strength=clamp(.28+rawStrength*.72,0,1);
  const W=d.getScaledWidth(),HH=d.getScaledHeight();

  let vals={
    tlx: W*.055*strength, tly: HH*.025*strength,
    trx:-W*.055*strength, try: HH*.025*strength,
    blx:-W*.018*strength, bly:-HH*.006*strength,
    brx: W*.018*strength, bry:-HH*.006*strength
  };

  if(z.hakiRegion==='chest-left')vals={
    tlx: W*.09*strength,tly:HH*.025*strength,
    trx:-W*.025*strength,try:HH*.06*strength,
    blx: W*.025*strength,bly:-HH*.015*strength,
    brx:-W*.055*strength,bry:-HH*.035*strength
  };
  if(z.hakiRegion==='chest-right')vals={
    tlx: W*.025*strength,tly:HH*.06*strength,
    trx:-W*.09*strength,try:HH*.025*strength,
    blx: W*.055*strength,bly:-HH*.035*strength,
    brx:-W*.025*strength,bry:-HH*.015*strength
  };
  if(z.hakiRegion==='sleeve-left')vals={
    tlx: W*.15*strength,tly:-HH*.025*strength,
    trx:-W*.035*strength,try:HH*.10*strength,
    blx: W*.075*strength,bly:HH*.025*strength,
    brx:-W*.13*strength,bry:-HH*.07*strength
  };
  if(z.hakiRegion==='sleeve-right')vals={
    tlx: W*.035*strength,tly:HH*.10*strength,
    trx:-W*.15*strength,try:-HH*.025*strength,
    blx: W*.13*strength,bly:-HH*.07*strength,
    brx:-W*.075*strength,bry:HH*.025*strength
  };
  if(z.hakiRegion==='full')vals={
    tlx: W*.065*strength,tly:HH*.018*strength,
    trx:-W*.065*strength,try:HH*.018*strength,
    blx:-W*.025*strength,bly:0,
    brx: W*.025*strength,bry:0
  };
  if((z.hakiRegion||'').startsWith('leg-'))vals={
    tlx: W*.055*strength,tly:0,
    trx:-W*.055*strength,try:HH*.025*strength,
    blx:-W*.035*strength,bly:0,
    brx: W*.035*strength,bry:-HH*.025*strength
  };

  const set=(id,v)=>{const e=H.$('#'+id);if(e)e.value=Math.round(v)};
  set('warpTLX',vals.tlx);set('warpTLY',vals.tly);
  set('warpTRX',vals.trx);set('warpTRY',vals.try);
  set('warpBLX',vals.blx);set('warpBLY',vals.bly);
  set('warpBRX',vals.brx);set('warpBRY',vals.bry);

  // Tell the renderer to bend the interior mesh according to body region + relief.
  H.aiWarpProfile={region:z.hakiRegion||'chest',strength,relief};
  H.canvas.requestRenderAll();
  H.applyWarp();
  setTimeout(()=>{H.aiWarpProfile=null},1200);

  const panel=document.getElementById('sidepanel');
  if(panel)panel.classList.remove('open');
  H.toast('Auto adaptación aplicada · usa Deshacer para revertir');
};


const baseApplyMask=H.applyMask;
H.applyMask=id=>{
  const obj=H.active();
  if(!obj||obj.hakiKind==='printzone')return;
  obj.hakiMaskId=id||'';
  if(!id){obj.clipPath=null;H.snapshot();H.refresh();return}
  const z=H.canvas.getObjects().find(x=>x.hakiId===id);
  if(!z)return;
  if(z.type==='path'){
    z.clone(cp=>{
      cp.set({absolutePositioned:true,selectable:false,evented:false,fill:'#000',stroke:null,opacity:1,excludeFromExport:true});
      obj.clipPath=cp;H.snapshot();H.refresh();H.toast('Máscara de silueta aplicada');
    });
    return;
  }
  baseApplyMask(id);
};


function compactMockupData(o){
  const el=o.getElement(),sw=el.naturalWidth||el.width,sh=el.naturalHeight||el.height;
  const max=420,s=Math.min(1,max/Math.max(sw,sh)),w=Math.max(64,Math.round(sw*s)),h=Math.max(64,Math.round(sh*s));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const x=cv.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(el,0,0,w,h);
  let q=.72,data=cv.toDataURL('image/jpeg',q);
  while(data.length>300000&&q>.35){q-=.08;data=cv.toDataURL('image/jpeg',q)}
  return data;
}
async function depthReliefScore(url){
  return await new Promise((resolve,reject)=>{
    const im=new Image();im.crossOrigin='anonymous';
    im.onload=()=>{
      try{
        const cv=document.createElement('canvas'),w=96,h=Math.max(32,Math.round(96*im.height/im.width));cv.width=w;cv.height=h;
        const x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,w,h);
        const d=x.getImageData(0,0,w,h).data;let m=0,s=0,n=0;
        for(let i=0;i<d.length;i+=16){const L=d[i];m+=L;s+=L*L;n++}
        m/=Math.max(1,n);const sd=Math.sqrt(Math.max(0,s/Math.max(1,n)-m*m));
        resolve(clamp(sd/58,0,1));
      }catch(e){reject(e)}
    };
    im.onerror=reject;im.src=url;
  });
}
H.runDepthAI=async()=>{
  const o=mockup();if(!o){H.toast('Primero añade un mockup');return}
  const out=document.getElementById('aiResult');
  if(out)out.innerHTML='<strong>Profundidad IA…</strong><br><span>Analizando volumen real de la prenda</span>';
  H.status('Calculando profundidad IA…');
  try{
    const r=await fetch('/api/depth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:compactMockupData(o)})});
    const j=await r.json();
    if(r.status===503&&j.code==='NO_TOKEN'){
      if(out)out.innerHTML='<strong>IA local activa</strong><br><span>Profundidad Pro preparada; falta conectar la credencial del servidor.</span>';
      H.status('Listo');H.toast('Profundidad Pro preparada, falta conexión');return;
    }
    if(!r.ok)throw new Error(j.error||'No pude calcular profundidad');
    if(!j.depth)throw new Error('La profundidad todavía está procesándose');
    if(!H.aiAnalysis)await H.analyzeMockupAI();
    const score=await depthReliefScore(j.depth).catch(()=>.45);
    H.aiAnalysis=H.aiAnalysis||{};H.aiAnalysis.depthURL=j.depth;H.aiAnalysis.depthStrength=score;
    const slider=document.getElementById('aiWarpStrength');
    if(slider){slider.value=Math.round(25+score*50);slider.dispatchEvent(new Event('input'))}
    if(out)out.innerHTML='<strong>Profundidad IA lista</strong><br><span>Relieve real detectado · Auto adaptar ajustará la deformación con esta profundidad.</span>';
    H.status('Profundidad IA lista');H.toast('Mapa de profundidad listo');
  }catch(e){
    H.status('Listo');if(out)out.innerHTML='<strong>IA local activa</strong><br><span>'+String(e.message||e)+'</span>';H.toast(e.message||'Error IA');
  }
};

H.installAIUI=()=>{
  const page=document.getElementById('mockupPage');if(!page||document.getElementById('aiMockupCard'))return;
  const card=document.createElement('div');card.className='card';card.id='aiMockupCard';
  card.innerHTML=`
    <h3>IA MOCKUP</h3>
    <p class="hint">Detecta la prenda, su silueta y zonas útiles para colocar diseños.</p>
    <button class="primary wide" id="aiAnalyze">✨ Analizar mockup</button>
    <div id="aiResult" style="margin:9px 0;padding:9px;border:1px solid #303641;border-radius:8px;font-size:11px;color:#b7bec8">Sin analizar</div>
    <div class="grid2"><button id="aiZones" disabled>Crear zonas IA</button><button id="aiAutoFit" disabled>Auto adaptar</button></div>
    <button class="wide" id="aiDepth" style="margin-top:7px">◈ Analizar profundidad IA Pro</button>
    <label style="margin-top:9px">Deformación inteligente <span id="aiWarpValue">55%</span>
      <input id="aiWarpStrength" type="range" min="0" max="100" value="55">
    </label>`;
  page.prepend(card);
  card.querySelector('#aiAnalyze').onclick=H.analyzeMockupAI;
  card.querySelector('#aiZones').onclick=H.createAIZones;
  card.querySelector('#aiAutoFit').onclick=H.autoFitAI;
  card.querySelector('#aiDepth').onclick=H.runDepthAI;
  card.querySelector('#aiWarpStrength').oninput=e=>card.querySelector('#aiWarpValue').textContent=e.target.value+'%';
};
})();