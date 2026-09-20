(()=>{
'use strict';
const H=window.HAKI={canvas:null,tool:'select',panning:false,lastX:0,lastY:0,history:[],future:[],restoring:false,filterTimer:null,PRINT_COLOR:'#33ddff'};
H.$=s=>document.querySelector(s); H.$$=s=>[...document.querySelectorAll(s)];
H.toast=msg=>{const t=H.$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),1600)};
H.status=msg=>H.$('#status').textContent=msg;
H.uid=()=>`h${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
H.active=()=>H.canvas.getActiveObject();
H.isImage=o=>!!o&&o.type==='image';
H.objectName=o=>o?.hakiName||(o?.type==='i-text'?'Texto':o?.type==='rect'?'Rectángulo':o?.type==='circle'?'Círculo':o?.type==='path'?'Pincel':o?.type==='image'?'Imagen':'Capa');
H.addMeta=(o,kind,name)=>{o.hakiId=H.uid();o.hakiKind=kind;o.hakiName=name;o.hakiVisible=true;return o};
H.escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
H.colorHex=v=>/^#[0-9a-f]{6}$/i.test(v||'')?v:'#ffffff';
H.cap=s=>s[0].toUpperCase()+s.slice(1);
H.snapshot=()=>{if(H.restoring)return;const j=JSON.stringify(H.canvas.toJSON(['hakiId','hakiKind','hakiName','hakiVisible','hakiMaskId','hakiFilters','selectable','evented']));if(H.history.at(-1)===j)return;H.history.push(j);if(H.history.length>60)H.history.shift();H.future=[]};
H.markModified=()=>{if(H.restoring)return;clearTimeout(H._mod);H._mod=setTimeout(H.snapshot,180)};
H.restore=j=>{H.restoring=true;H.canvas.loadFromJSON(j,()=>{H.restoring=false;H.canvas.renderAll();H.refresh()})};
H.undo=()=>{if(H.history.length<2)return;H.future.push(H.history.pop());H.restore(H.history.at(-1))};
H.redo=()=>{if(!H.future.length)return;const j=H.future.pop();H.history.push(j);H.restore(j)};

H.bindCanvas=()=>{
 const c=H.canvas;
 c.on('selection:created',H.refresh);c.on('selection:updated',H.refresh);c.on('selection:cleared',H.refresh);
 c.on('object:modified',()=>{H.markModified();H.refresh()});c.on('object:added',()=>{if(!H.restoring)H.refresh()});c.on('object:removed',()=>{if(!H.restoring)H.refresh()});
 c.on('mouse:wheel',opt=>{const e=opt.e;e.preventDefault();e.stopPropagation();let z=c.getZoom()*0.999**e.deltaY;z=Math.max(.08,Math.min(6,z));c.zoomToPoint({x:e.offsetX,y:e.offsetY},z);H.updateZoom()});
 c.on('mouse:down',opt=>{const e=opt.e;if(H.tool==='hand'||e.altKey||e.button===1){H.panning=true;H.lastX=e.clientX;H.lastY=e.clientY;c.selection=false;c.setCursor('grabbing');return}if(!opt.target){const p=c.getPointer(e);if(H.tool==='text'){H.addText(p.x,p.y);H.setTool('select')}else if(H.tool==='rect'){H.addRect(p.x,p.y);H.setTool('select')}else if(H.tool==='circle'){H.addCircle(p.x,p.y);H.setTool('select')}else if(H.tool==='printzone'){H.addPrintZone(p.x,p.y);H.setTool('select')}}});
 c.on('mouse:move',opt=>{if(!H.panning)return;const e=opt.e,v=c.viewportTransform;v[4]+=e.clientX-H.lastX;v[5]+=e.clientY-H.lastY;c.requestRenderAll();H.lastX=e.clientX;H.lastY=e.clientY});
 c.on('mouse:up',()=>{if(H.panning){H.panning=false;c.selection=true;c.setCursor('default')}});
 c.on('path:created',e=>{H.addMeta(e.path,'design','Pincel');e.path.set({strokeWidth:6,stroke:'#fff'});H.markModified();H.refresh()});
};

H.refresh=()=>{if(!H.canvas)return;const o=H.active();H.$('#selectionStatus').textContent=o?H.objectName(o):'Sin selección';H.$('#emptyState').classList.toggle('hidden',H.canvas.getObjects().some(x=>x.hakiKind!=='printzone'));H.refreshProps(o);H.refreshLayers();H.refreshMasks();H.canvas.requestRenderAll()};
H.refreshProps=o=>{
 const ids=['pLeft','pTop','pWidth','pHeight','pAngle','pOpacity','pSkewX','pSkewY','pBlend','pFill','pStroke','pStrokeWidth'];ids.forEach(id=>H.$('#'+id).disabled=!o);H.$$('.image-only').forEach(el=>el.style.display=H.isImage(o)?'block':'none');H.$('#textControls').style.display=o?.type==='i-text'?'block':'none';if(!o)return;
 H.$('#pLeft').value=Math.round(o.left||0);H.$('#pTop').value=Math.round(o.top||0);H.$('#pWidth').value=Math.round(o.getScaledWidth());H.$('#pHeight').value=Math.round(o.getScaledHeight());H.$('#pAngle').value=Math.round(o.angle||0);H.$('#pOpacity').value=Math.round((o.opacity??1)*100);H.$('#pSkewX').value=Math.round(o.skewX||0);H.$('#pSkewY').value=Math.round(o.skewY||0);H.$('#pBlend').value=o.globalCompositeOperation||'source-over';H.$('#pFill').value=H.colorHex(typeof o.fill==='string'?o.fill:'#fff');H.$('#pStroke').value=H.colorHex(typeof o.stroke==='string'?o.stroke:'#000');H.$('#pStrokeWidth').value=o.strokeWidth||0;
 if(o.type==='i-text'){H.$('#textValue').value=o.text||'';H.$('#fontSize').value=o.fontSize||60;H.$('#fontWeight').value=o.fontWeight||'400';H.$('#fontFamily').value=o.fontFamily||'Arial'}
 if(H.isImage(o)){const v=o.hakiFilters||{brightness:0,contrast:0,saturation:0,blur:0};['brightness','contrast','saturation','blur'].forEach(k=>{H.$('#f'+H.cap(k)).value=v[k]||0;H.$('#'+k+'Value').textContent=v[k]||0})}
};
H.refreshLayers=()=>{const box=H.$('#layerList');box.innerHTML='';[...H.canvas.getObjects()].reverse().forEach(o=>{const r=document.createElement('div');r.className='layer'+(o===H.active()?' active':'');r.innerHTML=`<button class="vis">${o.visible?'◉':'○'}</button><button class="lock">${o.selectable?'🔓':'🔒'}</button><div class="layer-name">${H.escapeHtml(H.objectName(o))}</div><span class="layer-kind">${o.hakiKind==='mockup'?'MOCKUP':o.hakiKind==='printzone'?'ZONA':'CAPA'}</span>`;r.querySelector('.layer-name').onclick=()=>{H.canvas.setActiveObject(o);H.refresh()};r.querySelector('.vis').onclick=()=>{o.visible=!o.visible;H.snapshot();H.refresh()};r.querySelector('.lock').onclick=()=>{const v=!o.selectable;o.selectable=v;o.evented=v;H.snapshot();H.refresh()};box.appendChild(r)})};
H.refreshMasks=()=>{const s=H.$('#maskSelect'),cur=H.active()?.hakiMaskId||'';s.innerHTML='<option value="">Sin máscara</option>';H.canvas.getObjects().filter(o=>o.hakiKind==='printzone').forEach(z=>{const p=document.createElement('option');p.value=z.hakiId;p.textContent=H.objectName(z);s.appendChild(p)});s.value=cur};
H.fit=()=>{const r=H.$('#workspace').getBoundingClientRect(),w=H.canvas.getWidth(),h=H.canvas.getHeight(),z=Math.min((r.width-28)/w,(r.height-28)/h,1.3);H.canvas.setViewportTransform([z,0,0,z,Math.max(12,(r.width-w*z)/2),Math.max(12,(r.height-h*z)/2)]);H.updateZoom()};
H.zoomBy=f=>{const z=Math.max(.08,Math.min(6,H.canvas.getZoom()*f)),r=H.$('#workspace').getBoundingClientRect();H.canvas.zoomToPoint({x:r.width/2,y:r.height/2},z);H.updateZoom()};
H.updateZoom=()=>H.$('#zoomText').textContent=Math.round(H.canvas.getZoom()*100)+'%';
H.init=()=>{if(!window.fabric){H.$('#boot').innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar Fabric.js.</span>';return}fabric.Object.prototype.transparentCorners=false;fabric.Object.prototype.cornerStyle='circle';fabric.Object.prototype.cornerColor='#43dcff';fabric.Object.prototype.borderColor='#43dcff';H.canvas=new fabric.Canvas('c',{preserveObjectStacking:true,selection:true,fireRightClick:true,stopContextMenu:true});H.canvas.setWidth(1200);H.canvas.setHeight(1200);H.canvas.backgroundColor='rgba(0,0,0,0)';H.bindCanvas();H.bindUI();H.snapshot();H.fit();H.refresh();H.$('#boot').classList.add('hidden');H.$('#app').classList.remove('hidden');if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{})};
})();
