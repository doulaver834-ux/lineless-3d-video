import fs from 'node:fs';
import path from 'node:path';

process.env.TMPDIR = path.resolve('.render-tmp');
fs.mkdirSync(process.env.TMPDIR, {recursive: true});

const {bundle} = await import('@remotion/bundler');
const {renderMedia, renderStill, selectComposition} = await import('@remotion/renderer');

const serveUrl = await bundle({
  entryPoint: path.resolve('src/index.tsx'),
  publicDir: path.resolve('public'),
  outDir: path.resolve('.bundle'),
  enableCaching: false,
});

const idArg = process.argv.find((a) => a.startsWith('--id='));
const compId = idArg ? idArg.slice('--id='.length) : 'LinelessGeneralTest';

const opts = {
  serveUrl,
  id: compId,
  chromiumOptions: {gl: 'angle'},
  timeoutInMilliseconds: 120000,
  onBrowserLog: (log) => {
    if (log.type === 'error') console.log(log.type, log.text);
  },
};

const composition = await selectComposition(opts);
fs.mkdirSync('out/stills', {recursive: true});

if (process.argv.includes('--stills')) {
  const customArg = process.argv.find((a) => a.startsWith('--frames='));
  const total = composition.durationInFrames;
  const checkFrames = customArg
    ? customArg
        .slice('--frames='.length)
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n))
    : Array.from({length: 8}, (_, i) => Math.min(total - 1, Math.round(((i + 0.5) / 8) * total)));

  for (const f of checkFrames) {
    const outPath = path.resolve(`out/stills/f_${String(f).padStart(4, '0')}.png`);
    await renderStill({...opts, composition, frame: f, output: outPath, scale: 0.75});
    console.log(`Rendered still frame ${f} -> ${outPath}`);
  }
} else {
  let last = -1;
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outputLocation = path.resolve(outArg ? outArg.slice('--out='.length) : 'out/master_2K.mp4');
  await renderMedia({
    ...opts,
    composition,
    codec: 'h264',
    crf: 16,
    scale: 4 / 3, // 1920x1080 * 4/3 = 2560x1440 (2K)
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    audioBitrate: '256k',
    concurrency: 2,
    outputLocation,
    onProgress: (p) => {
      const k = Math.floor(p.progress * 100);
      if (k !== last && k % 10 === 0) {
        last = k;
        console.log(`Render ${k}% (${p.renderedFrames}/${composition.durationInFrames})`);
      }
    },
  });
  console.log(`Completed 2K render -> ${outputLocation}`);
}
