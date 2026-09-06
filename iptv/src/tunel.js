/**
 * Enlace publico gratuito con Cloudflare Tunnel.
 *
 * Crea una direccion https temporal que apunta al servidor local, sin cuentas,
 * sin registros y sin coste. La descarga es el binario oficial de Cloudflare.
 */
import { spawn } from 'node:child_process';
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { arch, platform } from 'node:os';
import { DATA_DIR } from './store.js';

const BIN_DIR = join(DATA_DIR, 'bin');
const BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** Nombre del binario que toca para este sistema. */
function asset() {
  const so = platform();
  const cpu = arch();
  if (so === 'win32') {
    return { archivo: `cloudflared-windows-${cpu === 'ia32' ? '386' : 'amd64'}.exe`, binario: 'cloudflared.exe', comprimido: false };
  }
  if (so === 'darwin') {
    return { archivo: `cloudflared-darwin-${cpu === 'arm64' ? 'arm64' : 'amd64'}.tgz`, binario: 'cloudflared', comprimido: true };
  }
  const cpus = { arm64: 'arm64', arm: 'arm', x64: 'amd64' };
  return { archivo: `cloudflared-linux-${cpus[cpu] || 'amd64'}`, binario: 'cloudflared', comprimido: false };
}

const existe = (ruta) => stat(ruta).then(() => true).catch(() => false);

function ejecuta(comando, args, opciones = {}) {
  return new Promise((resolve) => {
    const hijo = spawn(comando, args, { stdio: 'ignore', ...opciones });
    hijo.on('error', () => resolve(false));
    hijo.on('exit', (code) => resolve(code === 0));
  });
}

/** Descarga cloudflared en data/bin la primera vez. */
async function descarga(onProgress) {
  const { archivo, binario, comprimido } = asset();
  await mkdir(BIN_DIR, { recursive: true });
  const destinoFinal = join(BIN_DIR, binario);
  if (await existe(destinoFinal)) return destinoFinal;

  onProgress?.('Descargando el conector de Cloudflare (solo la primera vez)…');
  const res = await fetch(`${BASE}/${archivo}`, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`la descarga respondio ${res.status}`);
  const datos = Buffer.from(await res.arrayBuffer());

  if (comprimido) {
    const tgz = join(BIN_DIR, archivo);
    await writeFile(tgz, datos);
    if (!await ejecuta('tar', ['-xzf', tgz, '-C', BIN_DIR])) throw new Error('no se pudo descomprimir cloudflared');
  } else {
    await writeFile(destinoFinal, datos);
  }
  if (platform() !== 'win32') await chmod(destinoFinal, 0o755);
  return destinoFinal;
}

/** Devuelve la ruta a cloudflared: el del sistema si ya existe, si no lo descarga. */
export async function preparaCloudflared(onProgress) {
  if (await ejecuta(platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared', ['--version'])) {
    return platform() === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  }
  return descarga(onProgress);
}

/**
 * Abre el tunel y resuelve con { url, proceso } en cuanto Cloudflare da la direccion.
 */
export async function abreTunel(puerto, { onProgress, timeoutMs = 45000 } = {}) {
  const cloudflared = await preparaCloudflared(onProgress);
  onProgress?.('Creando el enlace público…');

  const proceso = spawn(cloudflared, [
    'tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${puerto}`
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  return new Promise((resolve, reject) => {
    let resuelto = false;
    const temporizador = setTimeout(() => {
      if (resuelto) return;
      proceso.kill();
      reject(new Error('Cloudflare no ha devuelto ninguna dirección a tiempo'));
    }, timeoutMs);

    const mira = (trozo) => {
      const texto = String(trozo);
      const encontrado = texto.match(URL_RE);
      if (!encontrado || resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      resolve({ url: encontrado[0], proceso });
    };

    proceso.stdout.on('data', mira);
    proceso.stderr.on('data', mira);   // cloudflared escribe sus avisos por stderr
    proceso.on('error', (err) => {
      if (resuelto) return;
      clearTimeout(temporizador);
      reject(new Error(`no se pudo ejecutar cloudflared: ${err.message}`));
    });
    proceso.on('exit', (code) => {
      if (resuelto) return;
      clearTimeout(temporizador);
      reject(new Error(`cloudflared se ha cerrado (código ${code})`));
    });
  });
}
