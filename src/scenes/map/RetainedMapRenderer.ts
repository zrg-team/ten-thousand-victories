import Phaser from 'phaser';
import { RetainedPathRenderer } from './RetainedPathRenderer';

type Image = Phaser.GameObjects.Image;
type Object = Phaser.GameObjects.GameObject;
type Context = Phaser.Renderer.WebGL.DrawingContext;
type Filter = (children: Object[], camera: Phaser.Cameras.Scene2D.Camera) => Object[];
type Suite = { program: Phaser.Renderer.WebGL.Wrappers.WebGLProgramWrapper; vao: Phaser.Renderer.WebGL.Wrappers.WebGLVAOWrapper };
// Phaser 4.2.1's generated declarations retain the older constructor argument types.
// These signatures follow the bundled JS implementations; keep the bridge in one place.
export const BufferLayout = Phaser.Renderer.WebGL.Wrappers.WebGLVertexBufferLayoutWrapper as unknown as new (
  renderer: Phaser.Renderer.WebGL.WebGLRenderer, layout: {count:number;usage:string;layout:Array<{name:string;size:number;type:string}>},
  buffer: null) => Phaser.Renderer.WebGL.Wrappers.WebGLVertexBufferLayoutWrapper;
export const ProgramManager = Phaser.Renderer.WebGL.ProgramManager as unknown as new (
  renderer: Phaser.Renderer.WebGL.WebGLRenderer, layouts: Phaser.Renderer.WebGL.Wrappers.WebGLVertexBufferLayoutWrapper[],
  indices: Phaser.Renderer.WebGL.Wrappers.WebGLBufferWrapper) => Phaser.Renderer.WebGL.ProgramManager;
const VS = `
#pragma phaserTemplate(shaderName)
precision highp float;
attribute vec2 inPosition;
attribute vec2 inUV;
attribute vec4 inColor;
attribute float inTexture;
attribute float inRound;
uniform mat3 uView;
uniform mat4 uProjection;
varying vec2 vUV;
varying vec4 vColor;
varying float vTexture;
void main(){vec3 p=uView*vec3(inPosition,1.0);if(inRound>0.5)p.xy=floor(p.xy+0.5);gl_Position=uProjection*vec4(p.xy,1.0,1.0);vUV=inUV;vColor=inColor;vTexture=inTexture;}`;
const FS = `
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uTextures[8];
varying vec2 vUV;
varying vec4 vColor;
varying float vTexture;
void main(){vec4 c;
if(vTexture<0.5)c=texture2D(uTextures[0],vUV);
else if(vTexture<1.5)c=texture2D(uTextures[1],vUV);
else if(vTexture<2.5)c=texture2D(uTextures[2],vUV);
else if(vTexture<3.5)c=texture2D(uTextures[3],vUV);
else if(vTexture<4.5)c=texture2D(uTextures[4],vUV);
else if(vTexture<5.5)c=texture2D(uTextures[5],vUV);
else if(vTexture<6.5)c=texture2D(uTextures[6],vUV);
else c=texture2D(uTextures[7],vUV);
gl_FragColor=vec4(c.rgb*vColor.rgb*vColor.a,c.a*vColor.a);}`;

/** A retained, multi-texture buffer, not a second scene or a rasterized copy of the artwork.
 * Only immutable, ordinary image quads enter it. Phaser still owns their visibility and order.
 * Camera filtering replaces contiguous visible image runs with lightweight range objects;
 * moving objects, masks and Graphics keep their exact intervening positions. */
export class RetainedMapRenderer {
  enabled = true;
  private readonly renderer: Phaser.Renderer.WebGL.WebGLRenderer;
  private readonly cameraManager: { getVisibleChildren: Filter };
  private readonly original: Filter;
  private node?: SceneryNode;
  private members = new Map<Object, number>();
  private ranges: SceneryRange[] = [];
  private output: Object[] = [];
  private order: number[] = [];
  private previousOrder: number[] = [];
  private dirty = true;
  private zoom = NaN;
  private disposed = false;
  private uploaded = 0;
  private indexUploaded = 0;
  private builds = 0;
  private paths: RetainedPathRenderer;
  private readonly change = () => { this.dirty = true; };

