# La biblioteca común

Esto es todo el servidor de la Pizarra Táctica. Son tres tablas en Supabase y
dos líneas de configuración en la aplicación. Se monta una vez y ya no hay que
volver a tocarlo: a partir de ahí los entrenadores entran con su correo, guardan
sus ejercicios y comparten los que quieran.

Mientras `app/config.js` esté en blanco, la pizarra funciona exactamente como
antes —sus diez ejercicios y lo que guardes en el navegador— y no aparece nada
de cuentas por ninguna parte. No hay estado intermedio roto.

---

## Montarlo (una vez, unos diez minutos)

### 1. Crear el proyecto

En [supabase.com](https://supabase.com) → **New project**.

- **Name**: `pizarra-tactica`
- **Database password**: la que quieras; no hace falta recordarla para esto.
- **Region**: la más cercana (para España, `eu-west-3` o `eu-central-1`).
- **Plan**: el gratuito llega de sobra. Son 500 MB de base de datos y un
  ejercicio ocupa unos 3 KB: caben más de cien mil.

Tarda un par de minutos en levantarse.

### 2. Crear las tablas

Panel del proyecto → **SQL Editor** → **New query**. Pega entero el contenido de
[`schema.sql`](schema.sql) y dale a **Run**.

Debe terminar sin errores. Crea las tablas `entrenadores`, `ejercicios` y
`reportes`, sus permisos por fila y los disparadores. Se puede volver a ejecutar
las veces que haga falta sin romper nada.

### 3. Configurar el correo de entrada

**Authentication** → **Providers** → **Email**:

- **Enable Email provider**: encendido.
- **Confirm email**: encendido.
- **Secure email change**: encendido.

**Authentication** → **URL Configuration**:

- **Site URL**: `https://samuaces.github.io/PRUEBAS/pizarra/app/`
- **Redirect URLs**: añade esa misma, y `http://localhost:8000/app/` si vas a
  probar en local.

Sin esto, el enlace del correo devuelve al sitio equivocado.

> El correo que manda Supabase de serie tiene un límite bajo (unos pocos al día)
> y a veces cae en spam. Va bien para arrancar y para probarlo. Cuando entren
> entrenadores de verdad, en **Authentication → Emails → SMTP Settings** se pone
> un proveedor propio (Resend, Brevo, Postmark…). Es rellenar cinco casillas.

### 4. Pegar las dos claves

**Project Settings** → **API**. Copia:

- **Project URL** → va en `url`
- **anon / publishable key** (la larga) → va en `key`

Y ponlas en [`app/config.js`](../app/config.js):

```js
window.PT_NUBE = {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  key: 'eyJhbGciOi…'
};
```

Esa clave es pública a propósito: se ve en el navegador de cualquiera y Supabase
cuenta con ello. Lo que protege los datos son las reglas por fila del paso 2, no
el secreto de la clave.

**La clave `service_role` no se pone aquí ni en ningún sitio del navegador.** Esa
se salta todos los permisos.

### 5. Nombrarte administrador

Entra una vez en la aplicación con tu correo, y luego en el **SQL Editor**:

```sql
update public.entrenadores set admin = true
 where id = (select id from auth.users where email = 'tucorreo@ejemplo.com');
```

Con eso puedes esconder cualquier ejercicio que no debería estar:

```sql
update public.ejercicios set oculto = true where id = '…';
```

---

## Cómo queda

| | Sin cuenta | Con cuenta |
|---|---|---|
| Usar la pizarra | sí | sí |
| Ver la biblioteca común | sí | sí |
| Guardar en este dispositivo | sí | sí |
| Compartir ejercicios | no | sí |
| Verlos desde otro dispositivo | no | sí |

- Los ejercicios que sube un entrenador son **suyos y privados** hasta que le da
  a compartir. Nadie más puede leerlos, editarlos ni borrarlos: lo impide la
  base de datos, no la aplicación.
- Lo compartido lo ve todo el mundo, con o sin cuenta, firmado con el nombre y
  el club de quien lo hizo. Quien lo subió puede retirarlo o borrarlo cuando
  quiera.
- El correo de cada uno **no se expone nunca**: vive en `auth.users`, que la
  aplicación no puede leer. Lo público es el nombre y el club.
- Con **tres reportes de tres personas distintas** un ejercicio se esconde solo.
  No hace falta que nadie esté pendiente.

## Lo que cuesta

El plan gratuito de Supabase da 500 MB de base de datos, 50.000 usuarios activos
al mes y 5 GB de tráfico. Para hacerse una idea:

- Un ejercicio con su pizarra y su ficha ocupa **unos 3 KB**.
- 500 MB son del orden de **150.000 ejercicios**.
- Abrir la biblioteca se trae como mucho 60 ejercicios: unos 180 KB, y eso
  comprimido baja bastante.

Lo único que hay que vigilar es que los proyectos gratuitos **se pausan si nadie
entra en una semana**. Se despiertan desde el panel con un clic, pero si esto va
a estar en uso de verdad conviene el plan de pago (25 $/mes) para que no pase.

## Si algo falla

**«No se ha podido enviar» al pedir el enlace.** El proveedor de correo está
apagado (paso 3) o se ha pasado el límite diario del correo de Supabase.

**El enlace del correo lleva a otro sitio.** Falta la dirección en *URL
Configuration* (paso 3).

**«new row violates row-level security policy» al compartir.** El `schema.sql`
no se ejecutó entero, o se ejecutó antes de crear la cuenta. Vuelve a ejecutarlo.

**La biblioteca general sale vacía y no da error.** Todavía no ha compartido
nadie: los diez de la aplicación siguen saliendo igual.

**Nada de cuentas aparece en la aplicación.** `app/config.js` sigue en blanco, o
la URL no empieza por `https://`.
