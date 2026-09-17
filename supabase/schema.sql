-- ============================================================================
-- Pizarra Táctica · biblioteca compartida
--
-- Todo el servidor cabe aquí: tres tablas, sus permisos y cuatro disparadores.
-- Se pega entero en el editor SQL de Supabase y se ejecuta una sola vez.
-- Volver a ejecutarlo no rompe nada: está escrito para poder repetirse.
--
-- La idea: cada entrenador entra con su correo, guarda sus ejercicios y decide
-- cuáles comparte. Los compartidos los ve todo el mundo, también quien no
-- tiene cuenta. Nadie puede tocar los de otro.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;   -- para buscar texto suelto

-- ---------------------------------------------------------------------------
-- Entrenadores: el perfil público de cada cuenta.
-- El correo no vive aquí, se queda en auth.users, que nadie puede leer.
-- ---------------------------------------------------------------------------
create table if not exists public.entrenadores (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text not null default 'Entrenador' check (char_length(nombre) between 1 and 60),
  club    text not null default ''           check (char_length(club) <= 60),
  admin   boolean not null default false,
  creado  timestamptz not null default now(),

  /* Qué versión de las condiciones aceptó, y cuándo.

     La versión importa tanto como la fecha: dentro de dos años, «aceptó las
     condiciones» no dice nada si no se sabe cuáles eran. Se guarda la etiqueta
     del texto que tenía delante.

     La fecha la pone el servidor. Si la mandara el navegador, la fecha de un
     consentimiento sería lo que el cliente quisiera escribir, y entonces no es
     un registro de nada. */
  acepto     text        not null default ''  check (char_length(acepto) <= 20),
  acepto_en  timestamptz
);

-- Para las cuentas que ya existían antes de que esto se pidiera.
alter table public.entrenadores add column if not exists acepto    text not null default '';
alter table public.entrenadores add column if not exists acepto_en timestamptz;

comment on table public.entrenadores is
  'Perfil público de cada cuenta. El correo no se expone nunca.';

-- ---------------------------------------------------------------------------
-- Ejercicios: la pizarra entera en doc, y aparte las columnas por las que se
-- filtra, para no tener que descargar la biblioteca completa para buscar.
-- ---------------------------------------------------------------------------
create table if not exists public.ejercicios (
  id           uuid primary key default gen_random_uuid(),
  autor        uuid references public.entrenadores(id) on delete cascade,
  publicado    boolean not null default false,
  oculto       boolean not null default false,

  titulo       text not null check (char_length(titulo) between 1 and 120),
  pitch        text not null check (pitch in ('f11', 'f7', 'futsal')),
  vista        text not null default 'full' check (vista in ('full', 'half', 'area', 'blank')),
  momento      text not null default '' check (char_length(momento) <= 40),
  categoria    text not null default '' check (char_length(categoria) <= 40),
  minutos      int check (minutos is null or minutos between 1 and 240),
  objetivo     text not null default '' check (char_length(objetivo) <= 400),

  ficha        jsonb not null default '{}'::jsonb,
  doc          jsonb not null,
  busca        text not null default '',

  aperturas    int not null default 0,
  creado       timestamptz not null default now(),
  actualizado  timestamptz not null default now(),

  -- Una pizarra normal no llega a 60 KB. Medio mega es de sobra y evita que
  -- una importación rara llene la base.
  constraint doc_razonable check (octet_length(doc::text) <= 512000)
);

comment on table public.ejercicios is
  'Un ejercicio con su pizarra. publicado = lo ve todo el mundo.';

-- Índices para los filtros que usa la biblioteca.
create index if not exists ejercicios_publicos_idx
  on public.ejercicios (pitch, creado desc) where publicado and not oculto;