  constructor(private scene: Phaser.Scene, private preparing: () => boolean = () => false,
    private pathSources: () => Phaser.GameObjects.Graphics[] = () => []) {
    this.renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    this.paths = new RetainedPathRenderer(scene,()=>this.enabled && !this.preparing());
    this.cameraManager = scene.cameras as unknown as { getVisibleChildren: Filter };
    this.original = this.cameraManager.getVisibleChildren;
    this.cameraManager.getVisibleChildren = (children, camera) => this.filter(children, camera);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    this.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.change);
  }

  invalidate(): void { this.dirty = true; }
  private eligible(object: Object): object is Image {
    return object instanceof Phaser.GameObjects.Image && (!!object.getData('decorationKey')||object.getData('conquestGroundOrder')==='settlement')
      && !object.parentContainer && !object.mask && !object.isCropped && !object.lighting
      && object.blendMode === Phaser.BlendModes.NORMAL && object.tintMode === 0
      && object.scrollFactorX === 1 && object.scrollFactorY === 1
      && Object.keys(object.customRenderNodes).length === 0;
  }

  private rebuild(children: Object[], camera: Phaser.Cameras.Scene2D.Camera): void {
    if(new URLSearchParams(location.search).get('retainedpaths')!=='0')this.paths.sync(this.pathSources());
    this.node?.dispose(); this.node = undefined; this.members.clear(); this.previousOrder.length = 0;
    const images: Image[] = [], textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[] = [];
    const textureSlots: number[] = [];
    for (const object of children) {
      if (!this.eligible(object) || images.length >= 16384) continue;
      const texture = object.frame.source.glTexture;
      if (!texture) continue;
      let slot = textures.indexOf(texture);
      if (slot < 0) { if (textures.length === 8) continue; slot = textures.length; textures.push(texture); }
      this.members.set(object, images.length); images.push(object); textureSlots.push(slot);
    }
    if (images.length < 8) { this.members.clear(); this.dirty = false; return; }
    this.node = new SceneryNode(this.renderer, images, textureSlots, textures, camera);
    this.uploaded += this.node.vertexBytes; this.builds++; this.dirty = false; this.zoom = camera.zoom;
  }

  private filter(children: Object[], camera: Phaser.Cameras.Scene2D.Camera): Object[] {
    // Preparation can change tint, frame and placement over several yielding steps.
    // Draw those transitional frames normally, then rebuild once from the completed
    // revision. A pan alone never changes this revision.
    if (this.preparing()) {this.dirty=true;return this.original.call(this.cameraManager,children,camera);}
    if (!this.enabled || this.disposed || this.renderer.contextLost || camera !== this.scene.cameras.main || camera.alpha !== 1) return this.original.call(this.cameraManager, children, camera);
    if (this.dirty || this.zoom !== camera.zoom) this.rebuild(children, camera);
    const node = this.node;
    if (!node || !node.ready()) return this.original.call(this.cameraManager, children, camera);
    this.output.length = 0; this.order.length = 0;
    let range: SceneryRange | undefined, count = 0;
    for (const object of children) {
      if (!object.willRender(camera)) continue;
      const index = this.members.get(object);
      if (index === undefined) { this.output.push(object); range = undefined; continue; }
      if (!range) {
        range = this.ranges[count] ?? (this.ranges[count] = new SceneryRange(this.scene)); count++;
        range.node = node; range.offset = this.order.length * 12; range.count = 0;
        this.output.push(range);
      }
      this.order.push(index); range.count += 6;
    }
    if (this.order.length !== this.previousOrder.length || this.order.some((id, i) => id !== this.previousOrder[i])) {
      node.setVisible(this.order); this.indexUploaded += this.order.length * 12;
      const previous = this.previousOrder; this.previousOrder = this.order; this.order = previous;
    }
    return this.output;
  }

  stats() { return { paths:this.paths.stats(),objects: this.members.size, builds: this.builds, vertexBytes: this.node?.vertexBytes ?? 0,
    vertexUploadedBytes: this.uploaded, indexUploadedBytes: this.indexUploaded, ranges: this.ranges.length }; }
  destroy(): void {
    if (this.disposed) return; this.disposed = true;
    this.cameraManager.getVisibleChildren = this.original; this.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.change);
    this.node?.dispose(); this.node = undefined; this.members.clear();
    this.paths.destroy();
    for (const range of this.ranges) range.destroy(); this.ranges.length = 0;
    this.output.length = 0; this.order.length = 0; this.previousOrder.length = 0;
  }
}

