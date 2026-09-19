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
  const zw=z.getScaledWidth(),zh=z.getScaledHeight(),s=Math.min(zw/d.width,zh/d.height)*.88;
  const c=z.getCenterPoint();
  d.set({left:c.x,top:c.y,originX:'center',originY:'center',scaleX:s,scaleY:s,angle:z.angle||0,globalCompositeOperation:'source-over'});
  d.setCoords();H.canvas.setActiveObject(d);
  H.applyMask(z.hakiId);
  const strength=+(document.getElementById('aiWarpStrength')?.value||35)/100;
  const W=d.getScaledWidth(),HH=d.getScaledHeight();
  let vals={tlx:W*.025*strength,tly:HH*.015*strength,trx:-W*.025*strength,try:HH*.015*strength,blx:0,bly:0,brx:0,bry:0};
  if(z.hakiRegion==='sleeve-left')vals={tlx:W*.08*strength,tly:0,trx:-W*.02*strength,try:HH*.06*strength,blx:W*.03*strength,bly:0,brx:-W*.07*strength,bry:-HH*.04*strength};
  if(z.hakiRegion==='sleeve-right')vals={tlx:W*.02*strength,tly:HH*.06*strength,trx:-W*.08*strength,try:0,blx:W*.07*strength,bly:-HH*.04*strength,brx:-W*.03*strength,bry:0};
  const set=(id,v)=>{const e=H.$('#'+id);if(e)e.value=Math.round(v)};
  set('warpTLX',vals.tlx);set('warpTLY',vals.tly);set('warpTRX',vals.trx);set('warpTRY',vals.try);
  set('warpBLX',vals.blx);set('warpBLY',vals.bly);set('warpBRX',vals.brx);set('warpBRY',vals.bry);
  H.applyWarp();
  H.toast('Diseño adaptado a '+H.objectName(z));
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

H.installAIUI=()=>{
  const page=document.getElementById('mockupPage');if(!page||document.getElementById('aiMockupCard'))return;
  const card=document.createElement('div');card.className='card';card.id='aiMockupCard';
  card.innerHTML=`
    <h3>IA MOCKUP</h3>
    <p class="hint">Detecta la prenda, su silueta y zonas útiles para colocar diseños.</p>
    <button class="primary wide" id="aiAnalyze">✨ Analizar mockup</button>
    <div id="aiResult" style="margin:9px 0;padding:9px;border:1px solid #303641;border-radius:8px;font-size:11px;color:#b7bec8">Sin analizar</div>
    <div class="grid2"><button id="aiZones" disabled>Crear zonas IA</button><button id="aiAutoFit" disabled>Auto adaptar</button></div>
    <label style="margin-top:9px">Deformación inteligente <span id="aiWarpValue">35%</span>
      <input id="aiWarpStrength" type="range" min="0" max="100" value="35">
    </label>`;
  page.prepend(card);
  card.querySelector('#aiAnalyze').onclick=H.analyzeMockupAI;
  card.querySelector('#aiZones').onclick=H.createAIZones;
  card.querySelector('#aiAutoFit').onclick=H.autoFitAI;
  card.querySelector('#aiWarpStrength').oninput=e=>card.querySelector('#aiWarpValue').textContent=e.target.value+'%';
};
})();