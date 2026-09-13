import fs from 'node:fs';
import crypto from 'node:crypto';
import { packageAudit } from '../../docs/phase-2/hero-depth/completion-audit.mjs';
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const hero=read('output/hero-depth/verification.json'),play=read('output/hero-depth/play-results.json');
const documentQa=read('output/hero-depth/document-verification.json');
const consentQa=read('output/hero-depth/consent-verification.json');
const heroV2=read('output/hero-depth/verification-v2.json'),interfaceV2=read('output/hero-depth/interface-v2.json');
const balancePath='output/hero-depth/balance-v2/summary.json';
const balanceV2=fs.existsSync(balancePath)?read(balancePath):{runs:[]};
const balanceComplete=balanceV2.sourceUnchanged===true&&balanceV2.runs.length===6&&balanceV2.runs.every(run=>run.meanWaves&&/ok\s+no console errors/.test(fs.readFileSync(`output/hero-depth/balance-v2/${run.arm}.log`,'utf8')));
for (const result of [hero, heroV2, interfaceV2, documentQa, consentQa]) if (result.errors?.length || result.checks.some(check => !check.pass)) {
  throw new Error('Resolve failed artifact checks before recording passing implementation evidence.');
}
if (play.errors.length) throw new Error('Resolve playable/visual errors before recording evidence.');
const balance=Object.fromEntries(['currentBeta','growthOnly','recoverable'].map(arm=>{
  const result=read(`output/hero-depth/balance/${arm}.json`), report=result.report.beta;
  return [arm,{seeds:result.seeds.length,ticks:result.ticks,override:result.override,meanWaves:report.avg,
    rawStrategySpread:report.raw,agency:report.agency,pairedShare:report.pairedShare,
    goalsWon:Object.fromEntries(Object.entries(report.rows).map(([plan,rows])=>[plan,rows.filter(row=>row.goal==='won').length])),
    source:`output/hero-depth/balance/${arm}.json`}];
}));
const files=['src/ui/HeroProgress.ts','src/scenes/conquest/lanes/frame.ts','src/game/ascentRuleset.ts','src/systems/heroes/HeroService.ts','src/systems/heroes/heroModel.ts','src/systems/heroes/heroContributions.ts','src/systems/heroes/heroSave.ts','src/scenes/conquest/screens/heroDepth.ts','src/ui/HeroChronicleExit.ts','src/systems/ascent/BattleSystem.ts',
  'src/systems/heroes/heroFate.ts','src/systems/heroes/heroMeasurements.ts','test_scripts/playtest/hero-strategy.mjs'];
