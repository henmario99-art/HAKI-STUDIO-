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
  document.documentElement.dataset.hakiVersion='0.2.1';
})().catch(err=>{
  console.error(err);
  const b=document.getElementById('boot');
  if(b)b.innerHTML='<strong>HAKI STUDIO</strong><span>No se pudo cargar el editor. Revisa tu conexión.</span>';
});
