# Cookie Play — versión para el móvil

Esta carpeta es una **app web que funciona entera dentro del teléfono**: no hay
servidor, ni cuentas, ni coste. Se publica como página estática (GitHub Pages) y
se instala en la pantalla de inicio como una app más.

## Cómo se usa

1. Abre la dirección donde esté publicada, en Safari.
2. **Compartir → Añadir a pantalla de inicio.** Queda con el icono de la galleta.
3. Ábrela y carga tu lista: desde un archivo `.m3u` de Archivos, desde la
   dirección de la lista, o pegando el contenido.

Con la dirección se prueban dos vías: la descarga directa del `.m3u` y, si el
proveedor la bloquea (lo habitual), **la API del panel Xtream**, que además trae
valoraciones, géneros, sinopsis y carátulas. Los episodios de cada serie se
piden al abrir su ficha, para no descargar miles de capítulos de golpe. Cuando
se usa esa vía, las credenciales quedan guardadas en el teléfono para poder
pedir esos episodios.

La lista se ordena en películas, series y canales y **se guarda en el propio
teléfono** (IndexedDB); no se sube a ningún sitio. Favoritos, vistos y ajustes
van en el almacenamiento local del navegador.

## Cuando el proveedor no atiende al navegador

Casi ningún panel IPTV responde a peticiones hechas desde una web. Para esos
casos la app ofrece, por orden de comodidad:

1. **Cargar con intermediario** — un servicio que pide la lista por ti. Un toque,
   sin configurar nada; a cambio, la dirección de tu lista pasa por ese servicio.
2. **Tu propio intermediario** — `rele/worker.js` es un Cloudflare Worker que
   hace lo mismo en tu cuenta gratuita (5 minutos, sin tarjeta). Se pega su
   dirección en *Ajustes → Mi intermediario* y ya nada sale hacia terceros.
3. **Archivo o portapapeles** — descargar la lista en el iPhone (Safari o la app
   Atajos) y cargarla desde la app. Nada sale del teléfono.

## Qué reproduce y qué no

- **Listas por `https`:** se ven dentro de la app, con el reproductor nativo de
  iOS (HLS incluido).
- **Listas por `http`:** el iPhone no deja mezclar vídeo http con una página
  https. La app lo detecta, prueba primero la versión https del mismo servidor y,
  si no existe, te ofrece **abrir ese canal en VLC** (gratis en la App Store) o
  copiar el enlace. Ordenar, buscar y guardar favoritos funciona igual.

Para reproducir cualquier lista sin depender de esto está la versión con
servidor de la carpeta `iptv/`, que hace de intermediaria.

## Archivos

```
movil/
├─ index.html      estructura de la app
├─ estilo.css      mismo lenguaje visual que la versión de escritorio
├─ app.js          parser M3U, catálogo, vistas y reproductor (sin dependencias)
├─ sw.js           service worker: permite instalarla y abrir sin conexión
├─ manifest.webmanifest
└─ icons/          logo, logotipo e iconos de app
```
