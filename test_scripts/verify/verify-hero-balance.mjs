/** Matched fresh-profile comparisons; the existing plans rule on after the finite goal. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const disabled={heroGrowth:false,heroSpecializations:false,heroTravel:false,heroRecovery:false,heroResidency:false,heroCards:false,heroLethal:false};
const arms={currentBeta:disabled,growthOnly:{...disabled,heroGrowth:true},recoverable:{...disabled,heroGrowth:true,heroSpecializations:true,heroTravel:true,heroRecovery:true,heroResidency:true,heroCards:true}};
fs.mkdirSync('output/hero-depth/balance',{recursive:true});
const runs=[];
for(const [arm,override] of Object.entries(arms)) {
  const result=spawnSync(process.execPath,['test_scripts/verify/verify-skill-ceiling.mjs','--ruleset','beta','--seeds',process.env.HERO_BALANCE_SEEDS??'64','--ticks','600','--override',JSON.stringify(override),'--json',`output/hero-depth/balance/${arm}.json`],{encoding:'utf8',env:process.env,maxBuffer:8*1024*1024});
  fs.writeFileSync(`output/hero-depth/balance/${arm}.log`,result.stdout+result.stderr);
  console.log(`${arm}: verifier exit ${result.status}\n${result.stdout.slice(-2500)}`);
  runs.push({arm,exit:result.status,error:result.error?.message});
}
fs.writeFileSync('output/hero-depth/balance/runs.json',JSON.stringify(runs,null,2));
// Gate failures are retained verbatim. Compare the control before attributing a failure to heroes.
if(runs.some(run=>run.error||run.exit===null))process.exitCode=1;
