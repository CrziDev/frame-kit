# frame-kit

Puts screenshots in a browser-window mockup on a dark gradient background, for portfolio images. Output is 3840×2400 PNG.

## Setup

```sh
npm install
```

Uses the newest Chromium in `~/.cache/ms-playwright`, falling back to one on `PATH`. Set `CHROME_PATH` to override, or run `npx playwright install chromium` if neither exists.

## Usage

```sh
# One image, or every image in a folder → <input dir>/framed/
node cli.mjs single shots/ --url "myapp.com/{name}"

# Receipts and other printouts as a tilted paper slip
node cli.mjs single shots/13-receipt.png --style paper

# Cover: first image in the back, second in front → shots/framed/00-cover.png
node cli.mjs cover shots/02-dashboard.png shots/01-pos.png --front-url "myapp.com/pos"

# Cover with a headline: big title top-left, image in a window bleeding off the bottom-right
node cli.mjs headline shots/01-fill.png --title "Fill the form automatically" --accent automatically --sub "One click away." --url "myapp.com/apply"
```

`{name}` is the file name without its `NN-` prefix, so `03-supplies.png` shows `myapp.com/supplies`. Images taller than the window are cropped from the top. `node cli.mjs --help` lists every option.

## As a library

```js
import { launchBrowser, frameSingle, frameCover, frameHeadline } from './src/frame.mjs';

await frameSingle('shot.png', 'out.png', { url: 'myapp.com' });
await frameCover('back.png', 'front.png', 'cover.png');
await frameHeadline('shot.png', 'cover.png', { title: 'Fill the form automatically', accent: 'automatically' });
```

Both functions take an optional `browser` (from `launchBrowser()`) to reuse one Chromium across many images.

## Claude Code skill

Want to point it at a project and have the pages screenshotted and framed for you? Use the `generate-frame` and `generate-project-frames` skills in [claude-skills](https://github.com/CrziDev/claude-skills). `generate-project-frames` scans your project, screenshots its best pages, and frames them with this script, cover included. `generate-frame` frames any image or folder of screenshots. Install steps are in that repo.
