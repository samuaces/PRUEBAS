/* Publica el sitio en la rama gh-pages.
 *
 *   node tools/publicar.mjs [ruta del clon de gh-pages]
 *
 * El script mira el DNS y decide solo dónde publicar, porque cada sitio
 * necesita unas direcciones absolutas distintas (canonical, Open Graph,
 * sitemap, robots) y anunciar las que no son hace daño: un canonical apuntando
 * a un dominio que todavía no sirve la web manda a los buscadores a una página
 * de aparcamiento.
 *
 *   klym.xyz YA apunta a GitHub  →  se publica en la RAÍZ, con el archivo CNAME:
 *       /            la portada          /app/     la pizarra
 *       /cookie/     intacto, es otra cosa que ya estaba
 *       /pizarra/    dos redirecciones, para que sigan valiendo los enlaces
 *                    guardados y la aplicación ya instalada
 *       /pizarra-antigua.html   la pizarra vieja de una sola página, guardada
 *
 *   klym.xyz TODAVÍA no  →  se publica bajo /pizarra/, como hasta ahora, y las
 *       direcciones absolutas se reescriben a samuaces.github.io. No se toca el
 *       CNAME: ponerlo sin DNS hace que GitHub redirija samuaces.github.io al
 *       dominio nuevo y, como el dominio nuevo no responde, la web se queda
 *       inaccesible por las dos direcciones. Ya pasó una vez.
 */
import { promises as dns } from 'node:dns';
import {
  copyFileSync, mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync,
} from 'node:fs';
import { dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOMINIO = 'klym.xyz';
const EN_EL_DOMINIO = `https://${DOMINIO}`;          // lo que hay escrito en el repositorio
const DE_MOMENTO = 'https://samuaces.github.io/PRUEBAS/pizarra';
const IPS_GITHUB = ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'];
const TEXTO = new Set(['.html', '.txt', '.xml', '.webmanifest', '.json', '.js', '.css']);

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = process.argv[2] || join(RAIZ, '..', 'PRUEBAS-gh-pages');

/* ---------- 1. ¿El DNS ya apunta a GitHub? ---------- */
let ips = [];
try { ips = await dns.resolve4(DOMINIO); } catch (e) { ips = []; }
const apunta = ips.filter((ip) => IPS_GITHUB.includes(ip));
const conDominio = apunta.length > 0;

if (conDominio) {
  console.log(`DNS listo · ${DOMINIO} → ${apunta.join(', ')}`);
  if (apunta.length < 4) console.log(`  (aviso: solo ${apunta.length} de las 4 direcciones de GitHub; conviene poner las cuatro)`);
  console.log('Se publica en la raíz, con el dominio propio.\n');
} else {
  console.log(`El dominio todavía no está: ${DOMINIO} → ${ips.length ? ips.join(', ') : 'no resuelve'}`);
  console.log('Se publica bajo /pizarra/, con las direcciones de samuaces.github.io.');
  console.log('Para cambiarlo, en el panel de DNS (Porkbun) tiene que haber:');
  console.log('  A     @      185.199.108.153 / .109.153 / .110.153 / .111.153');
  console.log('  CNAME www    samuaces.github.io');
  console.log('y fuera los registros de aparcamiento del registrador.\n');
}

const BASE = conDominio ? join(DESTINO) : join(DESTINO, 'pizarra');
const URL_BUENA = conDominio ? EN_EL_DOMINIO : DE_MOMENTO;

/* ---------- 2. Apartar lo que ya había en la raíz ---------- */
let copiados = 0;
if (conDominio) {
  // La portada nueva ocupa el sitio de la pizarra vieja de una sola página:
  // se guarda aparte en vez de perderla. Se reconoce porque la nueva lleva el
  // dominio dentro y aquella no.
  const vieja = join(DESTINO, 'pizarra-antigua.html');
  const raizActual = join(DESTINO, 'index.html');
  if (existsSync(raizActual) && !readFileSync(raizActual, 'utf8').includes(DOMINIO)) {
    copia(raizActual, vieja);
    console.log('La pizarra antigua se guarda en /pizarra-antigua.html');
  } else if (existsSync(vieja)) {
    console.log('La pizarra antigua ya estaba guardada en /pizarra-antigua.html');
  }
}

/* ---------- 3. El sitio ---------- */
const SUELTOS = ['index.html', '404.html', 'llms.txt', 'robots.txt', 'sitemap.xml', 'site.webmanifest'];
const CARPETAS = ['app', 'assets'];

for (const f of SUELTOS) copia(join(RAIZ, f), join(BASE, f));
for (const c of CARPETAS) copiaArbol(join(RAIZ, c), join(BASE, c));
if (conDominio) copia(join(RAIZ, 'CNAME'), join(DESTINO, 'CNAME'));

/* ---------- 4. Las direcciones antiguas siguen valiendo ---------- */
if (conDominio) {
  const antiguo = join(DESTINO, 'pizarra');
  if (existsSync(antiguo)) rmSync(antiguo, { recursive: true, force: true });
  redirige(join(antiguo, 'index.html'), '/', 'la portada');
  redirige(join(antiguo, 'app', 'index.html'), '/app/', 'la pizarra');
}

console.log(`\nPublicado · ${copiados} archivos en ${BASE}`);
console.log(`Direcciones absolutas: ${URL_BUENA}`);
console.log('Falta: git add -A && git commit && git push origin gh-pages');

/* ---------- utilidades ---------- */
function copia(origen, destino) {
  mkdirSync(dirname(destino), { recursive: true });
  if (TEXTO.has(extname(origen))) {
    // Las direcciones absolutas se ajustan a donde va a vivir esto de verdad.
    writeFileSync(destino, readFileSync(origen, 'utf8').split(EN_EL_DOMINIO).join(URL_BUENA));
  } else {
    copyFileSync(origen, destino);
  }
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
<link rel="canonical" href="${EN_EL_DOMINIO}${hacia}">
<meta http-equiv="refresh" content="0; url=${EN_EL_DOMINIO}${hacia}">
<script>location.replace('${EN_EL_DOMINIO}${hacia}' + location.search + location.hash)</script>
</head>
<body style="background:#070A0F;color:#E8EEF6;font-family:system-ui,sans-serif;padding:40px">
<p>La pizarra está ahora en <a href="${EN_EL_DOMINIO}${hacia}" style="color:#FF5C7A">${DOMINIO}${hacia}</a> (${que}).</p>
</body>
</html>
`;
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html);
  copiados++;
  console.log(`Redirección · /${relative(DESTINO, destino).replace(/index\.html$/, '')} → ${hacia}`);
}
