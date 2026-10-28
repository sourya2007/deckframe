// Headless smoke test for main/exporter.ts — builds synthetic inputs with
// ffmpeg, then runs encodeExport for every format (with and without mic).
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const { encodeExport, probeVideoSize } = require('../dist-main/exporter.js');

const dir = path.join(__dirname, '_export-test');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const run = (args) => {
  const r = spawnSync(ffmpeg, args, { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${(r.stderr || '').slice(-600)}`);
};

// 2s 640x360 vp9+opus webm (like the renderer stream), plus an opus "mic" sidecar
const srcWebm = path.join(dir, 'src.webm');
run(['-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=2',
     '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
     '-c:v', 'libvpx-vp9', '-b:v', '1M', '-c:a', 'libopus', srcWebm]);
const micWebm = path.join(dir, 'mic.webm');
run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2', '-c:a', 'libopus', micWebm]);

(async () => {
  const size = await probeVideoSize(srcWebm);
  console.log('probe:', JSON.stringify(size));
  if (size.width !== 640 || size.height !== 360) throw new Error('probe size wrong');
  if (Math.abs(size.durationMs - 2000) > 150) throw new Error(`probe duration wrong: ${size.durationMs}`);

  const cases = [
    { name: 'mp4', format: 'mp4', quality: 80 },
    { name: 'mp4+mic', format: 'mp4', quality: 80, micPath: micWebm },
    { name: 'webm', format: 'webm', quality: 80 },
    { name: 'webm+mic', format: 'webm', quality: 80, micPath: micWebm },
    { name: 'prores+mic', format: 'prores', quality: 80, micPath: micWebm },
    { name: 'gif', format: 'gif', quality: 80, gifFps: 10, gifWidth: 480, gifLoopForever: true },
    { name: 'gif-once', format: 'gif', quality: 80, gifFps: 10, gifWidth: 480, gifLoopForever: false },
  ];

  for (const c of cases) {
    const ext = c.format === 'prores' ? 'mov' : c.format;
    const outPath = path.join(dir, `out_${c.name}.${ext}`);
    const t0 = Date.now();
    let lastPct = -1;
    await encodeExport({ webmPath: srcWebm, outPath, ...c, onProgress: p => { lastPct = p; } }, size.durationMs);
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    console.log(`OK ${c.name}: ${kb} KB, ${Date.now() - t0}ms, progress=${lastPct.toFixed(2)}`);
    if (kb < 1) throw new Error(`${c.name} output suspiciously small`);
    if (lastPct !== 1) throw new Error(`${c.name} final progress not 1: ${lastPct}`);
  }

  // each output must itself be probe-able with sane duration
  for (const c of cases.filter(x => x.format !== 'gif')) {
    const ext = c.format === 'prores' ? 'mov' : c.format;
    const p = await probeVideoSize(path.join(dir, `out_${c.name}.${ext}`));
    if (Math.abs(p.durationMs - 2000) > 300) throw new Error(`${c.name} duration ${p.durationMs}`);
    console.log(`probe ${c.name}: ${p.width}x${p.height} ${p.durationMs}ms`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('EXPORTER SMOKE PASS');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
