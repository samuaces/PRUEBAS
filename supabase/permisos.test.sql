-- Pruebas de los permisos por fila, contra un Postgres de verdad.
-- Lo que se comprueba no es que la aplicación se porte bien, sino que la base
-- de datos no deje hacerlo mal aunque la aplicación quiera.
--
-- Se lanzan con  ./supabase/probar.sh  (no hace falta tener Supabase).

\set ON_ERROR_STOP on
\pset pager off
\o /dev/null
set client_min_messages = notice;

create or replace function pg_temp.comprueba(nombre text, cond boolean) returns void
language plpgsql as $$
begin
  if cond then raise notice 'PASA  %', nombre;
  else raise exception 'FALLA %', nombre; end if;
end $$;

-- ---- dos entrenadores, creados como los crearía Supabase ----
delete from auth.users;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@club.com',  '{"nombre":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'bru@club.com',  '{}'),
  ('33333333-3333-3333-3333-333333333333', 'caz@club.com',  '{}'),
  ('44444444-4444-4444-4444-444444444444', 'dan@club.com',  '{}');

select pg_temp.comprueba('al crear la cuenta se crea el perfil solo',
  (select count(*) from public.entrenadores) = 4);
select pg_temp.comprueba('el perfil toma el nombre del registro',
  (select nombre from public.entrenadores where id = '11111111-1111-1111-1111-111111111111') = 'Ana');
select pg_temp.comprueba('y si no lo hay, lo saca del correo',
  (select nombre from public.entrenadores where id = '22222222-2222-2222-2222-222222222222') = 'Bru');

-- ---- Ana sube un ejercicio y no lo comparte ----
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.ejercicios (autor, titulo, pitch, ficha, doc, publicado)
values ('11111111-1111-1111-1111-111111111111', 'Rondo de Ana', 'f11',
        '{"material":"4 chinos","objetivo":"circular"}'::jsonb, '{"frames":[]}'::jsonb, false);

select pg_temp.comprueba('el texto de búsqueda se arma solo con la ficha dentro',
  (select busca from public.ejercicios where titulo = 'Rondo de Ana') like '%chinos%');

select pg_temp.comprueba('Ana ve lo suyo sin compartir',
  (select count(*) from public.ejercicios) = 1);
select set_config('prueba.ejercicio', (select id::text from public.ejercicios), false);

-- ---- Bruno no debe verlo ----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.comprueba('otro entrenador NO ve lo que no se ha compartido',
  (select count(*) from public.ejercicios) = 0);

-- ---- ni quien no tiene cuenta ----
reset role;
set role anon;
set request.jwt.claim.sub = '';
select pg_temp.comprueba('sin cuenta tampoco se ve lo no compartido',
  (select count(*) from public.ejercicios) = 0);

-- ---- Ana lo comparte ----
reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.ejercicios set publicado = true where titulo = 'Rondo de Ana';

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.comprueba('compartido, lo ve otro entrenador',
  (select count(*) from public.ejercicios) = 1);
reset role; set role anon; set request.jwt.claim.sub = '';
select pg_temp.comprueba('y lo ve cualquiera, con cuenta o sin ella',
  (select count(*) from public.ejercicios) = 1);

-- ---- Bruno no puede tocar lo de Ana ----
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.ejercicios set titulo = 'Secuestrado' where titulo = 'Rondo de Ana';
select pg_temp.comprueba('otro entrenador no puede editar tu ejercicio',
  (select count(*) from public.ejercicios where titulo = 'Rondo de Ana') = 1);

delete from public.ejercicios where titulo = 'Rondo de Ana';
select pg_temp.comprueba('otro entrenador no puede borrar tu ejercicio',
  (select count(*) from public.ejercicios where titulo = 'Rondo de Ana') = 1);

-- ---- ni firmar con el nombre de Ana ----
do $$ begin
  insert into public.ejercicios (autor, titulo, pitch, doc)
  values ('11111111-1111-1111-1111-111111111111', 'Falso', 'f11', '{}'::jsonb);
  raise exception 'FALLA se puede subir un ejercicio a nombre de otro';
exception when insufficient_privilege or check_violation then
  raise notice 'PASA  no se puede subir un ejercicio firmando como otro';
end $$;

-- ---- ni nombrarse administrador ----
do $$ begin
  update public.entrenadores set admin = true
   where id = '22222222-2222-2222-2222-222222222222';
  if (select admin from public.entrenadores where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FALLA uno puede nombrarse administrador a sí mismo';
  end if;
  raise notice 'PASA  nadie se nombra administrador a sí mismo (silencioso)';
exception when insufficient_privilege then
  raise notice 'PASA  nadie se nombra administrador a sí mismo';
end $$;

-- ---- el correo no se expone ----
do $$ declare n int; begin
  select count(*) into n from auth.users;
  raise exception 'FALLA el correo de los demás es legible';
exception when insufficient_privilege then
  raise notice 'PASA  el correo de los demás no es legible desde la aplicación';
end $$;

-- ---- tres reportes esconden el ejercicio ----
reset role; set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into public.reportes (ejercicio, quien)
  select id, '22222222-2222-2222-2222-222222222222' from public.ejercicios limit 1;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
insert into public.reportes (ejercicio, quien)
  select id, '33333333-3333-3333-3333-333333333333' from public.ejercicios limit 1;

reset role;
select pg_temp.comprueba('con dos reportes el ejercicio se sigue viendo',
  (select not oculto from public.ejercicios where titulo = 'Rondo de Ana'));

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
insert into public.reportes (ejercicio, quien)
  select id, '44444444-4444-4444-4444-444444444444' from public.ejercicios limit 1;

reset role;
select pg_temp.comprueba('con el tercero se esconde solo',
  (select oculto from public.ejercicios where titulo = 'Rondo de Ana'));

set role anon; set request.jwt.claim.sub = '';
select pg_temp.comprueba('y deja de salir en la biblioteca común',
  (select count(*) from public.ejercicios) = 0);

reset role; set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.comprueba('pero su autor lo sigue viendo',
  (select count(*) from public.ejercicios) = 1);

-- ---- el mismo no puede reportar dos veces ----
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ declare ej uuid; begin
  -- ya está escondido, así que Bruno no lo ve: hay que nombrarlo por su id
  ej := current_setting('prueba.ejercicio')::uuid;
  insert into public.reportes (ejercicio, quien)
  values (ej, '22222222-2222-2222-2222-222222222222');
  raise exception 'FALLA se puede reportar dos veces lo mismo';
exception when unique_violation then
  raise notice 'PASA  no se puede reportar dos veces lo mismo';
end $$;

-- ---- una pizarra descomunal no entra ----
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ begin
  insert into public.ejercicios (autor, titulo, pitch, doc)
  values ('11111111-1111-1111-1111-111111111111', 'Enorme', 'f11',
          jsonb_build_object('x', repeat('a', 600000)));
  raise exception 'FALLA cabe una pizarra de más de medio mega';
exception when check_violation then
  raise notice 'PASA  una pizarra desmesurada se rechaza';
end $$;

-- ---- modalidad inventada ----
do $$ begin
  insert into public.ejercicios (autor, titulo, pitch, doc)
  values ('11111111-1111-1111-1111-111111111111', 'Rugby', 'rugby', '{}'::jsonb);
  raise exception 'FALLA se admite una modalidad que no existe';
exception when check_violation then
  raise notice 'PASA  solo se admiten las tres modalidades';
end $$;

reset role;
