import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
const bundle = await build({ stdin: { contents: "export { CONQUEST_MAP_ART } from './src/ui/conquestMapArt.ts';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { CONQUEST_MAP_ART } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
await writeFile(process.argv[2] ?? 'output/performance-review/art-registry.json', JSON.stringify(CONQUEST_MAP_ART));
