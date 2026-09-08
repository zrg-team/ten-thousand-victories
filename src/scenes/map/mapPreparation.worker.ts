import { partitionGraphics } from './GraphicsPartition';
import { rasterChunk } from './ChunkRaster';

// Deliberately imports no Phaser, DOM, save or authoritative simulation modules.
const scope = self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage(message:unknown,transfer:Transferable[]):void};
const recycled:ArrayBuffer[]=[];
scope.onmessage = event => {
  if(event.data.kind==='raster'){
    const {id,generation,revision,chunk}=event.data;
    try{const start=performance.now(),canvas=rasterChunk(chunk),bitmap=canvas.transferToImageBitmap();scope.postMessage({id,generation,revision,bitmap,rasterMs:performance.now()-start},[bitmap]);}
    catch(error){scope.postMessage({id,generation,revision,error:String(error)},[]);}
    return;
  }
  if(event.data.kind==='recycle'){
    let bytes=recycled.reduce((n,b)=>n+b.byteLength,0);
    for(const buffer of event.data.buffers){if(bytes+buffer.byteLength<=16*1048576&&recycled.length<64){recycled.push(buffer);bytes+=buffer.byteLength;}}
    return;
  }
  const {id,generation,revision,buffer,matrix}=event.data;
  try {
    const iterator=partitionGraphics(new Float64Array(buffer),matrix);
    let step=iterator.next();while(!step.done)step=iterator.next();
    const cells=[...step.value].map(([key,cell])=>{
      const index=recycled.findIndex(b=>b.byteLength===cell.commands.length*8);
      const data=index<0?new Float64Array(cell.commands.length):new Float64Array(recycled.splice(index,1)[0]);data.set(cell.commands);
      return {key,hash:cell.hash,buffer:data.buffer};
    });
    scope.postMessage({id,generation,revision,input:buffer,cells},[buffer,...cells.map(cell=>cell.buffer)]);
  }catch(error){scope.postMessage({id,generation,revision,input:buffer,error:String(error)},[buffer]);}
};