create index if not exists ejercicios_autor_idx    on public.ejercicios (autor, creado desc);
create index if not exists ejercicios_momento_idx  on public.ejercicios (momento);
create index if not exists ejercicios_busca_idx    on public.ejercicios using gin (busca gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Reportes: para que la biblioteca se cuide sola.
-- Con tres reportes distintos el ejercicio se esconde y deja de aparecer.
-- ---------------------------------------------------------------------------
create table if not exists public.reportes (
  id         uuid primary key default gen_random_uuid(),
  ejercicio  uuid not null references public.ejercicios(id) on delete cascade,
  quien      uuid not null references public.entrenadores(id) on delete cascade,
  motivo     text not null default '' check (char_length(motivo) <= 300),
  creado     timestamptz not null default now(),
  unique (ejercicio, quien)
);

-- ---------------------------------------------------------------------------
-- Cofres: los datos del equipo de cada entrenador, para que su cuenta sea la
-- misma en el móvil y en el ordenador.
--
-- ESTA TABLA NO SE PUEDE LEER. Ni desde aquí, ni con la clave secreta, ni con
-- acceso a la base de datos. «bloque» sale del navegador ya cifrado con una
-- clave que sale de la contraseña de la persona y que nunca se sube (ver
-- app/cofre.js). Lo que hay guardado aquí son bytes sin significado.
--
-- Eso no es un adorno: dentro van nombres de críos y quién faltó a entrenar.
-- Con la tabla en claro, cualquier fallo de permisos —o cualquiera con acceso
-- al servidor— sería una lista de menores. Cifrado, es ruido.
--
-- Una fila por cuenta. Una temporada cargada mide unos 150 KB cifrada, así que
-- una fila sobra: no hace falta trocear nada.
-- ---------------------------------------------------------------------------
create table if not exists public.cofres (
  id      uuid primary key references auth.users(id) on delete cascade,

  -- La sal y la clave maestra envuelta. Ninguna de las dos es secreta por sí
  -- sola: sin la contraseña no abren nada.
  sal     text not null check (char_length(sal) between 16 and 64),
  maestra text not null check (char_length(maestra) <= 512),

  -- Los datos, cifrados. El tope es holgado a propósito —una temporada muy
  -- cargada no llega a 200 KB— pero tiene que existir: sin él, una fila puede
  -- crecer hasta donde quiera quien la escriba.
  bloque  text not null default '' check (octet_length(bloque) <= 4194304),

  /* El número de versión es lo que evita que dos dispositivos se pisen.

     Sin él: el móvil se baja la versión 5, el ordenador también, los dos
     fusionan con lo suyo y los dos suben. El segundo pisa al primero y lo que
     el primero había añadido desaparece, aunque la fusión estuviera perfecta.

     Con él, quien sube dice contra qué versión fusionó. Si ya no es esa, el
     servidor no escribe nada, y el que llegó tarde se baja lo nuevo, vuelve a
     fusionar y lo intenta otra vez. Lo pone el servidor, no el navegador. */
  version     integer     not null default 0,
  actualizado timestamptz not null default now()
);

comment on table public.cofres is
  'Datos del equipo, cifrados en el dispositivo. El servidor no puede leerlos.';

-- ============================================================================
-- Disparadores
-- ============================================================================

/* La versión y la hora las pone el servidor. Si las mandara el navegador, un
   dispositivo con el reloj mal —o con una versión inventada— podría saltarse
   la comprobación de arriba y pisar lo de otro. */
create or replace function public.sella_cofre()
returns trigger language plpgsql as $$
begin
  new.version := coalesce(old.version, 0) + 1;
  new.actualizado := now();
  return new;
end $$;

drop trigger if exists sella_cofre on public.cofres;
create trigger sella_cofre before insert or update on public.cofres
  for each row execute function public.sella_cofre();

/* Qué condiciones están publicadas ahora mismo. Vive aquí, en el servidor, y
   no en el navegador: el navegador dice si acepta o no, pero QUÉ acepta no lo
   elige él. Si lo eligiera, cualquiera podría anotarse una versión inventada
   —una futura, por ejemplo— y no volver a ver nunca la pregunta.

   Al cambiar el texto de privacidad.html se cambia también esta cadena, y
   entonces lo anotado deja de coincidir y se vuelve a preguntar. */
create or replace function public.condiciones_vigentes()
returns text language sql immutable as $$ select '2026-09-b'::text $$;
grant execute on function public.condiciones_vigentes() to anon, authenticated;

/* Al crear la cuenta se crea el perfil, para que publicar no falle nunca.

   Y se deja constancia de qué condiciones aceptó. El sí viene en los datos del
   registro, no en una llamada aparte de después: si fuera aparte, entre una
   cosa y la otra cabe una cuenta creada sin consentimiento —se corta la red, se
   cierra la pestaña— y ese es justo el caso que no puede quedar a medias. */
create or replace function public.crea_entrenador()
returns trigger language plpgsql security definer set search_path = public as $$
declare dijo_si boolean;
begin
  -- Del navegador se lee solo el sí o el no. Cualquier cosa que no sea vacía
  -- cuenta como sí; la versión la pone el servidor.
  dijo_si := coalesce(new.raw_user_meta_data->>'acepto', '') <> '';
  insert into public.entrenadores (id, nombre, acepto, acepto_en)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''),
                           initcap(split_part(new.email, '@', 1))),
          case when dijo_si then public.condiciones_vigentes() else '' end,
          -- La hora la pone el servidor, nunca el navegador.
          case when dijo_si then now() else null end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crea_entrenador();

