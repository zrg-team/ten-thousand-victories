import Phaser from 'phaser';
import { BufferLayout, ProgramManager } from './RetainedMapRenderer';
type Context = Phaser.Renderer.WebGL.DrawingContext;
type Matrix = Phaser.GameObjects.Components.TransformMatrix;
type Draw = (renderer:Phaser.Renderer.WebGL.WebGLRenderer,source:G,context:Context,parent?:Matrix)=>void;
type G = Phaser.GameObjects.Graphics & {renderWebGL:Draw;_renderSteps:Draw[];customRenderNodes:Record<string,Phaser.Renderer.WebGL.RenderNodes.RenderNode>};
type Suite = {program:Phaser.Renderer.WebGL.Wrappers.WebGLProgramWrapper;vao:Phaser.Renderer.WebGL.Wrappers.WebGLVAOWrapper};
const VERTEX=`
#pragma phaserTemplate(shaderName)
precision highp float;
attribute vec2 inPosition;
attribute vec4 inColor;
uniform vec2 uShift;
uniform mat4 uProjection;
varying vec4 vColor;
void main(){gl_Position=uProjection*vec4(inPosition+uShift,1.0,1.0);vColor=inColor;}`;
const FRAGMENT=`
#pragma phaserTemplate(shaderName)
precision highp float;
varying vec4 vColor;
void main(){gl_FragColor=vec4(vColor.rgb*vColor.a,vColor.a);}`;

/** Keeps Phaser's exact path tessellator, stroke joins, colors and painter order.
 * Only its final immutable triangles are retained. Camera panning changes one
 * uniform; geometry/style/parent transforms and rendering scale invalidate it. */
export class RetainedPathRenderer {
  private records=new Map<G,PathRecord>();
  bytes=0;
  uploads=0;
  builds=0;
  lastError?:string;
  constructor(private scene:Phaser.Scene,private enabled:()=>boolean){}
  sync(sources:Phaser.GameObjects.Graphics[]):void{
    for(const raw of sources){
      const source=raw as G;
      if(!source.scene||this.records.has(source)||source.lighting||source.mask||Object.keys(source.customRenderNodes).length)continue;
      const record=new PathRecord(this,source,this.enabled);this.records.set(source,record);
      source.once('destroy',()=>{record.dispose();this.records.delete(source);});
    }
  }
  renderer(){return this.scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;}
  stats(){return {objects:this.records.size,bytes:this.bytes,uploadedBytes:this.uploads,builds:this.builds,lastError:this.lastError};}
  destroy(){for(const record of this.records.values())record.dispose();this.records.clear();}
}

