-- Lo mínimo de Supabase para poder ejecutar el esquema de verdad en un
-- Postgres pelado: el esquema auth, la tabla de usuarios, auth.uid() leyendo
-- el «usuario actual» de una variable de sesión, y los dos roles.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

-- Quien ejecuta las pruebas no puede ser superusuario: los superusuarios se
-- saltan las reglas por fila y no probaríamos nada.
do $$ begin create role probador login nosuperuser; exception when duplicate_object then null; end $$;
grant anon, authenticated to probador;
