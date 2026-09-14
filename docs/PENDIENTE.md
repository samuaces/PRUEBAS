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
medido: 21 de 24 ejercicios dicen cuánta gente necesitan, 3 son «los que haya»,
0 ilegibles; el espacio sale del `view` de cada uno (area ⊂ half ⊂ full).

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

## Fuera de la aplicación

- **Supabase · URL Configuration.** Poner `https://klym.xyz/app/` como *Site URL*
  y añadirla a *Redirect URLs*. Sin eso, el correo de recuperar contraseña se
  manda pero el enlace devuelve a donde no toca. Es lo único pendiente que
  bloquea una función ya construida.
- **Search Console.** Propiedad de dominio `klym.xyz` verificada por TXT y
  sitemap enviado el 11/09/2026. Quedó en «No se ha podido obtener» porque
  Google todavía no lo había leído; hay que volver a mirarlo a los pocos días y
  esperar ver «Correcto» y 2 páginas.
