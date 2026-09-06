# Cookie Play — versión para el móvil

Esta carpeta es una **app web que funciona entera dentro del teléfono**: no hay
servidor, ni cuentas, ni coste. Se publica como página estática (GitHub Pages) y
se instala en la pantalla de inicio como una app más.

## Cómo se usa

1. Abre la dirección donde esté publicada, en Safari.
2. **Compartir → Añadir a pantalla de inicio.** Queda con el icono de la galleta.
3. Ábrela, pega el enlace de tu lista y pulsa **Cargar lista**. Nada más.

Al pulsar **Cargar lista** la app prueba sola, en este orden y sin preguntar
nada: la descarga directa del `.m3u`, la API del panel Xtream, y las mismas dos
a través de un intermediario para cuando el proveedor no atiende a los
navegadores (que es lo normal). Los episodios de cada serie se piden al abrir su
ficha, para no descargar miles de capítulos de golpe.

**Varias listas.** Cada una que cargues se guarda. En Inicio aparecen como
pestañas para cambiar de una a otra, y en Ajustes se pueden quitar o añadir más.
Los favoritos son comunes a todas.

La lista se ordena en películas, series y canales y **se guarda en el propio
teléfono** (IndexedDB); no se sube a ningún sitio. Favoritos, vistos y ajustes
van en el almacenamiento local del navegador.

## Cuando el proveedor no atiende al navegador

Casi ningún panel IPTV responde a peticiones hechas desde una web. Para esos
casos la app ofrece, por orden de comodidad:

1. **Tu propio intermediario** (lo que de verdad resuelve) — `rele/worker.js` es
   un Cloudflare Worker gratuito que hace lo mismo que una app nativa: pide la
   lista y el vídeo identificándose como un reproductor, prueba también por
   http, y devuelve todo con los permisos que el navegador exige, reescribiendo
   los manifiestos HLS. Se pega su dirección en *Ajustes → Mi intermediario* y
   a partir de ahí también la reproducción pasa por él.
2. **Intermediarios públicos** — un toque, sin configurar nada, pero la
   dirección de tu lista pasa por un servicio ajeno y muchos paneles los
   rechazan.
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
