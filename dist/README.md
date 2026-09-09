# Archivo único

`pizarra-tactica.html` es la pizarra entera en un solo archivo: interfaz, motor y
tipografías incorporadas. No hace ninguna petición a internet.

- **Para usarla:** ábrelo con doble clic en cualquier navegador. Funciona sin conexión.
- **Para compartirla:** mándalo por correo o WhatsApp; quien lo reciba solo tiene que abrirlo.
- **Para publicarla:** súbelo a cualquier alojamiento, o usa el sitio completo de la raíz
  del repositorio (que además trae la landing y la instalación como aplicación).

Se genera a partir de `app/`. Si tocas `app/index.html`, `app/board.css` o `app/board.js`,
vuelve a generarlo para que este archivo no se quede atrás:

```bash
node tools/build-single.mjs
```
