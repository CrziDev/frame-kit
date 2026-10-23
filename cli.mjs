#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { IMAGE_EXTENSIONS, frameCover, frameHeadline, frameSingle, launchBrowser } from './src/frame.mjs';

const HELP = `Usage:
  frame-kit single <image|folder> [--url <text>] [--style browser|paper] [--out <dir>]
  frame-kit cover <back> <front> [--back-url <text>] [--front-url <text>] [--out <file>]
  frame-kit headline <image> --title <text> [--accent <word>] [--sub <text>] [--url <text>] [--out <file>]

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

Env:
  CHROME_PATH  Chromium binary to use (default: newest in ~/.cache/ms-playwright, then PATH)`;

function parse(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') flags.help = true;
    else if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split('=', 2);
      const value = inline ?? argv[++i];
      if (value === undefined) throw new Error(`Missing value for --${key}`);
      flags[key] = value;
    } else args.push(a);
  }
  return { args, flags };
}

const stem = (file) => basename(file, extname(file));
const urlFor = (template, file) => (template ?? '').replaceAll('{name}', stem(file).replace(/^\d+[a-z]?[-_]/i, ''));

async function single([input], flags) {
  if (!input) throw new Error('single needs an image or folder');
  if (flags.style && !['browser', 'paper'].includes(flags.style)) throw new Error('--style must be browser or paper');
  const path = resolve(input);
  const isDir = statSync(path).isDirectory();
  const images = isDir
    ? readdirSync(path)
      .filter((f) => !f.startsWith('.') && IMAGE_EXTENSIONS.includes(extname(f).toLowerCase()))
      .sort()
      .map((f) => join(path, f))
    : [path];
  if (!images.length) throw new Error(`No images in ${path}`);
  const outDir = resolve(flags.out ?? join(isDir ? path : dirname(path), 'framed'));

  const browser = await launchBrowser();
  try {
    for (const image of images) {
      const output = join(outDir, `${stem(image)}.png`);
      await frameSingle(image, output, { url: urlFor(flags.url, image), style: flags.style, browser });
      console.log(output);
    }
  } finally {
    await browser.close();
  }
}

async function cover([back, front], flags) {
  if (!back || !front) throw new Error('cover needs <back> and <front> images');
  const output = resolve(flags.out ?? join(dirname(resolve(back)), 'framed', '00-cover.png'));
  await frameCover(resolve(back), resolve(front), output, {
    backUrl: urlFor(flags['back-url'], back),
    frontUrl: urlFor(flags['front-url'], front),
  });
  console.log(output);
}

async function headline([image], flags) {
  if (!image || !flags.title) throw new Error('headline needs <image> and --title');
  const output = resolve(flags.out ?? join(dirname(resolve(image)), 'framed', '00-cover.png'));
  await frameHeadline(resolve(image), output, {
    title: flags.title, accent: flags.accent, sub: flags.sub, url: urlFor(flags.url, image),
  });
  console.log(output);
}

try {
  const [command, ...rest] = process.argv.slice(2);
  const { args, flags } = parse(rest);
  if (!command || command === '-h' || command === '--help' || flags.help) console.log(HELP);
  else if (command === 'single') await single(args, flags);
  else if (command === 'cover') await cover(args, flags);
  else if (command === 'headline') await headline(args, flags);
  else throw new Error(`Unknown command: ${command}\n\n${HELP}`);
} catch (e) {
  console.error(`frame-kit: ${e.message}`);
  process.exit(1);
}
