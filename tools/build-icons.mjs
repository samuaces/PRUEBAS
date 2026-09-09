/* Genera la marca y todos los iconos del sitio a partir de un único origen.

   Uso:  node tools/build-icons.mjs

   Salida:
     assets/img/favicon.svg          marca simple, para la pestaña
     assets/img/icon-192.png         marca completa
     assets/img/icon-512.png         marca completa
     assets/img/apple-touch-icon.png marca completa a sangre (iOS pone su máscara)
     assets/img/og-image.png         imagen social 1200×630
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* ---------------------------------------------------------------------------
   Colores corporativos
   ------------------------------------------------------------------------ */
export const ROJO = '#E11A41';        // rojo principal
export const ROJO_CLARO = '#E7204A';  // arranque del degradado
export const ROJO_HONDO = '#AE0325';  // final del degradado y sombras
export const TINTA = '#070A0F';       // fondo oscuro

/* ---------------------------------------------------------------------------
   La marca. Dos versiones del mismo dibujo: un campo de fútbol visto en
   vertical con una flecha de progresión. La completa añade el mosaico y las
   barras; la simple se queda en campo y flecha, que es lo único que sobrevive
   a 16 píxeles.
   ------------------------------------------------------------------------ */
const degradado = (n) =>
  `<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n}" y2="${n}">` +
  `<stop offset="0" stop-color="${ROJO_CLARO}"/><stop offset="1" stop-color="${ROJO_HONDO}"/></linearGradient>`;

export function marcaCompleta(rx = 14) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>${degradado(64)}</defs>
  <rect width="64" height="64" rx="${rx}" fill="url(#f)"/>
  <g fill="#FFFFFF" opacity=".10">
    <rect x="10" y="10" width="6" height="6"/><rect x="16" y="16" width="6" height="6"/>
    <rect x="10" y="22" width="6" height="6"/><rect x="22" y="10" width="6" height="6"/>
    <rect x="22" y="22" width="6" height="6"/><rect x="16" y="28" width="6" height="6"/></g>
  <g stroke="#FFFFFF" stroke-width="1.9" fill="none" opacity=".85" stroke-linejoin="round">
    <rect x="9" y="7" width="46" height="50" rx="4"/><path d="M9 32h46"/>
    <circle cx="32" cy="32" r="7.5"/><path d="M24 7v7h16V7M24 57v-7h16v7"/></g>
  <g fill="#FFFFFF" opacity=".95">
    <rect x="37" y="39" width="5" height="12" rx="1"/><rect x="44" y="33" width="5" height="18" rx="1"/>
    <rect x="51" y="27" width="5" height="24" rx="1"/></g>
  <path d="M11 48 L23 34 L29.5 40.5 L44 21" stroke="#FFFFFF" stroke-width="3.8" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M50.6 14.4 L48.4 26.4 L37.6 21.4 Z" fill="#FFFFFF"/></svg>`;
}

export function marcaSimple(rx = 7) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>${degradado(32)}</defs>
  <rect width="32" height="32" rx="${rx}" fill="url(#f)"/>
  <g stroke="#FFFFFF" stroke-width="1.5" fill="none" opacity=".8" stroke-linejoin="round">
    <rect x="4.5" y="3.5" width="23" height="25" rx="2"/><path d="M4.5 16h23"/>
    <path d="M11.5 3.5v3.6h9V3.5M11.5 28.5v-3.6h9v3.6"/></g>
  <path d="M7.6 23.4 L13.4 17 L16.6 20.2 L22.4 12.4" stroke="#FFFFFF" stroke-width="2.7" fill="none"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M25.6 8.6 L24.2 15.4 L18.2 12.6 Z" fill="#FFFFFF"/></svg>`;
}

/* ---------------------------------------------------------------------------
   Imagen social: la marca, el titular y un campo de verdad. El campo sigue
   siendo verde: es la superficie de juego, no un color corporativo.
   ------------------------------------------------------------------------ */