class SceneryRange extends Phaser.GameObjects.Image {
  node!: SceneryNode;
  offset = 0;
  count = 0;
  constructor(scene: Phaser.Scene) { super(scene, 0, 0, '__WHITE'); }
  renderWebGL(_renderer: Phaser.Renderer.WebGL.WebGLRenderer, source: SceneryRange, context: Context): void {
    // Phaser invokes renderWebGL as an unbound function.
    source.node.run(context, source.count, source.offset);
  }
}

class SceneryNode extends Phaser.Renderer.WebGL.RenderNodes.RenderNode {
  private readonly layout: Phaser.Renderer.WebGL.Wrappers.WebGLVertexBufferLayoutWrapper;
  private readonly indices: Phaser.Renderer.WebGL.Wrappers.WebGLBufferWrapper;
  private readonly program: Phaser.Renderer.WebGL.ProgramManager;
  readonly vertexBytes: number;
  private readonly matrix = new Float32Array(9);
  private lastContext?: Context;
  private lastFrame = -1;
  private suite?: Suite;
  ready(): boolean {
    this.suite ??= (this.program.getCurrentProgramSuite() as Suite | null) ?? undefined;
    return !!this.suite;
  }
  constructor(private renderer: Phaser.Renderer.WebGL.WebGLRenderer, images: Image[], slots: number[],
    private textures: Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper[], camera: Phaser.Cameras.Scene2D.Camera) {
    super('RetainedScenery', renderer.renderNodes);
    this.layout = new BufferLayout(renderer, {
      count: images.length * 4, usage: 'STATIC_DRAW', layout: [
        { name: 'inPosition', size: 2, type: 'FLOAT' }, { name: 'inUV', size: 2, type: 'FLOAT' },
        { name: 'inColor', size: 4, type: 'FLOAT' }, { name: 'inTexture', size: 1, type: 'FLOAT' },
        { name: 'inRound', size: 1, type: 'FLOAT' },
      ],
    }, null);
    renderer.glWrapper.updateVAO({ vao: null } as unknown as Parameters<typeof renderer.glWrapper.updateVAO>[0]);
    this.indices = renderer.createIndexBuffer(new ArrayBuffer(images.length * 12), renderer.gl.DYNAMIC_DRAW);
    this.program = new ProgramManager(renderer, [this.layout], this.indices);
    this.program.setBaseShader('RetainedScenery', VS, FS);
    this.program.setUniform('uTextures[0]', [0,1,2,3,4,5,6,7]);
    const data = this.layout.buffer.viewF32!;
    images.forEach((image, id) => {
      const f = image.frame;
      let x = -image.displayOriginX + f.x, y = -image.displayOriginY + f.y;
      if (image.flipX && !f.customPivot) x += -f.realWidth + image.displayOriginX * 2;
      if (image.flipY && !f.customPivot) y += -f.realHeight + image.displayOriginY * 2;
      const w=f.cutWidth/f.source.resolution,h=f.cutHeight/f.source.resolution;
      const m = new Phaser.GameObjects.Components.TransformMatrix();
      m.applyITRS(image.x,image.y,image.rotation,image.scaleX*(image.flipX?-1:1),image.scaleY*(image.flipY?-1:1));
      const points = [[x,y,f.u0,f.v0,image.tintTopLeft,image.alphaTopLeft],[x,y+h,f.u0,f.v1,image.tintBottomLeft,image.alphaBottomLeft],
        [x+w,y+h,f.u1,f.v1,image.tintBottomRight,image.alphaBottomRight],[x+w,y,f.u1,f.v0,image.tintTopRight,image.alphaTopRight]];
      const cm = camera.getViewMatrix(true);
      const onlyTranslate = Math.fround(cm.a*m.a+cm.c*m.b)===1 && Math.fround(cm.b*m.a+cm.d*m.b)===0
        && Math.fround(cm.a*m.c+cm.c*m.d)===0 && Math.fround(cm.b*m.c+cm.d*m.d)===1;
      const round = image.willRoundVertices(camera, onlyTranslate) ? 1 : 0;
      points.forEach(([px,py,u,v,tint,alpha],corner)=>data.set([m.getX(px,py),m.getY(px,py),u,v,((tint>>16)&255)/255,((tint>>8)&255)/255,(tint&255)/255,Math.floor(alpha*255)/255,slots[id],round],(id*4+corner)*10));
      m.destroy();
    });
    this.layout.buffer.update(); this.vertexBytes = data.byteLength;
  }
  setVisible(order: number[]): void {
    // ELEMENT_ARRAY_BUFFER bindings belong to the current VAO. Upload on the
    // default VAO so changing visibility cannot overwrite Phaser's text/quad indices.
    this.renderer.glWrapper.updateVAO({ vao: null } as unknown as Parameters<typeof this.renderer.glWrapper.updateVAO>[0]);
    // Phaser tracks the EBO binding globally although WebGL stores it per VAO.
    // Explicitly unbind before and after uploading; otherwise a newly created VAO
    // can skip its index binding because the global cache still names this buffer.
    this.indices.bind(true);
    const data = this.indices.viewU16!;
    // Match Phaser's TL/BL/TR/BR strip diagonal, including corner tint interpolation.
    for (let i=0;i<order.length;i++) {const v=order[i]*4,j=i*6;data[j]=v;data[j+1]=v+1;data[j+2]=v+3;data[j+3]=v+3;data[j+4]=v+1;data[j+5]=v+2;}
    this.indices.update(order.length*12);
    this.indices.bind(true);
  }
  run(context: Context, count: number, offset: number): void {
    if (!count) return;
    this.manager.startStandAloneRender(); this.onRunBegin(context);
    const suite=this.suite;
    if(suite){
      const frame=this.renderer.game.loop.frame;
      const view=context.camera!.getViewMatrix(!context.useCanvas);
      if(this.lastFrame!==frame||this.lastContext!==context||this.matrix[0]!==view.a||this.matrix[1]!==view.b||this.matrix[3]!==view.c||this.matrix[4]!==view.d||this.matrix[6]!==view.tx||this.matrix[7]!==view.ty){
        this.lastFrame=frame;this.lastContext=context;
        this.matrix.set([view.a,view.b,0,view.c,view.d,0,view.tx,view.ty,1]);
        this.renderer.setProjectionMatrixFromDrawingContext(context);
        this.program.setUniform('uView',this.matrix);this.program.setUniform('uProjection',this.renderer.projectionMatrix.val);
        this.program.applyUniforms(suite.program);
      }
      this.renderer.drawElements(context,this.textures,suite.program,suite.vao,count,offset,this.renderer.gl.TRIANGLES);
    }
    this.onRunEnd(context);
  }
  dispose(): void {
    const suite=this.suite;
    if(suite){
      const wrappers=this.renderer.glVAOWrappers, at=wrappers.indexOf(suite.vao);
      if(at>=0)wrappers.splice(at,1);
      // ShaderProgramFactory owns and shares programs by source; only the VAO and
      // buffers belong to this layer. Deleting the program poisons later layers.
      suite.vao.destroy();
    }
    this.renderer.deleteBuffer(this.layout.buffer); this.renderer.deleteBuffer(this.indices);
    this.textures=[];
  }
}
