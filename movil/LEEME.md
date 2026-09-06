# Cookie Play — versión para el móvil

Esta carpeta es una **app web que funciona entera dentro del teléfono**: no hay
servidor, ni cuentas, ni coste. Se publica como página estática (GitHub Pages) y
se instala en la pantalla de inicio como una app más.

## Cómo se usa

1. Abre la dirección donde esté publicada, en Safari.
2. **Compartir → Añadir a pantalla de inicio.** Queda con el icono de la galleta.
3. Ábrela y carga tu lista: desde un archivo `.m3u` de Archivos, desde la
   dirección de la lista, o pegando el contenido.

La lista se ordena en películas, series y canales y **se guarda en el propio
teléfono** (IndexedDB); no se sube a ningún sitio. Favoritos, vistos y ajustes
van en el almacenamiento local del navegador.

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