function ogHtml() {
  const fuente = (p) => readFileSync(join(raiz, p)).toString('base64');
  return `<style>
@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,${fuente('assets/fonts/outfit-latin-var.woff2')}) format('woff2');font-weight:400 800}
@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${fuente('assets/fonts/inter-latin-var.woff2')}) format('woff2');font-weight:400 700}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;background:${TINTA};color:#E8EEF6;
  font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:40px;padding:0 64px;position:relative}
body::before{content:"";position:absolute;inset:0;
  background:radial-gradient(58% 62% at 6% 0%,rgba(225,26,65,.30),transparent 62%),
             radial-gradient(48% 52% at 96% 96%,rgba(174,3,37,.28),transparent 66%)}
.txt{position:relative;width:560px;flex:none}
.badge{display:inline-flex;align-items:center;gap:10px;padding:9px 18px 9px 14px;border-radius:999px;
  border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);font-size:19px;color:#B9C6D6}
.badge i{width:9px;height:9px;border-radius:50%;background:${ROJO};box-shadow:0 0 0 4px rgba(225,26,65,.25)}
h1{font-family:'Outfit',sans-serif;font-weight:800;font-size:66px;line-height:1.04;letter-spacing:-.03em;margin:26px 0 20px}
h1 span{background:linear-gradient(100deg,${ROJO_CLARO},#FF7A93);-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:25px;line-height:1.42;color:#93A4B8;max-width:470px}
.url{display:flex;align-items:center;gap:14px;margin-top:34px;font-family:'Outfit',sans-serif;font-weight:700;font-size:22px}
.url span{width:44px;height:44px;flex:none}
.pitch{position:relative;flex:1;display:grid;place-items:center}
.pitch svg{width:100%;filter:drop-shadow(0 30px 60px rgba(0,0,0,.6))}
</style>
<div class="txt">
  <div class="badge"><i></i>Gratis · Sin registro · Sin instalar</div>
  <h1>Pizarra <span>Táctica</span><br>de Fútbol</h1>
  <p>Material, jugadores y animación de la jugada. En el navegador.</p>
  <div class="url"><span>${marcaSimple(7)}</span>samuaces.github.io/PRUEBAS</div>
</div>
<div class="pitch">${campoSvg()}</div>`;
}

// Un campo con una jugada, dibujado a mano para la imagen social.
function campoSvg() {
  const jug = (x, y, n, col) =>
    `<g><circle cx="${x}" cy="${y}" r="13" fill="${col}" stroke="#fff" stroke-width="2"/>` +
    `<text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Outfit,sans-serif" font-size="13" font-weight="700" fill="#fff">${n}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 300">
  <defs>
    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B7A46"/><stop offset="1" stop-color="#125C33"/></linearGradient>
  </defs>
  <rect width="460" height="300" rx="14" fill="url(#c)"/>
  <g fill="#FFFFFF" opacity=".045">
    ${[0, 2, 4, 6, 8].map(i => `<rect x="${14 + i * 43}" y="10" width="43" height="280"/>`).join('')}
  </g>
  <g stroke="#FFFFFF" stroke-width="2.2" fill="none" opacity=".9">
    <rect x="16" y="14" width="428" height="272" rx="3"/>
    <path d="M230 14v272"/><circle cx="230" cy="150" r="44"/>
    <path d="M16 76h58v148H16M444 76h-58v148h58"/>
    <path d="M16 116h22v68H16M444 116h-22v68h22"/>
  </g>
  <path d="M116 176 C 150 150, 180 140, 208 146" stroke="#F1C40F" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M262 210 L316 154" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-dasharray="9 7" stroke-linecap="round"/>
  <path d="M328 141 L322 157.5 L312 147.5 Z" fill="#FFFFFF"/>
  <g fill="#F4820B">${[250, 276, 302].map((x) =>
    `<path d="M${x} 258 l7.5 -14 l7.5 14 z"/>`).join('')}</g>
  ${jug(74, 150, 1, '#E03B2F')}${jug(150, 96, 3, '#E03B2F')}${jug(116, 176, 5, '#E03B2F')}
  ${jug(208, 146, 8, '#E03B2F')}${jug(262, 210, 11, '#E03B2F')}
  ${jug(322, 100, 6, '#2E86DE')}${jug(352, 176, 4, '#2E86DE')}${jug(240, 236, 9, '#2E86DE')}
</svg>`;
}

/* ------------------------------------------------------------------------ */
async function main() {
  writeFileSync(join(raiz, 'assets/img/favicon.svg'), marcaSimple(7) + '\n');

  const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage();

  async function png(svg, lado, destino) {
    await p.setViewport({ width: lado, height: lado, deviceScaleFactor: 1 });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>` + svg);
    await p.screenshot({ path: join(raiz, destino), omitBackground: true });
  }

  await png(marcaCompleta(14), 192, 'assets/img/icon-192.png');
  await png(marcaCompleta(14), 512, 'assets/img/icon-512.png');
  await png(marcaCompleta(0), 180, 'assets/img/apple-touch-icon.png');   // iOS recorta él

  await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await p.setContent(ogHtml(), { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(raiz, 'assets/img/og-image.png') });

  await b.close();
  console.log('iconos generados');
}

if (import.meta.url === 'file://' + process.argv[1]) main();
