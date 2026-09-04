# Mi IPTV

Reproductor IPTV personal: metes tus listas (M3U o Xtream Codes) y la app las
organiza sola en **películas**, **series** y **canales de TV**, con favoritos,
buscador y una lista de recomendados basada en las valoraciones.

Todo se ejecuta en tu equipo. No hay servicios externos ni cuentas: los datos
(listas, favoritos, historial) se guardan en `iptv/data/`, que está fuera del
control de versiones.

## Abrirla de un clic

Descarga la carpeta `iptv/` y haz **doble clic** en el lanzador de tu sistema:

| Sistema | Archivo |
| --- | --- |
| macOS | `Iniciar Mi IPTV.command` |
| Windows | `Iniciar Mi IPTV.bat` |
| Linux | `iniciar-mi-iptv.sh` |

El lanzador arranca la app, busca un puerto libre y **abre el navegador solo**.
Para cerrarla, cierra esa ventana. Lo único que hace falta tener instalado es
[Node.js](https://nodejs.org) (versión LTS); si no lo tienes, el propio lanzador
te lo dice.

> En macOS, la primera vez puede pedirte permiso: clic derecho sobre el archivo →
> **Abrir** → **Abrir**. Solo pasa la primera vez.

### Instalarla como app de verdad

Con la app abierta, pulsa **Instalar app** en la barra superior (Chrome, Edge o
Brave), o en el iPhone/iPad: **Compartir → Añadir a pantalla de inicio**. Queda
con su icono propio y ventana sin barra de navegador, como cualquier otra app.
El lanzador sigue siendo el que la enciende: si abres el icono y el servidor no
está en marcha, la app te lo dice.

### Desde el móvil o la tele de casa

Arranca con `--red` (en Windows: `"Iniciar Mi IPTV.bat" --red`) y el lanzador te
mostrará una dirección tipo `http://192.168.1.40:8787` que puedes abrir desde
cualquier dispositivo de tu red.

> Ojo: la app **no tiene contraseña**. Con `--red`, cualquiera de tu red local
> puede usarla. Para compartirla con alguien de fuera, lo sensato es que se
> copie la carpeta y la arranque en su equipo, o usar una VPN tipo Tailscale.

## Arrancar desde la terminal

```bash
cd iptv
npm start          # o: node server.js
```

Abre <http://127.0.0.1:8787>. No hay dependencias que instalar: solo hace falta
Node 20 o superior.

Variables opcionales:

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `8787` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Pon `0.0.0.0` para verlo desde el móvil o la tele de casa |

## Añadir tus listas

En **Ajustes → Añadir lista** hay tres formas:

1. **URL M3U** — el típico enlace `http://servidor/get.php?username=…&type=m3u_plus`.
2. **Xtream Codes** — servidor, usuario y contraseña. Es la mejor opción: el panel
   devuelve valoraciones, géneros, sinopsis y carátulas, y las series llegan ya
   separadas por temporadas y episodios.
3. **Pegar / archivo** — pega el contenido de un `.m3u` o elige el archivo.

Al añadir una lista se sincroniza sola. Después puedes volver a sincronizar
cuando quieras desde el botón de la barra superior o desde Ajustes. Con
catálogos grandes (decenas de miles de entradas) el primer sincronizado tarda un
par de minutos.

## Cómo se ordena el contenido

El clasificador mira, por este orden, la ruta del stream (`/movie/`, `/series/`,
`/live/`), el patrón de episodio del título (`S01E02`, `1x02`, `T1 E2`), la
categoría (`group-title`) y la extensión del archivo. Además:

- Limpia los títulos de prefijos y etiquetas (`ES|`, `[1080p]`, `4K`, `CAST`…) y
  guarda esas etiquetas aparte para distinguir fuentes duplicadas.
- Une el mismo título que aparece en varias listas o calidades en una sola ficha
  con varias fuentes.
- Agrupa los episodios sueltos en series con sus temporadas.
- Oculta las categorías marcadas como adultas (se puede desactivar en Ajustes).

## Recomendaciones

La pestaña **Recomendados** puntúa cada título con:

- la **valoración** (la del proveedor Xtream o la de TMDB) como peso principal,
- la **afinidad** con lo que ya ves: géneros y categorías de tus favoritos y de
  tu historial,
- un empujón a lo **añadido recientemente** y a los estrenos.

Lo que ya tienes en favoritos no se repite, y lo ya visto baja posiciones.

### Valoraciones y carátulas (TMDB, opcional)

Si tu lista no trae valoraciones, en **Ajustes → Clave de TMDB** puedes pegar una
clave gratuita de [themoviedb.org](https://www.themoviedb.org/settings/api). Con
ella la app completa carátulas, sinopsis, género, año y nota, que es lo que
alimenta las recomendaciones. Los resultados se cachean un mes en
`data/meta-cache.json`.

## Atajos de teclado

| Tecla | Acción |
| --- | --- |
| `/` o `⌘/Ctrl + K` | Ir al buscador |
| `Esc` | Cerrar ficha, reproductor o buscador |
| `Espacio` | Pausa / reproducir |
| `←` `→` | Saltar 10 segundos |
| `↑` `↓` | Volumen |
| `F` | Pantalla completa |

## Cómo está montado

```
iptv/
├─ Iniciar Mi IPTV.command / .bat / iniciar-mi-iptv.sh   lanzadores de un clic
├─ iniciar.mjs        elige puerto, arranca el servidor y abre el navegador
├─ server.js          API y archivos estáticos (Node puro, sin dependencias)
├─ src/
│  ├─ store.js        persistencia en JSON, escritura atómica
│  ├─ parse.js        parser M3U, limpieza de títulos y clasificador
│  ├─ xtream.js       cliente de Xtream Codes
│  ├─ library.js      catálogo unificado, búsqueda y recomendaciones
│  ├─ tmdb.js         enriquecimiento opcional con TMDB (con caché)
│  └─ sync.js         orquesta descarga → parseo → catálogo
├─ tools/
│  └─ generar-iconos.py  regenera los iconos PNG de la app
└─ public/            interfaz (ES modules, sin build)
   ├─ index.html
   ├─ manifest.webmanifest + sw.js   para poder instalarla como app
   ├─ css/style.css
   ├─ icons/
   └─ js/             app, vistas, componentes, reproductor
```

El vídeo pasa siempre por `/api/proxy`, que resuelve los problemas de CORS,
manda el `User-Agent` que esperan estos servidores, reescribe los manifiestos
HLS y soporta `Range` para poder saltar dentro de una película. La reproducción
usa HLS nativo cuando el navegador lo soporta (Safari) y `hls.js` en el resto.

## Aviso

La app no incluye ni distribuye contenido: solo reproduce las listas que tú le
des. Usa listas a las que tengas derecho de acceso.
