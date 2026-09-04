#!/usr/bin/env node
/**
 * Lanzador de Mi IPTV.
 * Busca un puerto libre, arranca el servidor, abre el navegador y muestra
 * también la dirección para verla desde el móvil o la tele.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { networkInterfaces, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const START_PORT = Number(process.env.PORT || 8787);
// Con --red la app queda accesible desde el resto de la casa.
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
      if (res.ok) return true;
    } catch { /* todavía arrancando */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const port = await findPort(START_PORT);
const url = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, [join(ROOT, 'server.js')], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), HOST, QUIET: '1' },
  stdio: ['ignore', 'inherit', 'inherit']
});

server.on('exit', (code) => process.exit(code ?? 0));
const stop = () => { server.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

if (await waitForServer(url)) {
  const lan = OPEN_TO_LAN ? lanAddress() : null;
  console.log(`\n  Mi IPTV está lista en:      ${url}`);
  if (lan) console.log(`  Desde el móvil o la tele:  http://${lan}:${port}`);
  console.log('  Abriendo el navegador…');
  console.log('  Para cerrar la app: cierra esta ventana o pulsa Ctrl+C\n');
  openBrowser(url);
} else {
  console.error('\n  El servidor no ha arrancado. Revisa los mensajes de arriba.\n');
}
