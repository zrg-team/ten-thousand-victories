import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const dir = 'output/hero-depth/balance-v2'; fs.mkdirSync(dir, {recursive:true});
const fingerprint = () => {
  const files = [];
  const walk = dir => { for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name); if(entry.isDirectory())walk(file);else files.push(file);
  } }; walk('src');
  files.push('test_scripts/playtest/hero-strategy.mjs','test_scripts/verify/verify-skill-ceiling.mjs');
  const hash=crypto.createHash('sha256'); for(const file of files.sort())hash.update(file).update(fs.readFileSync(file)); return hash.digest('hex');
};
const disabled={heroGrowth:false,heroSpecializations:false,heroTravel:false,heroRecovery:false,heroResidency:false,heroCards:false,heroLethal:false};
const full={heroGrowth:true,heroSpecializations:true,heroTravel:true,heroRecovery:true,heroResidency:true,heroCards:true,heroLethal:false};
const arms={control:disabled,growthOnly:{...disabled,heroGrowth:true},recoverable:full,noPerks:{...full,heroSpecializations:false},noCards:{...full,heroCards:false},noTraining:{...full,heroTrainingPerLevel:0}};
const runs=[], startSource=fingerprint();
async function runArm([arm,override]) {
  const before=fingerprint(), start=Date.now();
  const result=await new Promise(resolve=>{
    const child=spawn(process.execPath,['test_scripts/verify/verify-skill-ceiling.mjs','--ruleset','beta','--seeds',process.env.HERO_BALANCE_SEEDS??'64','--ticks','600',
      '--hero-aware','--override',JSON.stringify(override),'--json',`${dir}/${arm}.json`],{env:process.env,windowsHide:true});
    let stdout='',stderr='';child.stdout.on('data',data=>{stdout+=data;});child.stderr.on('data',data=>{stderr+=data;});
    child.on('error',error=>resolve({status:null,stdout,stderr:stderr+error.message}));
    child.on('close',status=>resolve({status,stdout,stderr}));
  });
  fs.writeFileSync(`${dir}/${arm}.log`,result.stdout+result.stderr);
  const after=fingerprint(), artifact=fs.existsSync(`${dir}/${arm}.json`)?JSON.parse(fs.readFileSync(`${dir}/${arm}.json`)):undefined;
  const report=artifact?.report?.beta;
  runs.push({arm,exit:result.status,sourceBefore:before,sourceAfter:after,sourceUnchanged:before===after,seconds:(Date.now()-start)/1000,
    ...(report?{seeds:artifact.seeds.length,meanWaves:report.avg,agency:report.agency,raw:report.raw,paired:report.pairedShare,
      goals:Object.fromEntries(Object.entries(report.rows).map(([plan,rows])=>[plan,rows.filter(row=>row.goal==='won').length])),
      progression:Object.fromEntries(Object.entries(report.rows).map(([plan,rows])=>{
        const milestones=rows.flatMap(row=>Object.values(row.heroMeasurements?.milestones??{}).flat());
        const times=level=>milestones.filter(m=>m.level===level).map(m=>m.turn-m.recruitedTurn).sort((a,b)=>a-b);
        const summary=level=>{const values=times(level);return{n:values.length,median:values.length?values[Math.floor(values.length/2)]:null};};
        return[plan,{level3:summary(3),level6:summary(6)}];
      }))}:{} )});
  console.log(JSON.stringify(runs.at(-1)));
  fs.writeFileSync(`${dir}/summary.json`,JSON.stringify({sourceAtStart:startSource,sourceAtEnd:after,sourceUnchanged:startSource===after&&runs.every(r=>r.sourceUnchanged),runs},null,2));
}
// Two independent arms at a time; each has its own browser/profile and output paths.
const entries=Object.entries(arms);
for(let i=0;i<entries.length;i+=2)await Promise.all(entries.slice(i,i+2).map(runArm));
// Balance threshold failures are findings; missing results/changed source invalidate the measurement.
if(runs.some(r=>![0,1].includes(r.exit)||!r.meanWaves||!r.sourceUnchanged)||fingerprint()!==startSource)process.exitCode=1;
