#!/usr/bin/env node
/**
 * Lanzador de Cookie Play.
 * Busca un puerto libre, arranca el servidor, abre el navegador y muestra
 * también la dirección para verla desde el móvil o la tele.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { networkInterfaces, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { abreTunel } from './src/tunel.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const START_PORT = Number(process.env.PORT || 8787);
// Con --red la app queda accesible desde el resto de la casa.
// Con --publico se crea ademas un enlace https gratuito para verla desde fuera.
const PUBLICO = process.argv.includes('--publico');
const OPEN_TO_LAN = process.argv.includes('--red') || process.env.HOST === '0.0.0.0';
const HOST = OPEN_TO_LAN ? '0.0.0.0' : '127.0.0.1';

function portFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}

async function findPort(start) {
  for (let port = start; port < start + 20; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error('No hay puertos libres entre ' + start + ' y ' + (start + 20));
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

function openBrowser(url) {
  const commands = { darwin: ['open', [url]], win32: ['cmd', ['/c', 'start', '""', url]] };
  const [command, args] = commands[platform()] || ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    // Si el sistema no tiene con que abrir el navegador, no debe tumbar el lanzador.
    child.on('error', () => console.log(`  Abre esta dirección en tu navegador: ${url}`));
    child.unref();
  } catch {
    console.log(`  Abre esta dirección en tu navegador: ${url}`);
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url + '/api/state', { signal: AbortSignal.timeout(1500) });
      // Con contraseña, /api/state responde 401: el servidor esta vivo igualmente.
      if (res.status < 500) return true;
    } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/**
 * Contrasena de acceso para el enlace publico.
 * Se guarda en data/acceso.json para que no cambie entre arranques.
 */
async function contrasenaAcceso() {
  if (process.env.ACCESS_PIN) return process.env.ACCESS_PIN;
  const archivo = join(ROOT, 'data', 'acceso.json');
  try {
    const guardada = JSON.parse(await readFile(archivo, 'utf8')).pin;
    if (guardada) return guardada;
  } catch { /* todavia no hay ninguna */ }
  const nueva = String(randomInt(100000, 1000000));
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(archivo, JSON.stringify({ pin: nueva }, null, 2), 'utf8');
  return nueva;
}

const port = await findPort(START_PORT);
const url = `http://127.0.0.1:${port}`;
const pin = PUBLICO ? await contrasenaAcceso() : process.env.ACCESS_PIN;

const server = spawn(process.execPath, [join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), HOST, QUIET: '1', ...(pin ? { ACCESS_PIN: pin } : {}) },
  stdio: ['ignore', 'inherit', 'inherit']
});

let tunel = null;

server.on('exit', (code) => { tunel?.kill(); process.exit(code ?? 0); });
const stop = () => { tunel?.kill(); server.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (await waitForServer(url)) {
  const lan = OPEN_TO_LAN || PUBLICO ? lanAddress() : null;
  console.log(`\n  Cookie Play está lista en:  ${url}`);
  if (lan) console.log(`  Desde el móvil o la tele:   http://${lan}:${port}`);

  if (PUBLICO) {
    try {
      const abierto = await abreTunel(port, { onProgress: (paso) => console.log(`  ${paso}`) });
      tunel = abierto.proceso;
      const marco = '─'.repeat(52);
      console.log(`\n  ┌${marco}┐`);
      console.log('  │  Enlace para el móvil (funciona desde cualquier red)');
      console.log(`  │  ${abierto.url}`);
      console.log(`  │  Contraseña: ${pin}`);
      console.log(`  └${marco}┘`);
      console.log('  Pásale ese enlace y esa contraseña a quien quieras.');
      console.log('  El enlace vive mientras esta ventana esté abierta.\n');
      tunel.on('exit', () => console.log('\n  El enlace público se ha cerrado. Cierra y vuelve a abrir para tener uno nuevo.\n'));
    } catch (err) {
      console.error(`\n  No se ha podido crear el enlace público: ${err.message}`);
      console.error('  La app sigue funcionando en este equipo y en tu red local.\n');
    }
  }

  console.log('  Para cerrar la app: cierra esta ventana o pulsa Ctrl+C\n');
  openBrowser(url);
} else {
  console.error('\n  El servidor no ha arrancado. Revisa los mensajes de arriba.\n');
}
