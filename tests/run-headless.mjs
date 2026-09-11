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
const errors = [];

async function suite(archivo) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8899/tests/' + archivo, { waitUntil: 'networkidle0' });
  // La batería ronda el minuto y medio y va creciendo con cada función nueva.
  // El tope está para avisar de un cuelgue, no para cortar una prueba lenta.
  await page.waitForFunction(() => /^(OK|FALLOS)/.test(document.title), { timeout: 240000 });
  const out = await page.$eval('#out', el => el.textContent);
  console.log(out);
  await page.close();
  return !/FALLOS/.test(out);
}

const a = await suite('pizarra.test.html');
console.log('\n' + '─'.repeat(60) + '\n');
const b = await suite('nube.test.html');

if (errors.length) console.log('\nERRORES DE LA PÁGINA:\n' + errors.join('\n'));
await browser.close();
process.exit(a && b ? 0 : 1);
