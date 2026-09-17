# Lo que está decidido y todavía no está hecho

Ideas ya habladas, con el «por qué» y las decisiones que se tomaron, para poder
retomarlas sin volver a discutirlas. No es una lista de deseos: aquí solo entra
lo que se ha decidido hacer.

---

## 1 · Panel de administración, en el ordenador (no en la web)

**Qué es.** Una herramienta pequeña que se ejecuta en el ordenador del dueño del
proyecto y enseña cómo va la cosa:

```
Entrenadores      12      (+3 esta semana)
Ejercicios        47      31 compartidos
Más abierto       Rondo 4 contra 2 · 89 veces
Reportes          0 pendientes

Últimas altas
  paco@gmail.com      Paco García · CD Pinto    hace 2 días
  jose@hotmail.es     José Ruiz · Rayo Alcalá   hace 5 días
```

En la terminal, o abriendo una página local en el navegador. Está por decidir.

**Por qué en el ordenador y no dentro de la aplicación.** Se barajaron las dos.
Dentro de la aplicación era viable y seguro —la comprobación la haría una función
`security definer` en Postgres, apoyada en la columna `admin` y en `es_admin()`,
que ya existen, y el navegador no vería ninguna llave—. Se descartó igualmente, y
por un motivo bueno: **si no hay panel en la web pública, no hay superficie que
atacar.** Ni código de administración viajando a todos los visitantes, ni un
punto de entrada que alguien pueda ir probando. Menos superficie es menos
superficie.

**La regla que no se rompe.** La llave `service_role` de Supabase vive en un
archivo del ordenador, fuera del repositorio (`.gitignore`) y fuera de la web.
Nunca dentro de una página, nunca en un commit, nunca pegada en una conversación
—tampoco a quien te esté ayudando a programar—. Quien tiene esa llave tiene la
base de datos entera.

**De dónde salen los datos.** Los correos están en `auth.users`, que no es
accesible desde el navegador ni con la llave pública. Con la `service_role`
desde el ordenador sí se leen. El resto sale de `public.entrenadores`,
`public.ejercicios` (incluida la columna `aperturas`, que se cuenta desde hace
tiempo y no se usa para nada) y `public.reportes`.

**La consulta base, ya probada:**

```sql
select u.email, e.nombre, e.club, u.created_at
from auth.users u
left join public.entrenadores e on e.id = u.id
order by u.created_at desc;
```

**Mientras tanto.** La misma consulta guardada en el SQL Editor de Supabase
(botón *Save*) queda en la barra lateral y se abre con un clic. Resuelve el día
a día sin construir nada.

---

## 2 · La sesión de entrenamiento · HECHO EN PARTE

**Ya está**: la sesión existe como objeto (`pt-sesiones`, una fecha con su
nombre, sus ejercicios en orden y quién vino), tiene su pestaña en Equipo con
diario por meses y detalle del día, se monta a mano o trayendo de la biblioteca,
y saca su hoja para imprimir. Las estadísticas cuentan desde ahí.

**Falta todavía** de lo de abajo: avisar si los minutos no cuadran con el tiempo
disponible, meter el **dibujo de cada ejercicio** en la hoja impresa (hoy va solo
el texto), y **mandar la sesión entera por enlace**.

Y falta **el generador**: proponer una sesión a partir de lo que está sin
trabajar (radar y aviso de 21 días), cuántos han venido, cuántos porteros hay y
dos desplegables de espacio y tiempo. El lector de jugadores del catálogo ya está
medido: 56 de 64 ejercicios dicen cuánta gente necesitan, 8 son «grupo entero»
(circuitos y técnica, donde de verdad da igual), 0 ilegibles.

El espacio ya NO sale del `view`: se mide la huella de las piezas
(`cuantoSitio` en board.js). Salía del encuadre y eso escondía la mitad de la
biblioteca a quien solo tiene medio campo, que en fútbol base es casi todo el
mundo.

**Lo que era, tal cual se habló:**

Hoy la aplicación piensa en ejercicios sueltos. Un entrenador no
entrena ejercicios: entrena **el martes**, que es una lista con un tiempo total.

```
Martes 15 · Alevín A · 75 min
  1. Rondo 4 contra 2 ................ 12 min
  2. Salida de balón bajo presión .... 18 min
  3. Finalización con centro ......... 20 min
  4. Partido condicionado ............ 25 min
```

Encadenar varios ejercicios de la biblioteca en una sesión, en orden, y que la
aplicación:

- sume los minutos y avise si no cuadra con el tiempo disponible;
- saque una **hoja para llevar al campo**: portada con el resumen y una página
  por tarea, con su dibujo y su ficha;
- deje mandar **la sesión entera por enlace**, igual que ahora se manda una
  jugada (`app/enlace.js` ya hace el trabajo; sería envolver una lista en vez de
  un documento).

**Por qué esta antes que otras.** Las piezas están todas: los ejercicios ya
tienen duración, ficha y dibujo, y la hoja imprimible existe. Es montaje, no
maquinaria nueva. Y es lo único que da un motivo para abrir la aplicación **cada
semana** en vez del día suelto en que hace falta dibujar algo.

---

## 3 · Cargar un entrenamiento desde una foto

**Qué es.** El entrenador tiene la sesión escrita —en una libreta, en una hoja
que le han pasado, en la pizarra del vestuario—. Le hace una foto, la adjunta, y
la aplicación la convierte en ejercicios.

**Por qué no está hecho.** Leer una foto necesita reconocer el texto, y esta
aplicación no tiene dependencias, no tiene compilador y funciona sin internet.
Las tres salidas posibles, medidas:

| | Peso | Coste | Sin conexión | Sale del dispositivo | Letra a mano |
|---|---|---|---|---|---|
| OCR en el navegador (Tesseract) | +15 MB sobre 630 KB | 0 | sí | no | mal |
| Servidor con modelo de visión | 0 | por foto | **no** | **sí** | bien |
| Que lo haga el sistema y se pegue | 0 | 0 | sí | no | según el sistema |

**El dato que decide.** La tercera parecía la buena hasta que se dijo en voz
alta: *«yo tengo iPhone, pero mucha gente no»*. En iOS el propio Fotos te da el
texto en dos toques; en Android y en escritorio existe (Google Lens, Recortes de
Windows, Vista Previa) pero con pasos distintos en cada sitio. Apoyarse en eso
es hacer una función de primera para unos y de tercera para otros.

**Lo que queda decidido, entonces:** si algún día se hace, se hace **en el
servidor**, para que sea igual en todos los dispositivos. Y eso arrastra tres
cosas que hay que aceptar a la vez, no de una en una:

1. La foto **sale del dispositivo**. Una pizarra de entrenamiento puede llevar
   nombres de críos escritos. La frase «nada sale de aquí» dejaría de ser
   verdad para esta función y habría que decirlo donde se use, no en una
   política que nadie lee.
2. Cuesta dinero por foto, así que hace falta un límite por cuenta.
3. La llave del modelo vive en una función de Supabase, **nunca en el
   navegador**. Misma regla que la del panel de administración.

