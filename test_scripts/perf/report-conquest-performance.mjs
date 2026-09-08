/** Summarize every run, including failed gates. Does not discard outliers. */
import {readFile, writeFile} from 'node:fs/promises';
const directory = process.env.INPUT ?? 'output/a9-performance/release-paired';
const {results} = JSON.parse(await readFile(`${directory}/results.json`, 'utf8'));
const median = values => {
  const sorted = [...values].sort((a,b) => a-b), middle = Math.floor(sorted.length/2);
  return sorted.length ? sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2 : null;
};
const describe = values => ({runs:values, median:median(values), min:Math.min(...values), max:Math.max(...values)});
const groups = [], failures = [], parity = [];
for (const record of results) {
  if(record.failure || record.errors.length) failures.push({pair:record.pair, quality:record.quality, version:record.version, failure:record.failure, errors:record.errors});
}
for (const quality of [...new Set(results.map(r=>r.quality))]) {
  const baseline = results.filter(r=>r.quality===quality && r.version==='baseline');
  const candidate = results.filter(r=>r.quality===quality && r.version==='candidate');
  for(const a of baseline) {
    const b = candidate.find(r=>r.pair===a.pair);
    if(!b) { parity.push({quality,pair:a.pair,pass:false,reason:'Missing candidate'}); continue; }
    const parameters = visual => {const {visibleScenery,...rest}=visual;return rest;};
    const pass = JSON.stringify(a.device?.buffer)===JSON.stringify(b.device?.buffer)
      && JSON.stringify(a.device?.profile)===JSON.stringify(b.device?.profile)
      && a.samples.every(s=>JSON.stringify(parameters(s.visual))===JSON.stringify(parameters(b.samples.find(t=>t.label===s.label)?.visual??{})));
    const endpoints=a.samples.map(s=>({workload:s.label,baseline:s.visual.visibleScenery,candidate:b.samples.find(t=>t.label===s.label)?.visual.visibleScenery}));
    parity.push({quality,pair:a.pair,pass,endpoints,exactEndpointScenery:endpoints.every(e=>e.baseline===e.candidate),note:'End-of-input visibility counters may precede the next culling frame. Settled geometry/visibility has a separate verifier.'});
  }
  for (const workload of ['opening-touch','revealed-idle','revealed-touch','revealed-touch-cpu4']) {
    const pick = (records,field) => records.map(r=>r.samples.find(s=>s.label===workload)?.[field]).filter(Number.isFinite);
    const metrics = {};
    for(const field of ['cpuP50','cpuP95','fps','gapP95','inputSubmissionP95','uploadKiB','draws','over50']) {
      const a = pick(baseline,field), b = pick(candidate,field);
      metrics[field] = {baseline:describe(a),candidate:describe(b),changePercent:a.length&&b.length ? (median(b)/median(a)-1)*100 : null};
    }
    const vertex = pick(candidate,'retainedVertexUploadedBytes');
    const pairedCpuImprovements=baseline.map(a=>{
      const b=candidate.find(b=>b.pair===a.pair),before=a.samples.find(s=>s.label===workload)?.cpuP95,after=b?.samples.find(s=>s.label===workload)?.cpuP95;
      return before&&Number.isFinite(after)?(1-after/before)*100:null;
    }).filter(Number.isFinite);
    const stages = {};
    for(const name of ['culling','preparation','groundPreparation','touchHandling','worldUpdate','submission']) {
      const read = records => records.map(r=>r.samples.find(s=>s.label===workload)?.stages[name]?.p95).filter(Number.isFinite);
      stages[name]={baseline:describe(read(baseline)),candidate:describe(read(candidate))};
    }
    groups.push({quality,workload,metrics,stages,pairedCpuImprovementPercent:describe(pairedCpuImprovements),sceneryVertexBytes:vertex,
      gates:{fivePairs:baseline.length===5&&candidate.length===5,
        cpu:metrics.cpuP95.changePercent <= (workload==='revealed-touch-cpu4' ? -30 : 5),
        inputProxy:workload==='revealed-touch-cpu4' || metrics.inputSubmissionP95.changePercent===null ? null : metrics.inputSubmissionP95.changePercent<=5,
        purePanNoSceneryVertexUpload:vertex.length===5 && vertex.every(n=>n===0)}});
  }
}
const gpu = results.filter(r=>r.gpuDuration).map(r=>({quality:r.quality,version:r.version,...r.gpuDuration,medianMs:median(r.gpuDuration.ms??[])}));
const traces = [];
for(const record of results.filter(r=>r.pair===0)) {
  try {
    const name = `${record.version}-${record.quality}`, data = JSON.parse(await readFile(`${directory}/${name}.trace.json`,'utf8'));
    const counts = {}, gc = [];
    for(const event of data.traceEvents) {
      if(/DrawFrame|FramePresented|Presentation|BeginFrame|SwapBuffers|PipelineReporter/.test(event.name)) counts[event.name]=(counts[event.name]??0)+1;
      if(/^(MinorGC|MajorGC|V8\.GC)/.test(event.name) && event.ph==='X') gc.push({name:event.name,durationMs:event.dur/1000});
    }
    traces.push({name,frameEvents:counts,gcEvents:gc.length,gcDurationMs:gc.reduce((n,e)=>n+e.durationMs,0),note:'Nested GC events may overlap. Frame events corroborate browser pipeline activity, not physical display latency.'});
  } catch(error) { traces.push({name:`${record.version}-${record.quality}`,unavailable:String(error)}); }
}
const report = {physicalA9:'not yet verified',groups,parity,failures,gpu,traces,
  limitations:['prestep/postrender is main-thread frame work and submission, not physical frame presentation.',
    'Input latency is synthetic event timestamp to submission; physical touch-to-screen is unavailable.',
    'GPU timer queries and CPU/Chrome traces ran separately from timing windows.',
    'Desktop CPU throttling is supporting evidence, not a simulation of the A9 GPU, thermals or Android scheduling.']};
