import type Phaser from 'phaser';
import type { GraphicCell } from './GraphicsPartition';

export interface PartitionTicket { done: boolean; result?: Map<string, GraphicCell>; cancel(): void }
interface Job { id: number; buffer: Float64Array; matrix: number[]; ticket: PartitionTicket; started: number }
const MAX_BYTES = 16 * 1048576;
let generation = 0;
const workers = new WeakMap<Phaser.Scene, MapPreparationWorker>();
/** One worker shared by a scene's ground and fog queues. Initial synchronous draws bypass it. */
export function mapPreparationWorker(scene: Phaser.Scene): MapPreparationWorker | undefined {
  if (typeof Worker === 'undefined' || new URLSearchParams(location.search).get('mapworker') !== '1') return;
  let worker = workers.get(scene);
  if (!worker) { worker = new MapPreparationWorker(); workers.set(scene, worker); scene.events.once('shutdown',()=>{worker!.destroy();workers.delete(scene);}); }
  return worker;
}
export class MapPreparationWorker {
  private readonly generation = ++generation;
  private recycled: ArrayBuffer[] = [];
  private worker?: Worker;
  private active?: Job;
  private queue: Job[] = [];
  private next = 0;
  private failed = false;
  private watchdog?: ReturnType<typeof setTimeout>;
  private readonly costs: number[] = [];
  private transferred = 0;
  private cancellations = 0;
  constructor() {
    try {
      this.worker = new Worker(new URL('./mapPreparation.worker.ts',import.meta.url),{type:'module'});
      this.worker.onmessage = event => {
        const job=this.active;if(!job||event.data.id!==job.id||event.data.generation!==this.generation)return;
        clearTimeout(this.watchdog);
        if(!job.ticket.done && !event.data.error){
          job.ticket.result=new Map(event.data.cells.map((cell:{key:string;hash:number;buffer:ArrayBuffer})=>[cell.key,{hash:cell.hash,commands:Array.from(new Float64Array(cell.buffer))}]));
        }
        job.ticket.done=true;this.costs.push(performance.now()-job.started);if(this.costs.length>128)this.costs.shift();
        if(event.data.input && event.data.input.byteLength+this.recycled.reduce((n,b)=>n+b.byteLength,0)<=MAX_BYTES && this.recycled.length<2)this.recycled.push(event.data.input);
        // Return consumed output storage to the worker. Its own cache is byte bounded.
        const buffers=(event.data.cells??[]).map((cell:{buffer:ArrayBuffer})=>cell.buffer);
        if(buffers.length)this.worker?.postMessage({kind:'recycle',buffers},buffers);
        this.active=undefined;this.dispatch();
      };
      this.worker.onerror=event=>{event.preventDefault();this.fail();};
      this.worker.onmessageerror=()=>this.fail();
    }catch{this.fail();}
  }
  partition(commands:number[],matrix:number[]):PartitionTicket {
    const id=++this.next;
    const ticket:PartitionTicket={done:this.failed,cancel:()=>{
      if(ticket.done)return;ticket.done=true;this.cancellations++;
      this.queue=this.queue.filter(job=>job.id!==id);
    }};
    // At most one running plus two queued jobs (ground/fog). Overflow uses the
    // existing yielding implementation, without dropping requested imagery.
    if(this.failed||this.queue.length>=2||commands.length*8+this.queue.reduce((n,j)=>n+j.buffer.byteLength,0)>MAX_BYTES){ticket.done=true;return ticket;}
    const index=this.recycled.findIndex(buffer=>buffer.byteLength===commands.length*8);
    const buffer=index<0?new Float64Array(commands.length):new Float64Array(this.recycled.splice(index,1)[0]);buffer.set(commands);
    this.queue.push({id,ticket,buffer,matrix,started:performance.now()});this.dispatch();return ticket;
  }
  private dispatch():void {
    if(this.active||this.failed||!this.worker)return;
    const job=this.queue.shift();if(!job)return;
    if(job.ticket.done){this.dispatch();return;}
    this.active=job;job.started=performance.now();this.transferred+=job.buffer.byteLength;
    this.watchdog=setTimeout(()=>this.fail(),10000);
    try{this.worker.postMessage({id:job.id,generation:this.generation,revision:job.id,kind:'partition',buffer:job.buffer.buffer,matrix:job.matrix},[job.buffer.buffer]);}catch{this.fail();}
  }
  get waiting():boolean {return !!this.active;}
  stats(){return {active:!!this.active,queued:this.queue.length,failed:this.failed,generation:this.generation,recycledBytes:this.recycled.reduce((n,b)=>n+b.byteLength,0),oldestMs:this.active?performance.now()-this.active.started:0,transferredBytes:this.transferred,cancellations:this.cancellations,roundTripMs:[...this.costs]};}
  private fail():void {
    this.failed=true;clearTimeout(this.watchdog);this.worker?.terminate();this.worker=undefined;
    if(this.active)this.active.ticket.done=true;for(const job of this.queue)job.ticket.done=true;
    this.active=undefined;this.queue=[];this.recycled=[];
  }
  destroy():void {this.fail();}
}