const evidence={schema:2,date:'2026-09-14',heroNumericalVersion:2,status:'User-requested removal of comparison and HTML overlays implemented; game-native UI verified; accessibility and release gates remain open',
  completionAudit:{date:'2026-09-14',complete:false,method:'Source review and fresh v1/v2 gameplay, interface, statistical and seeded-agent checks; no physical devices or human cohort',source:'completion-audit.mjs',packages:packageAudit},
  implementationStartRevision:'54f0b8da',approvedPlanBaseline:'e00a349e',designInspection:'8f8c6e75',workingTreeUncommitted:true,
  provenance:'Other host-rescue, recruitment and UI work was active in the same checkout. Balance is a development comparison on that working tree, not a frozen release candidate.',
  sourceSha256:Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
  enabledForNewBeta:['growth','specializations','travel','recovery','residency','cards'],lethalEnabled:false,
  automated:{document:{passed:documentQa.checks.filter(c=>c.pass).length,total:documentQa.checks.length,errors:documentQa.errors},hero:{passed:hero.checks.filter(c=>c.pass).length,total:hero.checks.length,errors:hero.errors,command:'DEV_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-depth.mjs',checks:hero.checks},
    heroV2:{passed:heroV2.checks.filter(c=>c.pass).length,total:heroV2.checks.length,checks:heroV2.checks,distributions:heroV2.distributions,command:'DEV_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-v2.mjs',
      distributionScope:'10,000 seeded draws per tier through the production fate table; not 30,000 complete battles. Wilson 95% intervals reported. Lethal exercised only as an isolated table capability.'},
    interfaceV2:{passed:interfaceV2.checks.filter(c=>c.pass).length,total:interfaceV2.checks.length,checks:interfaceV2.checks,timings:interfaceV2.timings,command:'DEV_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-interface-v2.mjs'},
    consentAndArchive:{passed:consentQa.checks.filter(c=>c.pass).length,total:consentQa.checks.length,errors:consentQa.errors,checks:consentQa.checks,command:'DEV_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-consent.mjs'},
    visual:{languages:['en','vi'],widths:[320,390,1440],reducedMotion:true,textSizes:[100],keyboard:'Not revalidated after removing DOM panels. Prior keyboard/200% DOM evidence is superseded; accessibility improvements must stay within existing game UI',uiDecision:'Comparison modal and floating HTML/Aa panels removed by user request. Archive failure uses the existing reign-end message and footer',errors:play.errors,
      portraitCards:{date:'2026-09-14',result:'Card-framed avatars with bottom-right level badge; XP label and track inside roster/assignment/detail information panels. EN/VI at 320/390/1440; 18 scratch visual cases for empty, 40% and maximum XP plus compact recruitment badge fit. Desktop automation, not physical-device validation.',evidence:'output/hero-depth/cards/qa.json'},
      serviceXp:play.samples.map(sample=>({governor:sample.governor.xp,commander:sample.commander.xp})),command:'DEV_URL=http://127.0.0.1:5180 node test_scripts/shot/shot-hero-depth.mjs'},
    playableClient:{script:'C:/Users/zerg/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js',fixture:'test_scripts/scratch/hero-play.html (ignored setup)',evidence:'output/hero-depth/client-card-fit',result:'Framed portrait, bottom-right level and in-panel XP visible during Protect All command on numerical v2: level-2 governor (6 XP) leaves job and enters one-season owned-route transit; screenshots and state inspected.'},
    regressions:{typeScript:'pass',productionBuild:'pass (existing chunk-size warnings)',ruleset:'20/20',resume:'31/31',legacyHeroRoster:'pass',legacyHeroActions:'pass',legacyHeroEvents:'pass',saveLifecycle:'pass',empireCampaignRival:'three 60-tick runs; no console errors',skirmishStores:'6/6',
      originalStable:'7/10 in shared tree, failures at seeds 22/66/88. Baseline read from 54f0b8da; not rewritten by this work.',
      isolatedStable:'10/10 with only concurrent holdForRescue disabled by an in-memory Vite transform; all eight original fingerprints match. Hero code remains loaded with capabilities off.',
      draftDepth:'11/13: drafting/evolution/held-card checks pass; two binder checks expect eager offscreen faces, while Cabinet uses lazy rows. Kept visible as an unrelated verifier limitation.'}},
  balance:{command:'PLAYTEST_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-balance.mjs',
    measurementScope:'Development measurements before final mentorship, safe-refuge, and commander-cache corrections. Repeat on a frozen candidate with hero-aware strategies and device-performance profiling before closing H12.',
    method:'64 matched fresh-profile seeds (11 + 11i), four existing strategy drivers, 600-tick limit. Drivers retain the finite objective and choose rule-on to measure continued Endless play. Drivers do not intentionally select hero specializations or optimize resident/policy actions.',
    gates:{agency:1.5,rawStrategySpread:1.3,pairedShare:.6},arms:balance,
    interpretation:'Control already fails agency; growth also fails raw spread; recoverable restores spread but reduces agency. These are open balance findings, not proof of human fun or fairness. Do not tune XP solely to these hero-unaware plans.'},
  balanceV2:{command:'PLAYTEST_URL=http://127.0.0.1:5180 node test_scripts/verify/verify-hero-balance-v2.mjs',...balanceV2,complete:balanceComplete,status:balanceComplete?'Complete fixed-source sample':'Incomplete: later arms detected source changes; run stopped for user UI correction. Rerun on fixed source before using results for acceptance.',
    method:'64 matched fresh-profile seeds per arm, four existing plans, 600-tick limit, finite objective followed by Rule on. Agents use shared assignment commands, available perks, ransom/concessions, resident actions and mentorship. Separate perk/card/training ablations. Content hashes checked before/after every arm; later arms detected source changes. No claim of a complete matched comparison.',
    measurementLimits:'The available-season counter currently means all living recruited hero-seasons, including transit/recovery/captivity. Productive share alone cannot distinguish hoarding from forced absence. Level-time medians include only heroes reaching the level and therefore have survivor bias. A dedicated diplomacy-led agent and availability-adjusted analysis remain open.',
    humanEvidence:false},
  openGates:['Game-native keyboard, enlarged-text and screen-reader validation after DOM overlay removal','Complete fixed-source six-arm balance comparison','Full crash/reload entrypoint matrix and remaining modifier-category presentation','Availability-adjusted hoarding analysis, late-recruit/role timing and a dedicated diplomacy-led agent','Physical mobile-device validation and performance profiling','Six mobile and six desktop human players','At least 10/12 distinguish province-loss forecasts from conditional hero risk and evacuate unaided','Zero lethal outcomes without current encounter-specific consent','Investigate balance findings before promotion; Stable promotion is outside scope'],
  artifactScope:'Curated JSON and bilingual source are committed candidates. Raw browser logs/screenshots remain ignored under output/hero-depth. Earlier document-validation.json is historical artifact QA, not gameplay evidence.'};
fs.writeFileSync('docs/phase-2/hero-depth/implementation-evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(`Recorded ${evidence.automated.hero.passed}/${evidence.automated.hero.total} hero checks and ${Object.keys(balance).length} balance arms.`);
