/** Source + build identity for a benchmark; includes uncommitted files. */
import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const out=process.argv[2];if(!out)throw Error('Usage: node scripts/performance-manifest.mjs output/a9-performance/candidate');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function files(root){const list=[];for(const e of await readdir(root,{withFileTypes:true})){const p=`${root}/${e.name}`;if(e.isDirectory())list.push(...await files(p));else list.push(p);}return list;}
const source=[...await files('src'),...await files('public'),...'package.json yarn.lock index.html tsconfig.json vite.config.ts scripts/build-sw.mjs scripts/sw-template.js'.split(' ')].sort();
const rows=[];await mkdir(out,{recursive:true});
for(const file of source){try{rows.push({path:file,sha256:hash(await readFile(file))});if(!file.startsWith('public/')){await mkdir(path.dirname(`${out}/source/${file}`),{recursive:true});await copyFile(file,`${out}/source/${file}`);}}catch(e){if(e.code!=='ENOENT')throw e;}}
const build=[];for(const file of await files(`${out}/site`))build.push({path:path.relative(`${out}/site`,file).replaceAll('\\','/'),sha256:hash(await readFile(file))});build.sort((a,b)=>a.path.localeCompare(b.path));
const manifest={created:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHash:hash(JSON.stringify(rows)),buildHash:hash(JSON.stringify(build)),hashMethod:'SHA-256(JSON.stringify(sorted {path,sha256} rows))',files:rows,build,serviceWorker:build.find(f=>f.path==='sw.js'),physicalDevice:'Samsung Galaxy Tab A9 not yet verified'};
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));await writeFile(`${out}/working-tree.patch`,execFileSync('git',['diff','--binary','HEAD']));console.log(JSON.stringify({out,sourceHash:manifest.sourceHash,buildHash:manifest.buildHash,files:rows.length,buildFiles:build.length}));
