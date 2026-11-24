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

const opts = {
  serveUrl,
  id: 'LinelessGeneralTest',
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
  const checkFrames = customArg
    ? customArg
        .slice('--frames='.length)
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isFinite(n))
    : [
        38,  // S01 (1.27s): Congress OTS dolly onto Custer waving accusation papers
        125, // S02 (4.17s): Congress 2-shot — Custer empty pockets + ZERO EVIDENCE
        172, // S03 (5.73s): Executive Study — Grant slams gavel + COMMAND REVOKED + Custer recoils
        278, // S04 (9.27s): Fort Lincoln Cabin true 3D OTS — kneeling teary Custer before open sunlit doorway
        352, // S05 (11.73s): Fort Lincoln Cabin 2-shot — Custer starry recovery across table
        386, // S05 (12.87s): ON PROBATION + Terry stern point
        468, // S06 (15.60s): Montana 3D Bluff low tracking shot alongside mounted Custer
        558, // S07 (18.60s): Montana 3D Crane pull-back reveal over river valley + 8-year-old playbook
      ];
  for (const f of checkFrames) {
    const outPath = path.resolve(`out/stills/f_${String(f).padStart(4, '0')}.png`);
    await renderStill({...opts, composition, frame: f, output: outPath, scale: 0.75});
    console.log(`Rendered still frame ${f} -> ${outPath}`);
  }
} else {
  let last = -1;
  const outputLocation = path.resolve('out/lineless_3d_general_test_2K.mp4');
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