**Y la mitad que sí se puede hacer sin nada de eso:** el **analizador de
texto** —convertir un texto suelto («1. Rondo 4v2 … 12'») en ejercicios con su
título, su momento y su duración—. Hace falta igual en las tres salidas, vale
para texto que llega por WhatsApp, por correo o de un PDF, y funciona en
cualquier dispositivo. Es por donde hay que empezar el día que se retome.

---

## 4 · Dos arreglos pequeños de la biblioteca

- **Favoritos.** Marcar un ejercicio y tenerlo a mano. Cuando la biblioteca
  común crezca, el problema será encontrar el tuyo.
- **Ordenar por los más usados.** La columna `aperturas` se lleva contando desde
  el principio y no se usa para nada. Ordenar por ahí hace que lo bueno suba
  solo. Es media hora.

---

## 5 · Los cabos que deja el consentimiento

La casilla, la página de privacidad y el borrado de cuenta ya están. Lo que
queda no es relleno: son tres sitios donde hoy la cosa no se cierra del todo.

- **El correo de contacto · HECHO.** Es `samuaces@gmail.com`, publicado el
  15/09/2026. Había un comentario en el código pidiendo que se rellenara antes
  de publicar; un comentario no impide publicar nada, así que ahora lo impide
  una comprobación de `tests/ids.mjs`.

- **Volver a preguntar cuando cambien las condiciones · A MEDIAS.** Ya existe
  la puerta: `acepto_las_condiciones()` en el servidor, sin parámetros y con la
  versión puesta por `condiciones_vigentes()`, y `PTNube.acepta()` para
  llamarla. Se usa al encender la sincronización, que es donde de verdad hacía
  falta: quien la enciende acepta el texto nuevo, no el que aceptó en su día.

  Lo que sigue faltando es lo general: nadie compara al entrar `yo.acepto` con
  `PTNube.condiciones` y vuelve a enseñar la casilla si no coinciden. Con la
  función ya hecha, es mirar eso al arrancar y poco más.

  Un caso concreto de lo mismo: la aplicación se guarda entera en el
  dispositivo (service worker), así que alguien puede estar viendo el texto de
  hace dos versiones mientras el servidor anota la de ahora. Con la comparación
  de arriba hecha, se arregla solo.

- **Poder pedir revisión de un ejercicio escondido.** Al quitarle al autor el
  permiso de escribir en `oculto` —que era un agujero de verdad: tres
  denuncias escondían el ejercicio y el autor lo volvía a destapar—, se quedó
  sin ninguna salida. Tres cuentas de usar y tirar esconden lo que quieran y
  el autor no tiene a quién decírselo. Falta un `pide_revision()` que apunte
  la petición para que un administrador la mire.

---

## 6 · Lo que encontró la auditoría del 15/09/2026

Barrido funcional de la aplicación entera siguiendo la lista de regresión del
encargo. Cero fallos críticos y cero errores de consola. Esto es lo que salió,
por orden de lo que más duele.

### El análisis pierde trabajo sin decirlo · ALTO

Un ejercicio sin «momento del juego» cuenta en el resumen y en los minutos de
cada jugador, pero no sale en el reparto por momentos. Y sus minutos siguen en
el denominador del porcentaje.

Medido: 25 min de «Ataque organizado» + 20 min sin etiquetar enseña una sola
barra que dice **56 %**. El 44 % restante no aparece en ninguna parte y nada lo
explica. Sin etiquetar nada, la pantalla dice «Todavía no hay nada que contar
aquí» habiendo entrenado hora y media.

El reparto es deliberado —`equipo.js:718` lo razona— pero el silencio no. Y pega
justo en el núcleo del producto: si las cuentas no son fiables, la recomendación
de «¿qué toca hoy?» tampoco.

  - `app/equipo.js:710-722` — `total` suma todo, `porMomento` no
  - `app/board.js:4125` — `{ total: d.minutos }` es el denominador

Lo que hace falta no es solo arreglar la cuenta: es que el «momento» deje de ser
un campo opcional sin explicar. Sugerirlo al guardar, avisar cuando falta, y
poder etiquetar después lo que ya quedó sin etiquetar.

### Dos guardados no avisan si el almacén está lleno · MEDIO

Casi todos los caminos comprueban lo que devuelve el guardado y avisan. Dos no:

  - `app/board.js:5598` y `:5602` — asistencia con «Todos» / «Ninguno»
  - `app/board.js:5697` y `:5701` — el nombre de la sesión

Con el almacén lleno el cambio se deshace solo al repintar, sin decir por qué.

### La página de privacidad no abre sin conexión · BAJO

No está en `SHELL` de `app/sw.js`. Es una línea: `'../privacidad.html'`.

### Y lo que ya estaba apuntado arriba

La apelación de moderación y el re-consentimiento al cambiar las condiciones
siguen pendientes; la auditoría los confirma y no añade nada nuevo.

### Riesgos, que no son fallos

  - **El almacén local es el único que hay.** Pierdes el móvil y se va la
    plantilla, la asistencia y las sesiones. Está escrito en la página de
    privacidad, pero es lo que más caro sale si le pasa a alguien a media
    temporada.
  - **`board.js` son 6.252 líneas y 322 funciones en un archivo.** Funciona y
    está comentado, pero es donde aparecerán las regresiones de cualquier fase
    grande. Conviene partirlo ANTES de las fases grandes, no después.
  - **La aplicación se puede empotrar en otra página.** `frame-ancestors` no se
    puede poner desde el HTML y GitHub Pages no manda cabeceras. Se arregla
    cambiando de alojamiento, no con código.

---

## Fuera de la aplicación

- **Supabase · URL Configuration.** Poner `https://klym.xyz/app/` como *Site URL*
  y añadirla a *Redirect URLs*. Sin eso, el correo de recuperar contraseña se
  manda pero el enlace devuelve a donde no toca. Es lo único pendiente que
  bloquea una función ya construida.
- **Search Console.** Propiedad de dominio `klym.xyz` verificada por TXT y
  sitemap enviado el 11/09/2026. Quedó en «No se ha podido obtener» porque
  Google todavía no lo había leído; hay que volver a mirarlo a los pocos días y
  esperar ver «Correcto» y 2 páginas.
