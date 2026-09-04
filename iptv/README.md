# Mi IPTV

Reproductor IPTV personal: metes tus listas (M3U o Xtream Codes) y la app las
organiza sola en **películas**, **series** y **canales de TV**, con favoritos,
buscador y una lista de recomendados basada en las valoraciones.

Todo se ejecuta en tu equipo. No hay servicios externos ni cuentas: los datos
(listas, favoritos, historial) se guardan en `iptv/data/`, que está fuera del
control de versiones.

## Arrancar

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

> Ojo: la app **no tiene contraseña**. Si la abres a la red local (`HOST=0.0.0.0`),
> cualquiera de esa red podrá usarla. Para compartirla con alguien de fuera, lo
> sensato es que se copie la carpeta y la arranque en su equipo, o usar una VPN
> tipo Tailscale.

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
├─ server.js          API y archivos estáticos (Node puro, sin dependencias)
├─ src/
│  ├─ store.js        persistencia en JSON, escritura atómica
│  ├─ parse.js        parser M3U, limpieza de títulos y clasificador
│  ├─ xtream.js       cliente de Xtream Codes
│  ├─ library.js      catálogo unificado, búsqueda y recomendaciones
│  ├─ tmdb.js         enriquecimiento opcional con TMDB (con caché)
│  └─ sync.js         orquesta descarga → parseo → catálogo
└─ public/            interfaz (ES modules, sin build)
   ├─ index.html
   ├─ css/style.css
   └─ js/             app, vistas, componentes, reproductor
```

El vídeo pasa siempre por `/api/proxy`, que resuelve los problemas de CORS,
manda el `User-Agent` que esperan estos servidores, reescribe los manifiestos
HLS y soporta `Range` para poder saltar dentro de una película. La reproducción
usa HLS nativo cuando el navegador lo soporta (Safari) y `hls.js` en el resto.

## Aviso

La app no incluye ni distribuye contenido: solo reproduce las listas que tú le
des. Usa listas a las que tengas derecho de acceso.