await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
const n = value => value===null ? 'unavailable' : value.toFixed(2);
const lines = ['# Controlled conquest comparison','','All samples retained. Medians across five runs; CPU values are p95 frame work in milliseconds. A9: **not yet verified**.','',
  '| Profile | Workload | Baseline | Candidate | CPU change | Upload change | CPU gate |',
  '|---|---|---:|---:|---:|---:|---|'];
for(const g of groups) lines.push(`| ${g.quality} | ${g.workload} | ${n(g.metrics.cpuP95.baseline.median)} | ${n(g.metrics.cpuP95.candidate.median)} | ${n(g.metrics.cpuP95.changePercent)}% | ${n(g.metrics.uploadKiB.changePercent)}% | ${g.gates.cpu?'PASS':'FAIL'} |`);
lines.push('','## All CPU p95 samples','');
for(const g of groups) lines.push(`- ${g.quality} / ${g.workload}: baseline [${g.metrics.cpuP95.baseline.runs.map(n).join(', ')}]; candidate [${g.metrics.cpuP95.candidate.runs.map(n).join(', ')}].`);
lines.push('','Median of within-pair CPU percentage improvements (distinct from comparing the two medians above):','');
for(const g of groups.filter(g=>g.workload==='revealed-touch-cpu4'))lines.push(`- ${g.quality}: ${n(g.pairedCpuImprovementPercent.median)}%; all pairs [${g.pairedCpuImprovementPercent.runs.map(n).join(', ')}].`);
lines.push('',`Visual-parameter parity: ${parity.filter(p=>p.pass).length}/${parity.length}. Runtime failures: ${failures.length}.`,'',...report.limitations.map(l=>`- ${l}`),'');
await writeFile(`${directory}/report.md`,lines.join('\n'));
console.log(JSON.stringify({groups:groups.map(g=>({quality:g.quality,workload:g.workload,cpuChange:g.metrics.cpuP95.changePercent,gates:g.gates})),failures,parity}));
