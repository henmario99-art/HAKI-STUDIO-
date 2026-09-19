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
  window.HAKI.init();
})().catch(err=>{
  console.error(err);
  const b=document.getElementById('boot');
  if(b)b.innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar el editor. Revisa tu conexión.</span>';
});