-- El texto por el que se busca se arma solo, con la ficha entera dentro.
create or replace function public.arma_busca()
returns trigger language plpgsql as $$
begin
  new.busca := lower(
    coalesce(new.titulo, '') || ' ' || coalesce(new.objetivo, '') || ' ' ||
    coalesce(new.momento, '') || ' ' || coalesce(new.categoria, '') || ' ' ||
    coalesce((select string_agg(value, ' ')
              from jsonb_each_text(new.ficha) where value <> ''), ''));
  new.actualizado := now();
  return new;
end $$;

drop trigger if exists al_guardar_ejercicio on public.ejercicios;
create trigger al_guardar_ejercicio
  before insert or update on public.ejercicios
  for each row execute function public.arma_busca();

-- Tres reportes de tres personas distintas y el ejercicio deja de verse.
create or replace function public.revisa_reportes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reportes where ejercicio = new.ejercicio) >= 3 then
    update public.ejercicios set oculto = true where id = new.ejercicio;
  end if;
  return new;
end $$;

drop trigger if exists al_reportar on public.reportes;
create trigger al_reportar
  after insert on public.reportes
  for each row execute function public.revisa_reportes();

-- ¿Quien pregunta manda aquí? Se consulta en las reglas de más abajo.
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.entrenadores where id = auth.uid()), false);
$$;

/* Borrar la cuenta, de verdad.

   Borrar el usuario de auth arrastra en cascada el perfil, y el perfil arrastra
   los ejercicios: no queda nada. Eso no se puede hacer desde el navegador —la
   clave pública no tiene permiso sobre auth.users, y menos mal— así que lo hace
   una función que se ejecuta con los permisos de quien la creó.

   Solo puede borrarse uno a sí mismo: no recibe ningún parámetro, y la fila que
   toca la decide auth.uid(), que sale del testigo y no de lo que mande nadie.
   Sin sesión no hace nada.

   Lo que se sube a la biblioteca común se va con la cuenta. Es lo que espera
   quien le da a «borrar mi cuenta», y decirle que «lo tuyo se queda publicado
   para siempre» sería no haber entendido lo que ha pedido. */
create or replace function public.borra_mi_cuenta()
returns void language plpgsql security definer set search_path = public, auth as $$
declare quien uuid := auth.uid();
begin
  if quien is null then
    raise exception 'Hay que haber entrado para borrar la cuenta';
  end if;
  delete from auth.users where id = quien;
