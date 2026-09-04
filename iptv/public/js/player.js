/** Reproductor a pantalla completa con soporte HLS. */
import { el, icon, toast } from './dom.js';
import { proxied } from './api.js';
import { saveProgress } from './state.js';

const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
let hlsPromise = null;

/** Carga hls.js bajo demanda (solo hace falta para canales y m3u8). */
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!hlsPromise) {
    hlsPromise = new Promise((resolve, reject) => {
      const script = el('script', { src: HLS_CDN, onload: () => resolve(window.Hls), onerror: () => reject(new Error('sin hls.js')) });
      document.head.append(script);
    }).catch(() => null);
  }
  return hlsPromise;
}

let current = null;

/**
 * Abre el reproductor.
 * @param {{ url:string, title:string, subtitle?:string, id?:string, type?:string, poster?:string, episodeId?:string, resumeAt?:number }} media
 */
export async function play(media) {
  close();
  const video = el('video', { autoplay: true, playsInline: true, controls: true, preload: 'auto' });
  const status = el('div', { class: 'player-status' });
  const bar = el('div', { class: 'player-bar' },
    el('button', { class: 'icon-button', title: 'Cerrar (Esc)', onclick: close }, icon('close')),
    el('div', {},
      el('div', { class: 'title' }, media.title || 'Reproduciendo'),
      media.subtitle ? el('div', { class: 'sub' }, media.subtitle) : null
    ),
    el('div', { class: 'spacer' }),
    el('button', { class: 'icon-button', title: 'Pantalla completa (F)', onclick: toggleFullscreen }, icon('tv'))
  );
  const backdrop = el('div', { class: 'player-backdrop' }, video, bar, status);

  const setStatus = (title, detail) => {
    status.innerHTML = '';
    if (!title) return;
    status.append(el('div', { class: 'box' }, el('strong', {}, title), detail ? el('p', {}, detail) : null));
  };
  setStatus('Conectando…');

  document.body.append(backdrop);
  current = { backdrop, video, hls: null, media, timer: null, idleTimer: null };

  const src = proxied(media.url);
  const isHls = /\.m3u8(\?|$)/i.test(media.url) || /\/live\//i.test(media.url) || !/\.(mp4|mkv|avi|mov|m4v)(\?|$)/i.test(media.url);

  if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
    const Hls = await loadHls();
    if (Hls && Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30, manifestLoadingTimeOut: 20000, fragLoadingMaxRetry: 4 });
      current.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { setStatus(null); video.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setStatus('No se pudo reproducir', 'El servidor de la lista no responde o el canal ya no existe. Prueba con otra fuente o vuelve a sincronizar.');
      });
    } else {
      video.src = src;
    }
  } else {
    video.src = src;
  }

  video.addEventListener('loadedmetadata', () => {
    setStatus(null);
    if (media.resumeAt && media.resumeAt > 10 && Number.isFinite(video.duration)) video.currentTime = media.resumeAt;
  });
  video.addEventListener('playing', () => setStatus(null));
  video.addEventListener('waiting', () => setStatus('Cargando…'));
  video.addEventListener('error', () => setStatus('No se pudo reproducir', 'Comprueba que la lista sigue activa. Algunos servidores limitan el número de conexiones simultáneas.'));

  // Guardado periodico de la posicion, solo para peliculas y episodios.
  if (media.id && media.type !== 'live') {
    current.timer = setInterval(() => {
      if (!video.duration || video.paused) return;
      saveProgress({
        id: media.id,
        episodeId: media.episodeId || null,
        type: media.type,
        title: media.title,
        poster: media.poster || '',
        url: media.url,
        position: Math.floor(video.currentTime),
        duration: Math.floor(video.duration)
      });
    }, 15000);
  }

  const resetIdle = () => {
    backdrop.classList.remove('idle');
    clearTimeout(current.idleTimer);
    current.idleTimer = setTimeout(() => backdrop.classList.add('idle'), 2800);
  };
  backdrop.addEventListener('mousemove', resetIdle);
  backdrop.addEventListener('touchstart', resetIdle, { passive: true });
  resetIdle();

  document.addEventListener('keydown', onKey);
}

function toggleFullscreen() {
  const node = current?.backdrop;
  if (!node) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else node.requestFullscreen?.().catch(() => toast('Tu navegador ha bloqueado la pantalla completa'));
}

function onKey(event) {
  if (!current) return;
  const { video } = current;
  switch (event.key) {
    case 'Escape': close(); break;
    case ' ': event.preventDefault(); video.paused ? video.play() : video.pause(); break;
    case 'f': case 'F': toggleFullscreen(); break;
    case 'ArrowRight': video.currentTime += 10; break;
    case 'ArrowLeft': video.currentTime -= 10; break;
    case 'ArrowUp': video.volume = Math.min(1, video.volume + 0.1); break;
    case 'ArrowDown': video.volume = Math.max(0, video.volume - 0.1); break;
    default: break;
  }
}

/** Cierra el reproductor y libera recursos. */
export function close() {
  if (!current) return;
  const { backdrop, video, hls, timer, media } = current;
  if (media?.id && media.type !== 'live' && video.duration && video.currentTime > 30) {
    saveProgress({
      id: media.id,
      episodeId: media.episodeId || null,
      type: media.type,
      title: media.title,
      poster: media.poster || '',
      url: media.url,
      position: Math.floor(video.currentTime),
      duration: Math.floor(video.duration)
    });
  }
  clearInterval(timer);
  clearTimeout(current.idleTimer);
  document.removeEventListener('keydown', onKey);
  try { hls?.destroy(); } catch { /* ya destruido */ }
  video.pause();
  video.removeAttribute('src');
  video.load();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  backdrop.remove();
  current = null;
}
