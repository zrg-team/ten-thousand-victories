/** Query both WebGL timer APIs. Phaser's WebGL 1 context uses the EXT methods. */
export async function gpuSample(page) {
 return page.evaluate(async()=>{
  const g=window.__phaserGame,gl=g.renderer.gl;
  const modern=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const ext=modern??gl.getExtension('EXT_disjoint_timer_query');
  if(!ext)return {available:false,reason:'No disjoint timer query extension'};
  const create=()=>modern?gl.createQuery():ext.createQueryEXT();
  const begin=q=>modern?gl.beginQuery(ext.TIME_ELAPSED_EXT,q):ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);
  const end=()=>modern?gl.endQuery(ext.TIME_ELAPSED_EXT):ext.endQueryEXT(ext.TIME_ELAPSED_EXT);
  const ready=q=>modern?gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT);
  const value=q=>modern?gl.getQueryParameter(q,gl.QUERY_RESULT):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT);
  const remove=q=>modern?gl.deleteQuery(q):ext.deleteQueryEXT(q);
  const pending=[],ms=[];let query,discarded=0;
  const collect=()=>{
   if(gl.getParameter(ext.GPU_DISJOINT_EXT)){discarded+=pending.length;for(const q of pending)remove(q);pending.length=0;return;}
   while(pending.length&&ready(pending[0])){const q=pending.shift();ms.push(value(q)/1e6);remove(q);}
  };
  const pre=()=>{collect();if(pending.length<8){query=create();begin(query);}};
  const post=()=>{if(query){end();pending.push(query);query=undefined;}};
  try {
   g.events.on('prestep',pre);g.events.on('postrender',post);
   await new Promise(r=>setTimeout(r,2000));
  } finally {g.events.off('prestep',pre);g.events.off('postrender',post);if(query){end();remove(query);}}
  await new Promise(r=>setTimeout(r,200));collect();const unresolved=pending.length;for(const q of pending)remove(q);
  return {available:true,api:modern?'WebGL2':'WebGL1 EXT',ms,discarded,unresolved,separateFromTimingWindows:true};
 });
}