end $$;

/* Volver a aceptar cuando las condiciones cambian.

   Hasta ahora el consentimiento se anotaba solo al registrarse y no había
   manera de volver a pedirlo: cambiar el texto dejaba a todo el mundo con una
   versión aceptada que ya no era la publicada, y el registro dejaba de valer
   para lo único que sirve.

   No lleva parámetros, igual que borra_mi_cuenta(): la versión la pone
   condiciones_vigentes() y la fila la decide auth.uid(). Si el navegador
   pudiera decir QUÉ acepta, cualquiera se anotaría una versión futura y no
   volvería a ver la pregunta nunca. */
create or replace function public.acepto_las_condiciones()
returns text language plpgsql security definer set search_path = public as $$
declare quien uuid := auth.uid(); v text := public.condiciones_vigentes();
begin
  if quien is null then
    raise exception 'Hay que haber entrado para aceptar las condiciones';
  end if;
  update public.entrenadores set acepto = v, acepto_en = now() where id = quien;
  return v;
end $$;

-- Contar aperturas sin dejar que nadie escriba en la fila de otro.
create or replace function public.suma_apertura(ej uuid)
returns void language sql security definer set search_path = public as $$
  update public.ejercicios set aperturas = aperturas + 1
   where id = ej and publicado and not oculto;
$$;

-- ============================================================================
-- Permisos por fila
-- Sin esto cualquiera con la clave pública podría leerlo y borrarlo todo.
-- ============================================================================

alter table public.entrenadores enable row level security;
alter table public.ejercicios   enable row level security;
alter table public.reportes     enable row level security;
alter table public.cofres       enable row level security;

-- --- Entrenadores ---------------------------------------------------------
drop policy if exists "el perfil es público"   on public.entrenadores;
drop policy if exists "creo mi perfil"         on public.entrenadores;
drop policy if exists "edito solo el mío"      on public.entrenadores;

-- El nombre se ve porque aparece firmando cada ejercicio.
create policy "el perfil es público" on public.entrenadores
  for select using (true);
create policy "creo mi perfil" on public.entrenadores
  for insert with check (id = auth.uid());
-- Nadie se nombra administrador a sí mismo: la columna admin no se puede
-- escribir desde la aplicación (ver los permisos por columna del final).
create policy "edito solo el mío" on public.entrenadores
  for update using (id = auth.uid()) with check (id = auth.uid());

-- --- Ejercicios -----------------------------------------------------------
drop policy if exists "la biblioteca es pública" on public.ejercicios;
drop policy if exists "publico los míos"         on public.ejercicios;
drop policy if exists "edito los míos"           on public.ejercicios;
drop policy if exists "borro los míos"           on public.ejercicios;
drop policy if exists "el admin modera"          on public.ejercicios;

-- Lo compartido lo ve cualquiera, con cuenta o sin ella. Lo tuyo, solo tú.
create policy "la biblioteca es pública" on public.ejercicios
  for select using ((publicado and not oculto) or autor = auth.uid() or public.es_admin());
create policy "publico los míos" on public.ejercicios
  for insert with check (autor = auth.uid());
create policy "edito los míos" on public.ejercicios
  for update using (autor = auth.uid()) with check (autor = auth.uid());
create policy "borro los míos" on public.ejercicios
  for delete using (autor = auth.uid());
create policy "el admin modera" on public.ejercicios
  for update using (public.es_admin());

-- --- Reportes -------------------------------------------------------------
drop policy if exists "reporto una vez"   on public.reportes;
drop policy if exists "los ve el admin"   on public.reportes;

create policy "reporto una vez" on public.reportes
  for insert with check (quien = auth.uid());
create policy "los ve el admin" on public.reportes
  for select using (public.es_admin() or quien = auth.uid());

