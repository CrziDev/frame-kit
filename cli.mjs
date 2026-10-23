#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { FITS, IMAGE_EXTENSIONS, RESOLUTIONS, frameCover, frameHeadline, frameSingle, launchBrowser } from './src/frame.mjs';

const HELP = `Usage:
  frame-kit single <image|folder> [--url <text>] [--style browser|paper] [--out <dir>]
  frame-kit cover <back> <front> [--back-url <text>] [--front-url <text>] [--out <file>]
  frame-kit headline <image> --title <text> [--accent <word>] [--sub <text>] [--url <text>] [--out <file>]
  (all commands also take [--fit auto|contain|cover] [--resolution standard|high|max])

single  Frame one image, or every png/jpg/webp in a folder (not recursive).
        Output: <out>/<name>.png, default <input dir>/framed/
cover   Combine two images: <back> top-left, <front> overlapping bottom-right.
        Output: <out>, default <back's dir>/framed/00-cover.png
headline  Big title (and optional subline) top-left, <image> in a window bleeding
        off the bottom-right. --accent highlights a word or phrase of the title.
        Output: <out>, default <image's dir>/framed/00-cover.png

Options:
  --url, --back-url, --front-url
        Address-bar text. {name} is replaced by the file name without its
        "NN-" prefix and extension: --url "myapp.com/{name}" turns
        03-supplies.png into myapp.com/supplies
  --style browser|paper
        browser (default): window with address bar, tall images cropped from the top
        paper: tilted slip, for receipts, invoices and other printouts
  --fit auto|contain|cover
        auto (default): show the whole image, except very tall pages, which are
        cropped from the top. contain: always show the whole image (window
        shrinks to the image ratio). cover: full-width window, cropped from the top.
  --resolution standard|high|max
        Output size, same layout at every size. Larger is not sharper than the source.
        standard 1920x1200 (small files, quick previews)
        high     2560x1600
        max      3840x2400 (default)

Env:
  CHROME_PATH  Chromium binary to use (default: newest in ~/.cache/ms-playwright, then PATH)`;

function parse(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') flags.help = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq < 0 ? a.slice(2) : a.slice(2, eq);
      const value = eq < 0 ? argv[++i] : a.slice(eq + 1);
      if (value === undefined) throw new Error(`Missing value for --${key}`);
      flags[key] = value;
    } else args.push(a);
  }
  return { args, flags };
}

const FLAGS = {
  single: ['url', 'style', 'out', 'fit', 'resolution'],
  cover: ['back-url', 'front-url', 'out', 'fit', 'resolution'],
  headline: ['title', 'accent', 'sub', 'url', 'out', 'fit', 'resolution'],
};

function validate(command, flags) {
  for (const key of Object.keys(flags)) {
    if (key !== 'help' && !FLAGS[command].includes(key)) throw new Error(`Unknown option --${key} for ${command}`);
  }
  if (flags.style && !['browser', 'paper'].includes(flags.style)) throw new Error('--style must be browser or paper');
  if (flags.fit && !FITS.includes(flags.fit)) throw new Error(`--fit must be one of ${FITS.join(', ')}`);
  if (flags.resolution && !RESOLUTIONS[flags.resolution]) throw new Error(`--resolution must be one of ${Object.keys(RESOLUTIONS).join(', ')}`);
}

const stem = (file) => basename(file, extname(file));
const urlFor = (template, file) => (template ?? '').replaceAll('{name}', stem(file).replace(/^\d+[a-z]?[-_]/i, ''));

// <stem>.png, or <stem>-<ext>.png when another input already claimed that name (a.png + a.jpg)
function outputNames(images, outDir) {
  const used = new Set();
  return images.map((image) => {
    let name = `${stem(image)}.png`;
    if (used.has(name.toLowerCase())) name = `${stem(image)}-${extname(image).slice(1).toLowerCase()}.png`;
    used.add(name.toLowerCase());
    return join(outDir, name);
  });
}

async function single([input], flags) {
  if (!input) throw new Error('single needs an image or folder');
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`Not found: ${path}`);
  const isDir = statSync(path).isDirectory();
  const images = isDir
    ? readdirSync(path)
      .filter((f) => !f.startsWith('.') && IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()))
      .sort()
      .map((f) => join(path, f))
    : [path];
  if (!images.length) throw new Error(`No png/jpg/webp images in ${path}`);
  const outDir = resolve(flags.out ?? join(isDir ? path : dirname(path), 'framed'));
  const outputs = outputNames(images, outDir);

  let browser = await launchBrowser();
  const failures = [];
  try {
    for (const [i, image] of images.entries()) {
      const progress = images.length > 1 ? `[${i + 1}/${images.length}] ` : '';
      try {
        await frameSingle(image, outputs[i], {
          url: urlFor(flags.url, image), style: flags.style, fit: flags.fit, resolution: flags.resolution, browser,
        });
        console.log(`${progress}${outputs[i]}`);
      } catch (e) {
        failures.push(image);
        console.error(`${progress}FAILED ${image}: ${e.message}`);
        // A crashed Chromium would fail every remaining image; start a fresh one
        if (!browser.isConnected()) browser = await launchBrowser();
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  if (images.length > 1) console.log(`${images.length - failures.length} of ${images.length} framed${failures.length ? `, ${failures.length} failed` : ''}`);
  if (failures.length) process.exitCode = 1;
}

async function cover([back, front], flags) {
  if (!back || !front) throw new Error('cover needs <back> and <front> images');
  const output = resolve(flags.out ?? join(dirname(resolve(back)), 'framed', '00-cover.png'));
  await frameCover(resolve(back), resolve(front), output, {
    backUrl: urlFor(flags['back-url'], back),
    frontUrl: urlFor(flags['front-url'], front),
    fit: flags.fit, resolution: flags.resolution,
  });
  console.log(output);
}

async function headline([image], flags) {
  if (!image || !flags.title) throw new Error('headline needs <image> and --title');
  const output = resolve(flags.out ?? join(dirname(resolve(image)), 'framed', '00-cover.png'));
  await frameHeadline(resolve(image), output, {
    title: flags.title, accent: flags.accent, sub: flags.sub, url: urlFor(flags.url, image),
    fit: flags.fit, resolution: flags.resolution,
  });
  console.log(output);
}

try {
  const [command, ...rest] = process.argv.slice(2);
  const { args, flags } = parse(rest);
  if (!command || command === '-h' || command === '--help' || flags.help) console.log(HELP);
  else if (FLAGS[command]) {
    validate(command, flags);
    await { single, cover, headline }[command](args, flags);
  } else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
} catch (e) {
  console.error(`frame-kit: ${e.message}`);
  process.exit(1);
}
