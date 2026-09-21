import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/lucide-static/icons');
const spriteFile = resolve(root, 'src/front/img/icons.svg');
const maskDir = resolve(root, 'src/front/img/icons');

const STROKE = ' fill="none" stroke="currentColor"'
    + ' stroke-linecap="round" stroke-linejoin="round"';

const SPRITE = [
    'arrow-left',
    'calendar-days',
    'calendar-range',
    'chevron-down',
    'chevron-left',
    'chevron-right',
    'chevron-up',
    'circle-check',
    'contrast',
    'dices',
    'info',
    'loader-circle',
    'maximize',
    'menu',
    'moon',
    'pencil',
    'sun',
    'users',
    'x',
];

const MASKS = [
    'calendar-x',
    'chevron-down',
    'map-pin',
    'triangle-alert',
    'user',
];

async function body(name) {
    const svg = await readFile(resolve(source, `${name}.svg`), 'utf8');
    const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
    return inner.replace(/\s+/g, ' ').trim();
}

async function buildSprite() {
    const symbols = await Promise.all(SPRITE.map(async (name) => {
        return `<symbol id="${name}" viewBox="0 0 24 24"${STROKE}>${await body(name)}</symbol>`;
    }));

    const sprite = [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        symbols.join(''),
        '</svg>',
    ].join('');

    await writeFile(spriteFile, `${sprite}\n`, 'utf8');
}

async function buildMasks() {
    await rm(maskDir, { recursive: true, force: true });
    await mkdir(maskDir, { recursive: true });

    await Promise.all(MASKS.map(async (name) => {
        const svg = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"',
            ' stroke="#000" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">',
            await body(name),
            '</svg>',
        ].join('');
        await writeFile(resolve(maskDir, `${name}.svg`), `${svg}\n`, 'utf8');
    }));
}

await mkdir(dirname(spriteFile), { recursive: true });
await buildSprite();
await buildMasks();

console.log(`icons: ${SPRITE.length} in sprite, ${MASKS.length} masks`);
