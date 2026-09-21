import { readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const glbDir = resolve(root, 'src/front/glbs');
const outFile = resolve(root, 'src/front/glbSizes.js');

const files = (await readdir(glbDir)).filter((name) => name.endsWith('.glb')).sort();

const entries = await Promise.all(files.map(async (name) => {
    const { size } = await stat(resolve(glbDir, name));
    return `    './glbs/${name}': ${size},`;
}));

const source = [
    'export const GLB_SIZES = {',
    ...entries,
    '};',
    '',
].join('\n');

await writeFile(outFile, source, 'utf8');

console.log(`glb sizes: ${files.length} models`);
