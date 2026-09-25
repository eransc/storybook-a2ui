#!/usr/bin/env node
// Screenshot Storybook stories with the PROJECT's Playwright (uses installed Chrome).
//   node screenshot.mjs --project <dir with @playwright/test> --url http://localhost:6006 --out <dir> <storyId...>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(`--${k}`) ? argv.splice(argv.indexOf(`--${k}`), 2)[1] : d);
const project = resolve(opt('project', '.'));
const base = opt('url', 'http://localhost:6006');
const out = resolve(opt('out', './a2ui-shots'));
const ids = argv;
mkdirSync(out, { recursive: true });

const require = createRequire(`${project}/package.json`);
let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch {
  ({ chromium } = require('playwright'));
}
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const id of ids) {
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'domcontentloaded' });
  const ok = await page.waitForSelector('#storybook-root > *', { timeout: 25000 }).then(() => true, () => false);
  const missing = await page.locator('text=Couldn\'t find story matching').count();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${id}.png`, fullPage: true });
  console.log(`${ok && !missing ? '✓' : '✗'} ${id}${missing ? ' (not indexed — restart Storybook)' : ''} → ${out}/${id}.png`);
}
if (errors.length) console.log('page errors:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
