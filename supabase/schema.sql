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
  creado  timestamptz not null default now()
);

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

-- ============================================================================
-- Disparadores
-- ============================================================================

-- Al crear la cuenta se crea el perfil, para que publicar no falle nunca.
create or replace function public.crea_entrenador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.entrenadores (id, nombre)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''),
                           initcap(split_part(new.email, '@', 1))))
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

-- ============================================================================
-- Quién puede llamar a qué
-- ============================================================================
grant usage on schema public to anon, authenticated;
grant select on public.entrenadores, public.ejercicios to anon, authenticated;
grant insert on public.entrenadores to authenticated;
grant update (nombre, club) on public.entrenadores to authenticated;   -- admin no
grant insert, update, delete on public.ejercicios to authenticated;
grant insert, select on public.reportes to authenticated;
grant execute on function public.suma_apertura(uuid) to anon, authenticated;

-- ============================================================================
-- Para nombrarte administrador (una vez, con tu cuenta ya creada):
--   update public.entrenadores set admin = true where id = (
--     select id from auth.users where email = 'tucorreo@ejemplo.com');
-- Y para esconder un ejercicio que no debería estar:
--   update public.ejercicios set oculto = true where id = '…';
-- ============================================================================
