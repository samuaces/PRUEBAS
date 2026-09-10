/* Publica el sitio en la rama gh-pages, ya en la raíz del dominio propio.
 *
 *   node tools/publicar.mjs [ruta del clon de gh-pages]
 *
 * Antes de tocar nada comprueba que klym.xyz apunte de verdad a GitHub. Si no
 * apunta, no publica: poner el archivo CNAME sin DNS hace que GitHub redirija
 * samuaces.github.io al dominio nuevo, y como el dominio nuevo todavía no
 * responde, la web se queda inaccesible por las dos direcciones. Ya pasó una vez.
 *
 * Lo que queda publicado:
 *   /            la portada          /app/     la pizarra
 *   /cookie/     intacto, es otra cosa que ya estaba
 *   /pizarra/    dos redirecciones a las direcciones nuevas, para que sigan
 *                funcionando los enlaces guardados y la app ya instalada
 */
import { promises as dns } from 'node:dns';
import {
  copyFileSync, mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOMINIO = 'klym.xyz';
const IPS_GITHUB = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = process.argv[2] || join(RAIZ, '..', 'PRUEBAS-gh-pages');

/* ---------- 1. El portero: ¿el DNS ya apunta a GitHub? ---------- */
let ips = [];
try {
  ips = await dns.resolve4(DOMINIO);
} catch (e) {
  corta(`${DOMINIO} no resuelve todavía (${e.code}).`);
}
const apunta = ips.filter((ip) => IPS_GITHUB.includes(ip));
if (apunta.length === 0) {
  corta(
    `${DOMINIO} resuelve a ${ips.join(', ')}, que no es GitHub Pages.\n` +
    `  Faltan los registros A del vértice:\n    ${IPS_GITHUB.join('\n    ')}`
  );
}
console.log(`DNS correcto · ${DOMINIO} → ${apunta.join(', ')}`);
if (apunta.length < 4) {
  console.log(`  (aviso: solo ${apunta.length} de las 4 direcciones de GitHub; conviene poner las cuatro)`);
}

/* ---------- 2. Apartar lo que ya había en la raíz ---------- */
// En la raíz de gh-pages vive la pizarra vieja, la de una sola página. La
// portada nueva ocupa su sitio, así que se guarda aparte en vez de perderla.
// Se reconoce porque la portada nueva lleva el dominio dentro y aquella no.
const vieja = join(DESTINO, 'pizarra-antigua.html');
const raizActual = join(DESTINO, 'index.html');
let copiados = 0;
if (existsSync(raizActual) && !readFileSync(raizActual, 'utf8').includes(DOMINIO)) {
  copia(raizActual, vieja);
  console.log('La pizarra antigua se guarda en /pizarra-antigua.html');
} else if (existsSync(vieja)) {
  console.log('La pizarra antigua ya estaba guardada en /pizarra-antigua.html');
}

/* ---------- 3. El sitio, en la raíz ---------- */
const SUELTOS = ['index.html', '404.html', 'llms.txt', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'CNAME'];
const CARPETAS = ['app', 'assets'];

for (const f of SUELTOS) copia(join(RAIZ, f), join(DESTINO, f));
for (const c of CARPETAS) copiaArbol(join(RAIZ, c), join(DESTINO, c));

// /pizarra/ pasa a ser solo dos redirecciones.
const antiguo = join(DESTINO, 'pizarra');
if (existsSync(antiguo)) rmSync(antiguo, { recursive: true, force: true });
redirige(join(antiguo, 'index.html'), '/', 'la portada');
redirige(join(antiguo, 'app', 'index.html'), '/app/', 'la pizarra');

console.log(`\nPublicado · ${copiados} archivos en ${DESTINO}`);
console.log('Falta: git add -A && git commit && git push origin gh-pages');

/* ---------- utilidades ---------- */
function corta(motivo) {
  console.error(`\nNO SE PUBLICA. ${motivo}\n`);
  console.error('En el panel de DNS del dominio (Porkbun) tiene que haber:');
  console.error('  A     @      185.199.108.153');
  console.error('  A     @      185.199.109.153');
  console.error('  A     @      185.199.110.153');
  console.error('  A     @      185.199.111.153');
  console.error('  CNAME www    samuaces.github.io');
  console.error('y fuera los registros de aparcamiento que trae el registrador.\n');
  process.exit(1);
}

function copia(origen, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origen, destino);
  copiados++;
}

function copiaArbol(origen, destino) {
  for (const nombre of readdirSync(origen)) {
    const de = join(origen, nombre);
    if (statSync(de).isDirectory()) copiaArbol(de, join(destino, nombre));
    else copia(de, join(destino, nombre));
  }
}

function redirige(destino, hacia, que) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>La pizarra se ha mudado</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="https://${DOMINIO}${hacia}">
<meta http-equiv="refresh" content="0; url=https://${DOMINIO}${hacia}">
<script>location.replace('https://${DOMINIO}${hacia}' + location.search + location.hash)</script>
</head>
<body style="background:#070A0F;color:#E8EEF6;font-family:system-ui,sans-serif;padding:40px">
<p>La pizarra está ahora en <a href="https://${DOMINIO}${hacia}" style="color:#FF5C7A">${DOMINIO}${hacia}</a> (${que}).</p>
</body>
</html>
`;
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html);
  copiados++;
  console.log(`Redirección · /${relative(DESTINO, destino).replace(/index\.html$/, '')} → ${hacia}`);
}
