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
  ('11111111-1111-1111-1111-111111111111', 'ana@club.com',  '{"nombre":"Ana","acepto":"si"}'),
  ('22222222-2222-2222-2222-222222222222', 'bru@club.com',  '{}'),
  ('33333333-3333-3333-3333-333333333333', 'caz@club.com',  '{}'),
  ('44444444-4444-4444-4444-444444444444', 'dan@club.com',  '{}'),
  -- Este intenta anotarse una versión que no existe, para no volver a ver
  -- nunca la pregunta. No lo decide él.
  ('55555555-5555-5555-5555-555555555555', 'eva@club.com',  '{"acepto":"9999-99-z"}');

select pg_temp.comprueba('al crear la cuenta se crea el perfil solo',
  (select count(*) from public.entrenadores) = 5);
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

/* ---- y no puede destaparlo ----
   Esto faltaba, y era un agujero de verdad: con un «grant update» a secas el
   autor podía escribir en cualquier columna de su fila, «oculto» incluida.
   Publicas algo que no debería estar, tres personas lo denuncian, se esconde,
   y el autor lo vuelve a poner a false. La moderación no servía de nada. */
do $$ begin
  begin
    update public.ejercicios set oculto = false where titulo = 'Rondo de Ana';
    raise exception 'FALLA el autor ha podido destapar su propio ejercicio';
  exception
    when insufficient_privilege then
      raise notice 'PASA  el autor no puede destapar lo que la moderación escondió';
  end;
end $$;

-- Ni ponerse el contador de aperturas por las nubes.
do $$ begin
  begin
    update public.ejercicios set aperturas = 99999 where titulo = 'Rondo de Ana';
    raise exception 'FALLA el autor ha podido inflar su contador de aperturas';
  exception
    when insufficient_privilege then
      raise notice 'PASA  ni inflar su contador de aperturas';
  end;
end $$;

/* Pero lo suyo sí lo edita, y el disparador que arma el texto de búsqueda
   sigue escribiendo en «busca» y «actualizado» aunque el autor no tenga
   permiso sobre esas columnas: un disparador BEFORE toca NEW sin que se le
   miren los permisos por columna. */
update public.ejercicios set titulo = 'Rondo de Ana, corregido'
  where titulo = 'Rondo de Ana';
reset role;
select pg_temp.comprueba('el autor sí edita lo suyo, y el buscador se rearma solo',
  (select busca like '%corregido%' from public.ejercicios
    where titulo = 'Rondo de Ana, corregido'));
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.ejercicios set titulo = 'Rondo de Ana'
  where titulo = 'Rondo de Ana, corregido';

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

-- ---- el consentimiento queda registrado ----
/* No basta con «aceptó»: dentro de dos años eso no dice nada si no se sabe qué
   texto tenía delante. Y la hora la pone el servidor, porque una fecha que
   manda el navegador es la que el navegador quiera escribir. */
reset role;
select pg_temp.comprueba('se guarda QUÉ condiciones aceptó, no solo que aceptó',
  (select acepto from public.entrenadores
    where id = '11111111-1111-1111-1111-111111111111') = '2026-09-a');
select pg_temp.comprueba('con la hora puesta por el servidor',
  (select acepto_en is not null and acepto_en <= now()
     from public.entrenadores where id = '11111111-1111-1111-1111-111111111111'));
select pg_temp.comprueba('y quien no aceptó nada no tiene fecha inventada',
  (select acepto = '' and acepto_en is null from public.entrenadores
    where id = '22222222-2222-2222-2222-222222222222'));
/* Y la versión la pone el servidor, no el navegador. Si la pusiera el
   navegador, bastaría con mandar una versión futura para que el día que
   cambien las condiciones ya figure como aceptada. */
select pg_temp.comprueba('la versión aceptada la decide el servidor, no el navegador',
  (select acepto from public.entrenadores
    where id = '55555555-5555-5555-5555-555555555555') = public.condiciones_vigentes());
select pg_temp.comprueba('y coincide con la que enseña la aplicación',
  public.condiciones_vigentes() = '2026-09-a');

-- ---- borrar la cuenta borra de verdad ----
/* Quien le da a «borrar mi cuenta» espera que no quede nada: ni el perfil, ni
   lo que subió a la biblioteca común. Se comprueba que se va todo, y que no se
   puede borrar a nadie más que a uno mismo. */
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
insert into public.ejercicios (autor, titulo, pitch, doc, publicado)
values ('44444444-4444-4444-4444-444444444444', 'Lo de Dan', 'f11', '{"frames":[]}'::jsonb, true);
reset role;
select pg_temp.comprueba('antes de borrar, Dan tiene perfil y un ejercicio publicado',
  (select count(*) from public.entrenadores where id = '44444444-4444-4444-4444-444444444444') = 1
  and (select count(*) from public.ejercicios where titulo = 'Lo de Dan') = 1);

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select public.borra_mi_cuenta();
reset role;
select pg_temp.comprueba('borrar la cuenta se lleva el usuario',
  (select count(*) from auth.users where id = '44444444-4444-4444-4444-444444444444') = 0);
select pg_temp.comprueba('y el perfil detrás, en cascada',
  (select count(*) from public.entrenadores where id = '44444444-4444-4444-4444-444444444444') = 0);
select pg_temp.comprueba('y lo que había subido a la biblioteca común',
  (select count(*) from public.ejercicios where titulo = 'Lo de Dan') = 0);
select pg_temp.comprueba('los demás siguen enteros',
  (select count(*) from auth.users) = 4);

-- No se puede borrar sin haber entrado.
do $$ begin
  begin
    perform set_config('request.jwt.claim.sub', '', false);
    perform public.borra_mi_cuenta();
    raise exception 'FALLA se ha podido borrar una cuenta sin sesión';
  exception
    when sqlstate 'P0001' then
      if sqlstate = 'P0001' then raise notice 'PASA  sin sesión no se borra nada'; end if;
  end;
end $$;

-- Y anon no puede ni llamarla.
do $$ begin
  begin
    set local role anon;
    perform public.borra_mi_cuenta();
    raise exception 'FALLA anon puede llamar a borra_mi_cuenta';
  exception
    when insufficient_privilege then
      raise notice 'PASA  sin cuenta no se puede ni llamar a borrar';
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---- modalidad inventada ----
do $$ begin
  insert into public.ejercicios (autor, titulo, pitch, doc)
  values ('11111111-1111-1111-1111-111111111111', 'Rugby', 'rugby', '{}'::jsonb);
  raise exception 'FALLA se admite una modalidad que no existe';
exception when check_violation then
  raise notice 'PASA  solo se admiten las tres modalidades';
end $$;

reset role;
