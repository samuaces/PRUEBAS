# Cookie Play

**Tu IPTV personal.** Metes tus listas (M3U o Xtream Codes) y la app las organiza
sola en **películas**, **series** y **canales de TV**, con favoritos, buscador y
una lista de recomendados basada en las valoraciones.

Todo corre en tu servidor o en tu equipo. No hay servicios externos ni cuentas:
las listas, los favoritos y el historial se guardan en `iptv/data/`, fuera del
control de versiones.

---

## La vía fácil: tenerla en el móvil (el tuyo y el de quien tú quieras)

Son dos pasos: **publicas la app una vez** y luego **cada móvil la instala** desde
esa dirección. Quien la use no tiene que instalar nada raro ni saber nada de esto.

### Paso 1 — Publicar la app (10 minutos, una sola vez)

1. Entra en [Render](https://render.com) y crea una cuenta (sirve la de GitHub).
2. **New → Blueprint** y elige este repositorio. Render lee el `render.yaml` que
   ya está preparado.
3. Te pedirá `ACCESS_PIN`: esa es **la contraseña de la app**. Ponle una que
   puedas pasar por WhatsApp sin apuros.
4. Dale a crear y espera a que ponga *Live*. Te queda una dirección tipo
   `https://cookie-play.onrender.com`.

Ese es tu link. Sirve para siempre y desde cualquier red.

> El mismo `Dockerfile` vale para Railway, Fly.io o un VPS si prefieres otro
> sitio. En Render, el plan con disco persistente cuesta unos 7 $/mes; es lo que
> mantiene tus listas y favoritos entre reinicios. Si quieres probar en el plan
> gratuito, rellena las variables `PLAYLIST_URL` (o `XTREAM_HOST`, `XTREAM_USER`
> y `XTREAM_PASS`) y la app se reconfigura sola cada vez que el servidor
> despierta; lo que sí perderás en cada reinicio son los favoritos.

### Paso 2 — Instalarla en cada móvil (1 minuto por móvil)

Le pasas el link y la contraseña a quien quieras, y que haga esto:

- **iPhone / iPad**: abre el link en Safari → botón **Compartir** → **Añadir a
  pantalla de inicio**.
- **Android**: abre el link en Chrome → menú **⋮** → **Instalar aplicación**
  (o «Añadir a pantalla de inicio»).

Queda con el icono de la galleta, se abre a pantalla completa sin barra de
navegador y pide la contraseña la primera vez. A partir de ahí, es una app más.

### Alternativa sin publicar nada: Tailscale

Si prefieres no sacar nada a internet: instala
[Tailscale](https://tailscale.com/download) en el equipo que ejecuta la app y en
los móviles, con la misma cuenta (o invitando a la otra persona a tu red).
Arranca la app con `--red` y tendrás una dirección fija tipo
`http://100.x.y.z:8787` que funciona desde cualquier sitio. Es gratis y privado,
pero el equipo tiene que estar encendido y la otra persona necesita Tailscale.

---

## Abrirla en el ordenador, de un clic

Descarga la carpeta `iptv/` y haz **doble clic** en el lanzador de tu sistema:

| Sistema | Archivo |
| --- | --- |
| macOS | `Iniciar Cookie Play.command` |
| Windows | `Iniciar Cookie Play.bat` |
| Linux | `iniciar-cookie-play.sh` |

Arranca la app, busca un puerto libre y **abre el navegador solo**. Para cerrarla,
cierra esa ventana. Lo único que necesitas instalado es
[Node.js](https://nodejs.org) (versión LTS); si falta, el lanzador te lo dice.

> En macOS, la primera vez: clic derecho en el archivo → **Abrir** → **Abrir**.

Con la app abierta, el botón **Instalar app** de la barra superior la deja
también en el escritorio con su icono.

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

## Variables de entorno

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `8787` | Puerto del servidor |
| `HOST` | `127.0.0.1` | `0.0.0.0` para verlo desde otros dispositivos |
| `ACCESS_PIN` | vacía | Contraseña de acceso. **Obligatoria si publicas la app** |
| `PLAYLIST_URL` | vacía | Configura una lista M3U al arrancar |
| `PLAYLIST_NAME` | `Lista principal` | Nombre de esa lista |
| `XTREAM_HOST` / `XTREAM_USER` / `XTREAM_PASS` | vacías | Configura una cuenta Xtream al arrancar |

Desde la terminal: `cd iptv && npm start` y abre <http://127.0.0.1:8787>.

## Cómo está montado

```
iptv/
├─ Iniciar Cookie Play.command / .bat / iniciar-cookie-play.sh   lanzadores
├─ iniciar.mjs        elige puerto, arranca el servidor y abre el navegador
├─ server.js          API, archivos estáticos y proxy de vídeo (Node puro)
├─ Dockerfile         para publicarla en Render, Railway, Fly.io o un VPS
├─ src/
│  ├─ store.js        persistencia en JSON, escritura atómica
│  ├─ parse.js        parser M3U, limpieza de títulos y clasificador
│  ├─ xtream.js       cliente de Xtream Codes
│  ├─ library.js      catálogo unificado, búsqueda y recomendaciones
│  ├─ tmdb.js         enriquecimiento opcional con TMDB (con caché)
│  └─ sync.js         orquesta descarga → parseo → catálogo
├─ tools/
│  └─ generar-iconos.py  regenera los iconos a partir del logo
└─ public/            interfaz (ES modules, sin build)
   ├─ index.html
   ├─ login.html     pantalla de acceso cuando hay ACCESS_PIN
   ├─ manifest.webmanifest + sw.js   para poder instalarla como app
   ├─ css/style.css
   ├─ icons/         logo, logotipo e iconos de la app
   └─ js/            app, vistas, componentes, reproductor
```

El vídeo pasa siempre por `/api/proxy`, que resuelve los problemas de CORS,
manda el `User-Agent` que esperan estos servidores, reescribe los manifiestos
HLS y soporta `Range` para poder saltar dentro de una película. La reproducción
usa HLS nativo cuando el navegador lo soporta (Safari) y `hls.js` en el resto.

## La marca

El logo, el logotipo y la paleta (cian `#11cbf1`, azul `#1b85c8`, galleta
`#e0a868` y blanco) son los de la lámina de Cookie Play. Los iconos de la app se
generan del logo con `python3 tools/generar-iconos.py`; si cambias
`public/icons/logo.png`, vuelve a ejecutarlo y se rehacen todos los tamaños.

## Aviso

La app no incluye ni distribuye contenido: solo reproduce las listas que tú le
des. Usa listas a las que tengas derecho de acceso.