-- --- Cofres ---------------------------------------------------------------
/* El único sitio de todo esto donde el administrador tampoco entra.

   En las otras tablas «es_admin()» tiene sentido: hay que poder esconder un
   ejercicio denunciado. Aquí no lo tiene, porque no hay nada que moderar —son
   bytes cifrados— y porque dejar la puerta abierta «por si acaso» es lo que
   convierte una promesa en una intención. Aunque entrara, no podría leerlo;
   pero sí podría borrarlo, y eso es la temporada de alguien. */
drop policy if exists "mi cofre lo veo yo"    on public.cofres;
drop policy if exists "creo mi cofre"         on public.cofres;
drop policy if exists "escribo en el mío"     on public.cofres;
drop policy if exists "borro el mío"          on public.cofres;

create policy "mi cofre lo veo yo" on public.cofres
  for select using (id = auth.uid());
create policy "creo mi cofre" on public.cofres
  for insert with check (id = auth.uid());
create policy "escribo en el mío" on public.cofres
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "borro el mío" on public.cofres
  for delete using (id = auth.uid());

-- ============================================================================
-- Quién puede llamar a qué
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.entrenadores, public.ejercicios to anon, authenticated;
grant insert on public.entrenadores to authenticated;
grant update (nombre, club) on public.entrenadores to authenticated;   -- admin no
grant insert, delete on public.ejercicios to authenticated;
/* Por columnas, igual que con «admin» arriba, y por el mismo motivo.

   Con un «grant update» a secas, el autor podía escribir en CUALQUIER columna
   de su fila. Y dos de ellas no son suyas:

     oculto     lo pone a true el disparador cuando tres personas distintas
                denuncian el ejercicio. Si el autor puede volver a ponerlo a
                false, la moderación no sirve para nada: publica, lo ocultan,
                lo destapa, y vuelta a empezar.
     aperturas  es el contador de cuánto se abre. Escribiéndolo a mano, uno se
                pone el suyo el primero de la lista.

   Ninguna de las dos se toca desde la aplicación. Ocultar es cosa del
   disparador y del administrador; contar, de suma_apertura(). */
grant update (titulo, pitch, vista, momento, categoria, minutos, objetivo,
              ficha, doc, publicado)
  on public.ejercicios to authenticated;   -- oculto y aperturas, no
/* «busca» y «actualizado» tampoco están, y no hacen falta: los escribe el
   disparador arma_busca(), y un disparador BEFORE puede tocar NEW sin que se
   le miren los permisos por columna, que se comprueban contra lo que pide la
   sentencia. Lo comprueba supabase/permisos.test.sql. */
grant insert, select on public.reportes to authenticated;
/* El cofre: solo quien ha entrado, y nunca «anon». Y por columnas, igual que
   arriba: «version» y «actualizado» las escribe el disparador, no el
   navegador. Si el navegador pudiera escribir la versión, la comprobación que
   evita que dos dispositivos se pisen no valdría nada, porque el que llega
   tarde podría decir que iba primero. */
grant select, insert, delete on public.cofres to authenticated;
grant update (sal, maestra, bloque) on public.cofres to authenticated;
grant execute on function public.suma_apertura(uuid) to anon, authenticated;
-- Borrarse a sí mismo. No lleva parámetros: la fila la decide auth.uid().
grant execute on function public.borra_mi_cuenta() to authenticated;
revoke execute on function public.borra_mi_cuenta() from anon, public;
-- Volver a aceptar. Tampoco lleva parámetros, y por el mismo motivo.
grant execute on function public.acepto_las_condiciones() to authenticated;
revoke execute on function public.acepto_las_condiciones() from anon, public;

-- ============================================================================
-- Para nombrarte administrador (una vez, con tu cuenta ya creada):
--   update public.entrenadores set admin = true where id = (
--     select id from auth.users where email = 'tucorreo@ejemplo.com');
-- Y para esconder un ejercicio que no debería estar:
--   update public.ejercicios set oculto = true where id = '…';
-- ============================================================================
