# frame-kit

Turn plain screenshots into polished images in a browser window.

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

`{name}` is the file name without its `NN-` prefix, so `03-supplies.png` shows `myapp.com/supplies`. `node cli.mjs --help` lists every option.

When processing a folder, a bad file is reported and skipped, the rest are still framed, and the exit code is 1 if any failed. Two inputs with the same name (`a.png`, `a.jpg`) are written as `a.png` and `a-<ext>.png`.

### Fit

`--fit auto|contain|cover`, for every command.

- `auto` (default): the whole screenshot is shown, scaled to fit. Very tall pages (narrower than 0.45 width/height) would shrink to a sliver, so they are cropped from the top instead.
- `contain`: always the whole screenshot. The window takes the image's shape.
- `cover`: a full-width window, cropped from the top. This is how tall images behaved before `--fit` existed.

Screenshots are never upscaled more than 2.5×.

### Resolution

`--resolution standard|high|max`, for every command. The layout is identical at every size; only the pixel count changes.

| Preset | Output | Use for |
| --- | --- | --- |
| `standard` | 1920×1200 | READMEs, quick previews, small files |
| `high` | 2560×1600 | Web pages and slides |
| `max` (default) | 3840×2400 | Retina displays, print |

A larger export is sharper text in the frame and mockup, not more detail in your screenshot. Roughly, on 13 mixed screenshots here: `standard` took 9 s and 6 MB, `high` 14 s and 10 MB, `max` 23 s and 19 MB.

Files over 50 MB or 100 megapixels are rejected.

## Tests

```sh
npm test
```

Needs Chromium, same as the tool; tests are skipped if none is found.

## As a library

```js
import { launchBrowser, frameSingle, frameCover, frameHeadline } from './src/frame.mjs';

await frameSingle('shot.png', 'out.png', { url: 'myapp.com', resolution: 'standard', fit: 'contain' });
await frameCover('back.png', 'front.png', 'cover.png');
await frameHeadline('shot.png', 'cover.png', { title: 'Fill the form automatically', accent: 'automatically' });
```

All functions take an optional `browser` (from `launchBrowser()`) to reuse one Chromium across many images, plus `fit` and `resolution`. They reject with a readable message for missing, unreadable or unsupported images.

## Claude Code skill

Want to point it at a project and have the pages screenshotted and framed for you? Use the `generate-frame` and `generate-project-frames` skills in [claude-skills](https://github.com/CrziDev/claude-skills). `generate-project-frames` scans your project, screenshots its best pages, and frames them with this script, cover included. `generate-frame` frames any image or folder of screenshots. Install steps are in that repo.
