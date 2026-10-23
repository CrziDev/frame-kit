// Frames screenshots in a browser-window mockup on a dark gradient backdrop.
// Canvas is 1920x1200 rendered at 2x, so every output is 3840x2400.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, extname, join } from 'node:path';

const CANVAS = { width: 1920, height: 1200 };
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export const IMAGE_EXTENSIONS = Object.keys(MIME);

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
  /* Box height follows the image ratio up to the cap; taller images are cropped from the top */
  .shot { display: block; width: 100%; height: auto; object-fit: cover; object-position: top; }
  .paper { max-height: 1060px; max-width: 1700px; transform: rotate(-1.5deg);
    border-radius: 6px; box-shadow: 0 40px 80px rgba(0,0,0,.6); }
`;

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const dataUri = (file) => {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`Unsupported image type: ${file}`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};

const lock = `<svg width="11" height="13" viewBox="0 0 11 13" style="margin-right:8px;flex:none"><rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill="#71717a"/><path d="M2.75 5.5V3.75a2.75 2.75 0 0 1 5.5 0V5.5" stroke="#71717a" stroke-width="1.4" fill="none"/></svg>`;

const windowHtml = (image, url, { style, maxImageHeight }) => `
  <div class="win" style="${style}">
    <div class="bar">
      <span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span>
      <span class="dot" style="background:#28c840"></span>
      <span class="url">${lock}${escape(url)}</span>
    </div>
    <img class="shot" style="max-height:${maxImageHeight}px" src="${dataUri(image)}">
  </div>`;

// Renders html on a fresh canvas page; launches (and closes) a browser unless one is passed in
async function render(html, output, browser) {
  const own = !browser;
  browser ??= await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: 2 });
    await page.setContent(`<style>${css}</style>${html}`, { waitUntil: 'load' });
    mkdirSync(dirname(output), { recursive: true });
    await page.screenshot({ path: output });
    await page.close();
  } finally {
    if (own) await browser.close();
  }
  return output;
}

// One image → one framed PNG. style: 'browser' (window with address bar) or 'paper' (tilted slip, for receipts)
export function frameSingle(image, output, { url = '', style = 'browser', browser } = {}) {
  const html = style === 'paper'
    ? `<img class="paper" src="${dataUri(image)}">`
    : windowHtml(image, url, { style: 'width:1600px', maxImageHeight: 1000 });
  return render(html, output, browser);
}

// Two images → one cover: `back` window top-left, `front` window overlapping bottom-right
export function frameCover(back, front, output, { backUrl = '', frontUrl = '', browser } = {}) {
  const html = `
    ${windowHtml(back, backUrl, { style: 'position:absolute; left:90px; top:70px; width:1300px; opacity:.92', maxImageHeight: 806 })}
    ${windowHtml(front, frontUrl, { style: 'position:absolute; left:560px; top:330px; width:1270px', maxImageHeight: 786 })}`;
  return render(html, output, browser);
}

// Headline cover: title + subline top-left, one image in a window bleeding off the bottom-right.
// `accent` is a word or phrase inside `title` that gets the highlight colour.
export function frameHeadline(image, output, { title, accent = '', sub = '', url = '', browser } = {}) {
  if (!title) throw new Error('frameHeadline needs a title');
  const safe = escape(title);
  const title_ = accent && title.includes(accent) ? safe.replace(escape(accent), `<b>${escape(accent)}</b>`) : safe;
  const html = `
    <style>
      .hl { position: absolute; left: 96px; top: 110px; width: 600px; color: #fff; }
      .hl h1 { font-size: 76px; line-height: 1.04; letter-spacing: -2px; font-weight: 700; }
      .hl b { color: #8b8bf0; }
      .hl p { margin-top: 26px; width: 460px; font-size: 26px; line-height: 1.4; color: #a8b3c7; }
    </style>
    <div class="hl"><h1>${title_}</h1>${sub ? `<p>${escape(sub)}</p>` : ''}</div>
    ${windowHtml(image, url, { style: 'position:absolute; left:640px; top:330px; width:1240px', maxImageHeight: 1000 })}`;
  return render(html, output, browser);
}
