/* ===========================================================================
   Pizarra Táctica · configuración de la nube
   ---------------------------------------------------------------------------
   Aquí van las dos únicas cosas que hacen falta para que la biblioteca
   compartida funcione. Se copian del panel de Supabase, en
   Project Settings → API:

     url  →  «Project URL»           (https://xxxxxxxx.supabase.co)
     key  →  «anon» / «publishable»  (la clave pública, la larga)

   La clave anon es pública a propósito: se ve en el navegador de cualquiera y
   Supabase cuenta con ello. Lo que protege los datos son las reglas por fila
   de supabase/schema.sql, no el secreto de esta clave. La clave de servicio
   (service_role) NO se pone aquí ni en ningún sitio del navegador.

   Con esto en blanco la pizarra funciona igual que siempre: su biblioteca de
   diez ejercicios y lo que guardes en este dispositivo, sin cuentas ni red.
   =========================================================================== */
window.PT_NUBE = {
  // Falta la Project URL. Mientras esté vacía, la nube sigue dormida y la
  // pizarra funciona igual que siempre: ni cuentas, ni peticiones, ni nada.
  url: '',
  key: 'sb_publishable_aF2ad0cjxXPZjViR8o-e1g_z5LFdSun'
};
