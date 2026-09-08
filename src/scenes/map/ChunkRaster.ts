/** OffscreenCanvas experiment. The main Phaser canvas is never transferred.
 * Unsupported paint styles fail explicitly so the caller keeps the WebGL chunk.
 * Canvas and WebGL path edge rasterization are different; this is not enabled
 * for gameplay until image comparisons and end-to-end timings pass. */
export interface RasterPart { commands: number[]; matrix: number[]; alpha: number }
export interface RasterChunk { width:number; height:number; parts:RasterPart[] }
export function rasterChunk(chunk:RasterChunk):OffscreenCanvas {
  if(chunk.width*chunk.height*4>16*1048576||chunk.width<=0||chunk.height<=0)throw Error('Raster staging budget exceeded');
  const canvas=new OffscreenCanvas(chunk.width,chunk.height),ctx=canvas.getContext('2d');
  if(!ctx)throw Error('OffscreenCanvas 2D unavailable');
  const color=(n:number,a:number)=>`rgba(${n>>>16&255},${n>>>8&255},${n&255},${a})`;
  for(const part of chunk.parts){
    ctx.save();const m=part.matrix;ctx.setTransform(m[0],m[1],m[2],m[3],m[4],m[5]);ctx.globalAlpha=part.alpha;
    const c=part.commands;ctx.beginPath();
    for(let i=0;i<c.length;){
      const op=c[i++];
      switch(op){
        case 0:ctx.arc(c[i],c[i+1],c[i+2],c[i+3],c[i+4],!!c[i+5]);i+=7;break;
        case 1:ctx.beginPath();break;
        case 2:ctx.closePath();break;
        case 3:ctx.fillRect(c[i],c[i+1],c[i+2],c[i+3]);i+=4;break;
        case 4:ctx.lineTo(c[i],c[i+1]);i+=2;break;
        case 5:ctx.moveTo(c[i],c[i+1]);i+=2;break;
        case 6:ctx.lineWidth=c[i];ctx.strokeStyle=color(c[i+1],c[i+2]);i+=3;break;
        case 7:ctx.fillStyle=color(c[i],c[i+1]);i+=2;break;
        case 8:ctx.fill();break;
        case 9:ctx.stroke();break;
        case 10:case 11:ctx.beginPath();ctx.moveTo(c[i],c[i+1]);ctx.lineTo(c[i+2],c[i+3]);ctx.lineTo(c[i+4],c[i+5]);ctx.closePath();if(op===10)ctx.fill();else ctx.stroke();i+=6;break;
        case 14:ctx.save();break;
        case 15:ctx.restore();break;
        case 16:ctx.translate(c[i],c[i+1]);i+=2;break;
        case 17:ctx.scale(c[i],c[i+1]);i+=2;break;
        case 18:ctx.rotate(c[i++]);break;
        default:throw Error(`Unsupported canvas paint command ${op}`);
      }
    }
    ctx.restore();
  }
  return canvas;
}
