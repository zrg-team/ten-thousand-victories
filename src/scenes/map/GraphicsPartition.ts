/** Worker-safe preparation. Paint operations, hashes and padded bounds are unchanged. */
export const MAP_CHUNK_SIZE=512;
export interface GraphicCell {commands:number[];hash:number}
const lengths: Record<number, number> = { 0: 8, 1: 1, 2: 1, 3: 5, 4: 3, 5: 3, 6: 4, 7: 3, 8: 1, 9: 1, 10: 7, 11: 7, 14: 1, 15: 1, 16: 3, 17: 3, 18: 2, 21: 9, 22: 7 };
const bits = new Float64Array(1);
const words = new Int32Array(bits.buffer);
function hash(h: number, value: number): number {
  bits[0] = value;
  return Math.imul(Math.imul(h ^ words[0], 16777619) ^ words[1], 16777619);
}

/** Float32 storage matches Phaser TransformMatrix, including rounding after every transform. */
class Affine {
 private m: Float32Array;
 constructor(values?: readonly number[]) { this.m=new Float32Array(values??[1,0,0,1,0,0]); }
 loadIdentity(){this.m.set([1,0,0,1,0,0]);}
 translate(x:number,y:number){const m=this.m;m[4]=m[0]*x+m[2]*y+m[4];m[5]=m[1]*x+m[3]*y+m[5];}
 scale(x:number,y:number){this.m[0]*=x;this.m[1]*=x;this.m[2]*=y;this.m[3]*=y;}
 rotate(angle:number){const m=this.m,[a,b,c,d]=m,s=Math.sin(angle),co=Math.cos(angle);m[0]=a*co+c*s;m[1]=b*co+d*s;m[2]=-a*s+c*co;m[3]=-b*s+d*co;}
 multiply(other:Affine,out:Affine){const [a,b,c,d,e,f]=this.m,[A,B,C,D,E,F]=other.m;out.m.set([a*A+c*B,b*A+d*B,a*C+c*D,b*C+d*D,a*E+c*F+e,b*E+d*F+f]);}
 getX(x:number,y:number){return x*this.m[0]+y*this.m[2]+this.m[4];}
 getY(x:number,y:number){return x*this.m[1]+y*this.m[3]+this.m[5];}
 get scaleX(){return Math.sqrt(this.m[0]**2+this.m[1]**2);}
 get scaleY(){return Math.sqrt(this.m[2]**2+this.m[3]**2);}
 destroy(){}
}

export function* partitionGraphics(buffer: readonly number[] | Float64Array, matrix: readonly number[]): Generator<void,Map<string,GraphicCell>> {

  const cells = new Map<string, GraphicCell>();
  let fill = [7, 0xffffff, 1], line = [6, 1, 0xffffff, 1];
  let path: number[] = [], points: number[] = [], transforms: number[] = [];
  const stack: number[] = [];
  const local = new Affine();
  const world = new Affine(matrix);
  const combined = new Affine();
  const add = (command: number[], xy: number[]) => {
    if (!xy.length) return;
    local.loadIdentity();
    for (let i = 0; i < transforms.length;) {
      const op = transforms[i++];
      if (op === 16) { local.translate(transforms[i++], transforms[i++]); }
      else if (op === 17) { local.scale(transforms[i++], transforms[i++]); }
      else local.rotate(transforms[i++]);
    }
    world.multiply(local, combined);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < xy.length; i += 2) {
      const x = combined.getX(xy[i], xy[i + 1]), y = combined.getY(xy[i], xy[i + 1]);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const pad = Math.max(4, Math.abs(line[1]) * Math.max(Math.abs(combined.scaleX), Math.abs(combined.scaleY)) * 2);
    const primitive = [14, ...transforms, ...fill, ...line, ...command, 15];
    for (let y = Math.floor((top - pad) / MAP_CHUNK_SIZE); y <= Math.floor((bottom + pad) / MAP_CHUNK_SIZE); y++) {
      for (let x = Math.floor((left - pad) / MAP_CHUNK_SIZE); x <= Math.floor((right + pad) / MAP_CHUNK_SIZE); x++) {
        const key = `${x},${y}`;
        let cell = cells.get(key);
        if (!cell) { cell = { commands: [], hash: 2166136261 }; cells.set(key, cell); }
        for (const value of primitive) { cell.commands.push(value); cell.hash = hash(cell.hash, value); }
      }
    }
  };
  for (let i = 0, steps = 0; i < buffer.length;) {
    const op = buffer[i], length = lengths[op];
    if (!length) throw new Error(`Unsupported Phaser graphics command ${op}`);
    const command = Array.from(buffer.slice(i, i + length)); i += length;
    switch (op) {
      case 7: case 21: fill = command; break;
      case 6: case 22: line = command; break;
      case 14: stack.push(transforms.length); break;
      case 15: transforms.length = stack.pop() ?? 0; break;
      case 16: case 17: case 18: transforms.push(...command); break;
      case 1: path = [1]; points = []; break;
      case 2: path.push(2); break;
      case 4: case 5: path.push(...command); points.push(command[1], command[2]); break;
      case 0: {
        path.push(...command);
        const [, x, y, r] = command;
        points.push(x - r, y - r, x + r, y - r, x + r, y + r, x - r, y + r); break;
      }
      case 8: case 9: add([...path, op], points); break;
      case 3: { const [, x, y, w, h] = command; add(command, [x, y, x + w, y, x + w, y + h, x, y + h]); break; }
      case 10: case 11: add(command, command.slice(1)); break;
    }
    if (++steps % 128 === 0) yield;
  }
  local.destroy(); world.destroy(); combined.destroy();
  return cells;
}
