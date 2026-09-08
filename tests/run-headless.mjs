// Ejecuta tests/pizarra.test.html en Chromium sin interfaz y escribe el informe.
//   python3 -m http.server 8899 &
//   npm i puppeteer-core && node tests/run-headless.mjs
// Ajusta executablePath a tu Chromium/Chrome si hace falta.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: 'new',
  args: ['--no-sandbox','--disable-gpu','--hide-scrollbars']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 820 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('http://localhost:8899/tests/pizarra.test.html', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.title !== 'test', { timeout: 45000 });
const out = await page.$eval('#out', el => el.textContent);
console.log(out);
if (errors.length) console.log('\nERRORES DE LA PÁGINA:\n' + errors.join('\n'));
await browser.close();
