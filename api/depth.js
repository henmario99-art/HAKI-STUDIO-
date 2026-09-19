module.exports = async function handler(req,res){
  if(req.method!=='POST'){res.status(405).json({error:'POST only'});return}
  const token=process.env.REPLICATE_API_TOKEN;
  if(!token){res.status(503).json({error:'IA de profundidad no configurada',code:'NO_TOKEN'});return}
  const image=req.body&&req.body.image;
  if(!image||typeof image!=='string'){res.status(400).json({error:'Falta image'});return}
  try{
    const r=await fetch('https://api.replicate.com/v1/predictions',{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+token,
        'Content-Type':'application/json',
        'Prefer':'wait=30',
        'Cancel-After':'45s'
      },
      body:JSON.stringify({
        version:'chenxwh/depth-anything-v2:b239ea33cff32bb7abb5db39ffe9a09c14cbc2894331d1ef66fe096eed88ebd4',
        input:{image,model_size:'Small'}
      })
    });
    const data=await r.json();
    if(!r.ok){res.status(r.status).json({error:data.detail||data.error||'Error de profundidad'});return}
    if(data.output&&data.output.grey_depth){
      res.status(200).json({status:'succeeded',depth:data.output.grey_depth,colorDepth:data.output.color_depth||null});
      return;
    }
    res.status(202).json({status:data.status||'processing',id:data.id||null});
  }catch(e){
    res.status(500).json({error:e.message||'Error interno'});
  }
};