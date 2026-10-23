// Frames screenshots in a browser-window mockup on a dark gradient backdrop.
// Layout canvas is 1920x1200; the output resolution only changes the device scale factor,
// so proportions are identical at every size. Default is 3840x2400.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, extname, join } from 'node:path';

const CANVAS = { width: 1920, height: 1200 };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export const IMAGE_EXTENSIONS = Object.keys(MIME);

// Output width in pixels per preset (height is width * 1200/1920)
export const RESOLUTIONS = { standard: 1920, high: 2560, max: 3840 };
export const FITS = ['auto', 'contain', 'cover'];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// CHROME_PATH → newest Playwright-cached Chromium → a Chromium/Chrome on PATH
export function findChrome() {
  if (process.env.CHROME_PATH) {
    if (existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
  }

  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (existsSync(cache)) {
    const builds = readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      for (const bin of [
        'chrome-linux64/chrome',
        'chrome-linux/chrome',
        'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ]) {
        const path = join(cache, build, bin);
        if (existsSync(path)) return path;
      }
    }
  }

  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome']) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
  }

  throw new Error('Chromium not found. Set CHROME_PATH or run: npx playwright install chromium');
}

export const launchBrowser = (options = {}) => chromium.launch({ executablePath: findChrome(), ...options });

const css = `
  * { box-sizing: border-box; margin: 0; }
  body { width: ${CANVAS.width}px; height: ${CANVAS.height}px; overflow: hidden; position: relative;
    display: flex; align-items: center; justify-content: center;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background: radial-gradient(1200px 800px at 15% 10%, #1e3a5f 0%, transparent 60%),
                radial-gradient(1000px 700px at 90% 95%, #3b2a12 0%, transparent 55%),
                linear-gradient(135deg, #0b1220 0%, #111827 55%, #0f172a 100%); }
  .win { border-radius: 14px; overflow: hidden; background: #18181b;
    box-shadow: 0 40px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08); }
  .bar { height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #27272a;
    border-bottom: 1px solid rgba(255,255,255,.06); }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .url { margin-left: 18px; flex: 1; max-width: 560px; height: 26px; border-radius: 7px; background: #18181b;
    color: #a1a1aa; font-size: 13px; display: flex; align-items: center; padding: 0 12px; letter-spacing: .2px;
    white-space: nowrap; overflow: hidden; }
  /* Window size is set by layout() below: whole image (contain) or cropped from the top (cover) */
  .shot { display: block; width: 100%; height: auto; object-fit: cover; object-position: top; }
  .paper { max-height: 1060px; max-width: 1700px; transform: rotate(-1.5deg);
    border-radius: 6px; filter: drop-shadow(0 40px 40px rgba(0,0,0,.6)); }
`;

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const dataUri = (file) => {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type: ${file} (use ${IMAGE_EXTENSIONS.join(', ')})`);
  let stat;
  try {
    stat = statSync(file);
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? `Image not found: ${file}` : `Cannot read ${file}: ${e.message}`);
  }
  if (!stat.isFile()) throw new Error(`Not a file: ${file}`);
  if (stat.size > MAX_FILE_BYTES) throw new Error(`Image too large (${(stat.size / 1048576).toFixed(0)} MB, limit 50 MB): ${file}`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};

const checkFit = (fit) => {
  if (!FITS.includes(fit)) throw new Error(`fit must be one of ${FITS.join(', ')}`);
  return fit;
};

const lock = `<svg width="11" height="13" viewBox="0 0 11 13" style="margin-right:8px;flex:none"><rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill="#71717a"/><path d="M2.75 5.5V3.75a2.75 2.75 0 0 1 5.5 0V5.5" stroke="#71717a" stroke-width="1.4" fill="none"/></svg>`;

// maxW x maxH is the box the screenshot must fit in; layout() sizes the window inside it
const windowHtml = (image, url, { style, maxW, maxH, fit }) => `
  <div class="win" style="${style}">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="url">${lock}${escape(url)}</span>
    </div>
    <img class="shot" data-file="${escape(basename(image))}" data-maxw="${maxW}" data-maxh="${maxH}" data-fit="${checkFit(fit)}" src="${dataUri(image)}">
  </div>`;

// Runs in the page: decodes every image (failing on unreadable ones) and sizes each window.
// contain: whole image, scaled to fit the box. cover: box-wide, cropped from the bottom.
// auto: contain, except very tall images (width/height < 0.45), which would shrink to an
// unreadable sliver, so they are cropped from the top instead.
async function layout() {
  const MAX_UPSCALE = 2.5;
  for (const img of document.querySelectorAll('img[data-file]')) {
    try {
      await img.decode();
    } catch {
      return `Cannot decode ${img.dataset.file}: not a valid png/jpg/webp image`;
    }
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w * h > 100e6) return `Image too large (${w}x${h}, limit 100 megapixels): ${img.dataset.file}`;
    if (!img.classList.contains('shot')) continue;
    const maxW = Number(img.dataset.maxw);
    const maxH = Number(img.dataset.maxh);
    const ratio = w / h;
    const fit = img.dataset.fit === 'auto' ? (ratio >= 0.45 ? 'contain' : 'cover') : img.dataset.fit;
    let width;
    if (fit === 'contain') width = Math.min(maxW, maxH * ratio, w * MAX_UPSCALE);
    else width = Math.min(maxW, Math.max(w * 2, 640));
    img.parentElement.style.width = `${Math.round(width)}px`;
    img.style.maxHeight = `${maxH}px`;
  }
  // Shrink the headline until it fits its column and stays above the bottom margin
  const hl = document.querySelector('.hl');
  const h1 = hl?.querySelector('h1');
  if (h1) {
    let size = 76;
    while (size > 36 && (h1.scrollWidth > h1.clientWidth || hl.getBoundingClientRect().bottom > 1090)) {
      h1.style.fontSize = `${--size}px`;
    }
  }
  return null;
}

// Renders html on a fresh canvas page; launches (and closes) a browser unless one is passed in
async function render(html, output, { browser, resolution = 'max' }) {
  if (!RESOLUTIONS[resolution]) throw new Error(`resolution must be one of ${Object.keys(RESOLUTIONS).join(', ')}`);
  const own = !browser;
  browser ??= await launchBrowser();
  let page;
  try {
    page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: RESOLUTIONS[resolution] / CANVAS.width });
    await page.setContent(`<style>${css}</style>${html}`, { waitUntil: 'load' });
    const problem = await page.evaluate(layout);
    if (problem) throw new Error(problem);
    mkdirSync(dirname(output), { recursive: true });
    await page.screenshot({ path: output });
  } finally {
    await page?.close().catch(() => {});
    if (own) await browser.close();
  }
  return output;
}

// One image → one framed PNG. style: 'browser' (window with address bar) or 'paper' (tilted slip, for receipts)
export async function frameSingle(image, output, { url = '', style = 'browser', fit = 'auto', ...opts } = {}) {
  const html = style === 'paper'
    ? `<img class="paper" data-file="${escape(basename(image))}" src="${dataUri(image)}">`
    : windowHtml(image, url, { maxW: 1600, maxH: 1000, fit });
  return render(html, output, opts);
}

// Two images → one cover: `back` window top-left, `front` window overlapping bottom-right
export async function frameCover(back, front, output, { backUrl = '', frontUrl = '', fit = 'auto', ...opts } = {}) {
  const html = `
    ${windowHtml(back, backUrl, { style: 'position:absolute; left:90px; top:70px; opacity:.92', maxW: 1300, maxH: 806, fit })}
    ${windowHtml(front, frontUrl, { style: 'position:absolute; left:560px; top:330px', maxW: 1270, maxH: 786, fit })}`;
  return render(html, output, opts);
}

// Headline cover: title + subline top-left, one image in a window bleeding off the bottom-right.
// `accent` is a word or phrase inside `title` that gets the highlight colour.
export async function frameHeadline(image, output, { title, accent = '', sub = '', url = '', fit = 'auto', ...opts } = {}) {
  if (!title) throw new Error('frameHeadline needs a title');
  const safe = escape(title);
  const title_ = accent && title.includes(accent) ? safe.replace(escape(accent), `<b>${escape(accent)}</b>`) : safe;
  const html = `
    <style>
      .hl { position: absolute; left: 96px; top: 110px; width: 520px; color: #fff; }
      .hl h1 { font-size: 76px; line-height: 1.04; letter-spacing: -2px; font-weight: 700; }
      .hl b { color: #8b8bf0; }
      .hl p { margin-top: 26px; width: 460px; font-size: 26px; line-height: 1.4; color: #a8b3c7; }
    </style>
    <div class="hl"><h1>${title_}</h1>${sub ? `<p>${escape(sub)}</p>` : ''}</div>
    ${windowHtml(image, url, { style: 'position:absolute; left:640px; top:330px', maxW: 1240, maxH: 1000, fit })}`;
  return render(html, output, opts);
}
