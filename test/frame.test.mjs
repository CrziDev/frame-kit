import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RESOLUTIONS, frameCover, frameHeadline, frameSingle, launchBrowser } from '../src/frame.mjs';
import { hasChrome, makePng, pngSize } from './helpers.mjs';

const opts = { skip: !hasChrome && 'Chromium not found' };
const CLI = new URL('../cli.mjs', import.meta.url).pathname;
let dir;
let browser;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'frame-kit-'));
  if (hasChrome) browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
});

const shot = (name, w, h) => {
  const file = join(dir, name);
  writeFileSync(file, makePng(w, h));
  return file;
};

describe('output dimensions', opts, () => {
  for (const [name, width] of Object.entries(RESOLUTIONS)) {
    test(`${name} is ${width}px wide at 16:10`, async () => {
      const out = join(dir, `res-${name}.png`);
      await frameSingle(shot('land.png', 1440, 900), out, { resolution: name, browser });
      assert.deepEqual(pngSize(out), { width, height: width * 0.625 });
    });
  }

  test('default stays 3840x2400', async () => {
    const out = join(dir, 'default.png');
    await frameSingle(shot('land.png', 1440, 900), out, { browser });
    assert.deepEqual(pngSize(out), { width: 3840, height: 2400 });
  });

  test('unknown resolution is rejected', async () => {
    await assert.rejects(frameSingle(shot('land.png', 1440, 900), join(dir, 'x.png'), { resolution: 'huge', browser }), /resolution must be one of/);
  });
});

describe('source shapes', opts, () => {
  const shapes = { landscape: [1440, 900], portrait: [900, 1200], tall: [1440, 6000], narrow: [320, 1400], tiny: [64, 64], wide: [2400, 300] };
  for (const [name, [w, h]] of Object.entries(shapes)) {
    for (const fit of ['auto', 'contain', 'cover']) {
      test(`${name} (${w}x${h}) with fit=${fit}`, async () => {
        const out = join(dir, `${name}-${fit}.png`);
        await frameSingle(shot(`${name}.png`, w, h), out, { fit, resolution: 'standard', browser });
        assert.deepEqual(pngSize(out), { width: 1920, height: 1200 });
      });
    }
  }

  test('paper style', async () => {
    const out = join(dir, 'paper.png');
    await frameSingle(shot('portrait.png', 600, 1400), out, { style: 'paper', resolution: 'standard', browser });
    assert.equal(pngSize(out).width, 1920);
  });

  test('cover with two images', async () => {
    const out = join(dir, 'cover.png');
    await frameCover(shot('a.png', 1440, 900), shot('b.png', 390, 844), out, { resolution: 'standard', browser });
    assert.equal(pngSize(out).width, 1920);
  });
});

describe('headline', opts, () => {
  test('long title renders', async () => {
    const out = join(dir, 'headline.png');
    const title = 'Automatically fill out every long application form in a single click for you, every single time, without exception';
    await frameHeadline(shot('land.png', 1440, 900), out, { title, accent: 'form', sub: 'One click away.', resolution: 'standard', browser });
    assert.deepEqual(pngSize(out), { width: 1920, height: 1200 });
  });

  test('title is required', async () => {
    await assert.rejects(frameHeadline(shot('land.png', 1440, 900), join(dir, 'x.png'), {}), /needs a title/);
  });
});

describe('input errors', opts, () => {
  test('missing file', async () => {
    await assert.rejects(frameSingle(join(dir, 'nope.png'), join(dir, 'x.png'), { browser }), /Image not found/);
  });

  test('unsupported extension', async () => {
    const file = join(dir, 'doc.gif');
    writeFileSync(file, 'GIF89a');
    await assert.rejects(frameSingle(file, join(dir, 'x.png'), { browser }), /Unsupported image type/);
  });

  test('corrupt image', async () => {
    const file = join(dir, 'corrupt.png');
    writeFileSync(file, 'not an image');
    await assert.rejects(frameSingle(file, join(dir, 'x.png'), { browser }), /Cannot decode corrupt\.png/);
    assert.ok(!existsSync(join(dir, 'x.png')));
  });

  test('browser stays usable after a failure', async () => {
    const out = join(dir, 'after-fail.png');
    await frameSingle(shot('land.png', 1440, 900), out, { resolution: 'standard', browser });
    assert.ok(existsSync(out));
  });
});

describe('cli batch', opts, () => {
  const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  test('one bad file does not stop the rest, and exits non-zero', () => {
    const batch = join(dir, 'batch');
    spawnSync('mkdir', ['-p', batch]);
    writeFileSync(join(batch, '01-good.png'), makePng(800, 500));
    writeFileSync(join(batch, '02-bad.png'), 'junk');
    writeFileSync(join(batch, '03-good.png'), makePng(800, 500));
    writeFileSync(join(batch, '03-good.jpg'), 'junk'); // same stem; sorts first, so the png gets the suffixed name
    const r = run('single', batch, '--resolution', 'standard');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FAILED .*02-bad\.png: Cannot decode/);
    assert.match(r.stdout, /2 of 4 framed, 2 failed/);
    assert.deepEqual(readdirSync(join(batch, 'framed')).sort(), ['01-good.png', '03-good-png.png']);
    assert.deepEqual(pngSize(join(batch, 'framed', '01-good.png')), { width: 1920, height: 1200 });
  });

  test('same-stem inputs get distinct output names', () => {
    const batch = join(dir, 'dups');
    spawnSync('mkdir', ['-p', batch]);
    writeFileSync(join(batch, 'shot.png'), makePng(800, 500));
    writeFileSync(join(batch, 'shot.webp'), makePng(800, 500)); // PNG bytes under a webp name still decode
    const r = run('single', batch, '--resolution', 'standard');
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(join(batch, 'framed')).sort(), ['shot-webp.png', 'shot.png']);
  });

  test('missing input exits 1 with a clear message', () => {
    const r = run('single', join(dir, 'nowhere'));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Not found/);
  });

  test('empty folder', () => {
    const empty = join(dir, 'empty');
    spawnSync('mkdir', ['-p', empty]);
    const r = run('single', empty);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No png\/jpg\/webp images/);
  });

  test('bad options', () => {
    assert.match(run('single', dir, '--resolution', 'huge').stderr, /--resolution must be one of/);
    assert.match(run('single', dir, '--fit', 'stretch').stderr, /--fit must be one of/);
    assert.match(run('single', dir, '--bogus', '1').stderr, /Unknown option --bogus/);
  });
});
