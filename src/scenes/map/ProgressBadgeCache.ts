import type Phaser from 'phaser';
import type { ProgressBadgeVariant } from '../../ui/MapItemRenderer';

type Badge = Phaser.GameObjects.Container;
type Update = (progress: number, required: number) => void;
/** Stable order identities keep plate geometry and text textures across economy ticks.
 * Only renderers with an explicit update hook are pooled. Idle objects are bounded. */
export class ProgressBadgeCache {
  private active = new Map<string, { badge: Badge; family: ProgressBadgeVariant; seen: boolean }>();
  private idle = new Map<ProgressBadgeVariant, Badge[]>();
  constructor(private create: (x:number,y:number,p:number,r:number,v:ProgressBadgeVariant)=>Badge) {}
  begin(family: ProgressBadgeVariant): void { for(const entry of this.active.values())if(entry.family===family)entry.seen=false; }
  get(id:string,x:number,y:number,p:number,r:number,family:ProgressBadgeVariant):Badge {
    const key=`${family}:${id}`;
    let entry=this.active.get(key);
    if(entry && !entry.badge.getData('updateProgress')) {entry.badge.destroy();this.active.delete(key);entry=undefined;}
    if(!entry){
      const badge=this.idle.get(family)?.pop()??this.create(x,y,p,r,family);
      (badge.getData('progressTween') as Phaser.Tweens.Tween | undefined)?.restart();
      entry={badge,family,seen:true};this.active.set(key,entry);
    }
    entry.seen=true;
    const badge=entry.badge;badge.setPosition(x,y).setVisible(true).setActive(true).setAlpha(1);
    (badge.getData('updateProgress') as Update | undefined)?.(p,r);
    return badge;
  }
  end(family:ProgressBadgeVariant):void {
    for(const [id,entry] of this.active){
      if(entry.family!==family||entry.seen)continue;
      this.active.delete(id);const badge=entry.badge;
      const free=this.idle.get(family)??[];
      if(!badge.getData('updateProgress')||free.length>=32){badge.destroy();continue;}
      badge.removeInteractive();badge.setVisible(false).setActive(false).setPosition(0,0).setScale(1).setAlpha(1);
      (badge.getData('progressTween') as Phaser.Tweens.Tween | undefined)?.restart().pause();
      free.push(badge);this.idle.set(family,free);
    }
  }
  stats(){return {active:this.active.size,idle:Object.fromEntries([...this.idle].map(([key,value])=>[key,value.length]))};}
  destroy():void{for(const {badge} of this.active.values())badge.destroy();for(const list of this.idle.values())for(const badge of list)badge.destroy();this.active.clear();this.idle.clear();}
}