class PathRecord extends Phaser.Renderer.WebGL.RenderNodes.RenderNode {
  private original:G['renderWebGL'];
  private originalClear:G['clear'];
  private wrapper:G['renderWebGL'];
  private layout?:Phaser.Renderer.WebGL.Wrappers.WebGLVertexBufferLayoutWrapper;
  private indices?:Phaser.Renderer.WebGL.Wrappers.WebGLBufferWrapper;
  private program?:Phaser.Renderer.WebGL.ProgramManager;
  private suite?:Suite;
  private commands?:number[];
  private length=-1;
  private signature=new Float64Array(17).fill(NaN);
  private pose=new Float64Array(17);
  private count=0;
  private bytes=0;
  private tx=0;
  private ty=0;
  private shift=new Float32Array(2);
  private disposed=false;
  private restored=()=>{this.commands=undefined;};
  constructor(private owner:RetainedPathRenderer,private source:G,private enabled:()=>boolean){
    super('RetainedPath',owner.renderer().renderNodes);
    this.original=source.renderWebGL;this.originalClear=source.clear;
    this.wrapper=(renderer,src,context,parent)=>this.render(renderer,src,context,parent);
    source.renderWebGL=this.wrapper;
    const index=source._renderSteps.indexOf(this.original);if(index>=0)source._renderSteps[index]=this.wrapper;
    source.clear=()=>{this.commands=undefined;return this.originalClear.call(source);};
    owner.renderer().on(Phaser.Renderer.Events.RESTORE_WEBGL,this.restored);
  }
  private render(renderer:Phaser.Renderer.WebGL.WebGLRenderer,source:G,context:Context,parent?:Matrix):void{
    const camera=context.camera!;
    if(!this.enabled()||source.lighting||source.mask||source.blendMode!==Phaser.BlendModes.NORMAL||camera.alpha!==1||source.commandBuffer.length===0){this.original(renderer,source,context,parent);return;}
    const m=camera.getViewMatrix(!context.useCanvas),p=this.pose;
    p.set([source.x,source.y,source.scaleX,source.scaleY,source.rotation,source.alpha,source.pathDetailThreshold,
      m.a,m.b,m.c,m.d,parent?.a??1,parent?.b??0,parent?.c??0,parent?.d??1,parent?.tx??0,parent?.ty??0]);
    if(this.commands!==source.commandBuffer||this.length!==source.commandBuffer.length||p.some((v,i)=>v!==this.signature[i])){
      this.release();this.commands=source.commandBuffer;this.length=this.commands.length;this.signature.set(p);this.tx=m.tx;this.ty=m.ty;
      const vertices:number[]=[],indices:number[]=[];
      const capture={batch:(_c:Context,triangles:number[],positions:number[],colors:number[])=>{
        const base=vertices.length/6;
        if(base+positions.length/2>65535)throw new Error('Retained path vertex limit');
        for(let i=0;i<positions.length;i+=2){const color=colors[i/2];vertices.push(positions[i],positions[i+1],(color>>>16&255)/255,(color>>>8&255)/255,(color&255)/255,(color>>>24)/255);}
        for(const index of triangles)indices.push(base+index);
      }};
      const custom=source.customRenderNodes.Submitter;
      source.customRenderNodes.Submitter=capture as unknown as Phaser.Renderer.WebGL.RenderNodes.RenderNode;
      try{this.original(renderer,source,context,parent);}
      catch(error){this.owner.lastError=String(error);vertices.length=0;indices.length=0;}
      finally{if(custom)source.customRenderNodes.Submitter=custom;else delete source.customRenderNodes.Submitter;}
      const bytes=vertices.length*4+indices.length*2;
      if(indices.length&&this.owner.bytes+bytes<=8*1048576){
        renderer.renderNodes.startStandAloneRender();
        renderer.glWrapper.updateVAO({vao:null} as unknown as Parameters<typeof renderer.glWrapper.updateVAO>[0]);
        this.layout=new BufferLayout(renderer,{count:vertices.length/6,usage:'STATIC_DRAW',layout:[{name:'inPosition',size:2,type:'FLOAT'},{name:'inColor',size:4,type:'FLOAT'}]},null);
        this.indices=renderer.createIndexBuffer(new Uint16Array(indices).buffer,renderer.gl.STATIC_DRAW);
        this.layout.buffer.viewF32!.set(vertices);this.layout.buffer.update();
        this.program=new ProgramManager(renderer,[this.layout],this.indices);this.program.setBaseShader('RetainedPath',VERTEX,FRAGMENT);
        this.count=indices.length;this.bytes=bytes;this.owner.bytes+=bytes;this.owner.uploads+=bytes;this.owner.builds++;
      }
    }
    if(!this.program){this.original(renderer,source,context,parent);return;}
    this.suite??=(this.program.getCurrentProgramSuite() as Suite|null)??undefined;
    if(!this.suite){this.original(renderer,source,context,parent);return;}
    renderer.renderNodes.startStandAloneRender();this.onRunBegin(context);camera.addToRenderList(source);
    this.shift[0]=m.tx-this.tx;this.shift[1]=m.ty-this.ty;
    renderer.setProjectionMatrixFromDrawingContext(context);
    this.program.setUniform('uShift',this.shift);this.program.setUniform('uProjection',renderer.projectionMatrix.val);this.program.applyUniforms(this.suite.program);
    renderer.drawElements(context,[],this.suite.program,this.suite.vao,this.count,0,renderer.gl.TRIANGLES);this.onRunEnd(context);
  }
  private release():void{
    const renderer=this.owner.renderer();
    if(this.suite){const index=renderer.glVAOWrappers.indexOf(this.suite.vao);if(index>=0)renderer.glVAOWrappers.splice(index,1);this.suite.vao.destroy();}
    if(this.layout)renderer.deleteBuffer(this.layout.buffer);if(this.indices)renderer.deleteBuffer(this.indices);
    this.owner.bytes-=this.bytes;this.bytes=0;this.layout=undefined;this.indices=undefined;this.program=undefined;this.suite=undefined;
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.release();
    if(this.source.renderWebGL===this.wrapper){this.source.renderWebGL=this.original;this.source.clear=this.originalClear;}
    const index=this.source._renderSteps?.indexOf(this.wrapper)??-1;if(index>=0)this.source._renderSteps[index]=this.original;
    this.owner.renderer().off(Phaser.Renderer.Events.RESTORE_WEBGL,this.restored);
  }
}
