import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'src/front/img/xd.jpg');
const outDir = resolve(root, 'src/front/img');

const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };
const PLAIN = [180, 192, 512];
const MASKABLE = 512;
const SAFE_ZONE = 0.78;

async function plain(size) {
    await sharp(source)
        .resize(size, size, { fit: 'cover', position: 'centre' })
        .png({ compressionLevel: 9 })
        .toFile(resolve(outDir, `icon-${size}.png`));
}

async function maskable(size) {
    const inner = Math.round(size * SAFE_ZONE);
    const pad = Math.round((size - inner) / 2);

    const art = await sharp(source)
        .resize(inner, inner, { fit: 'cover', position: 'centre' })
        .toBuffer();

    await sharp({
        create: { width: size, height: size, channels: 4, background: BACKGROUND },
    })
        .composite([{ input: art, top: pad, left: pad }])
        .png({ compressionLevel: 9 })
        .toFile(resolve(outDir, `icon-maskable-${size}.png`));
}

await mkdir(outDir, { recursive: true });
await Promise.all([...PLAIN.map(plain), maskable(MASKABLE)]);

console.log(`app icons: ${PLAIN.join(', ')} + maskable ${MASKABLE}`);
