(async()=>{
  const files=['./core.js','./editor.js','./warp.js','./storage.js','./ui.js'];
  for(const src of files){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);});
  }
  window.HAKI.init();
})().catch(()=>{const b=document.getElementById('boot');if(b)b.innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar el editor. Revisa tu conexión.</span>';});
