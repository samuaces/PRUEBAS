# Cookie Play para iPhone (app nativa)

Misma arquitectura que los reproductores IPTV nativos: las peticiones salen con
identificación de reproductor, se permite `http` sin cifrar, no hay reglas de
navegador de por medio y el vídeo lo pone **AVPlayer**, que reproduce HLS y
`.mp4/.mkv` de serie. Es lo que la versión web no puede hacer.

## Qué hace

- **Una sola pantalla para empezar:** pegas el enlace del proveedor y la app
  detecta sola si es un panel Xtream (`get.php?username=…`) o una lista M3U.
- **Catálogo ordenado** en canales, películas y series, con categorías,
  buscador y limpieza de títulos (`ES|`, `[1080p]`, `CAST`…).
- **Series por temporadas**, con los episodios pedidos al abrir la ficha para
  no descargar miles de capítulos de golpe.
- **Favoritos, continuar viendo y recomendados** (valoración del panel más
  afinidad con lo que guardas).
- **Varias listas guardadas**, con cambio entre ellas en Inicio y en Ajustes.
- Todo se guarda en el propio teléfono, en `Documentos`.

## Estructura

```
ios/
├─ project.yml            definición del proyecto (XcodeGen)
└─ CookiePlay/
   ├─ CookiePlayApp.swift  arranque
   ├─ Info.plist           permite http y audio en segundo plano
   ├─ Modelo/
   │  ├─ Modelos.swift     contenido, listas, marcadores
   │  ├─ ClienteRed.swift  peticiones con User-Agent de reproductor
   │  ├─ ClienteXtream.swift  API del panel
   │  ├─ ParserM3U.swift   listas M3U
   │  ├─ Texto.swift       limpieza de títulos
   │  └─ Biblioteca.swift  estado, guardado y recomendaciones
   └─ Vistas/              SwiftUI: inicio, catálogo, canales, ficha, ajustes…
```

## Compilar e instalar

El proyecto de Xcode no se versiona: se genera con
[XcodeGen](https://github.com/yonaskolb/XcodeGen), así el repositorio queda
limpio y los conflictos desaparecen.

```bash
brew install xcodegen
cd ios && xcodegen generate && open CookiePlay.xcodeproj
```

En Xcode: elige tu iPhone, pon tu Apple ID en *Signing & Capabilities* (vale
una cuenta gratuita) y dale a ▶. Con cuenta gratuita la app caduca a los siete
días y se reinstala repitiendo el paso; con cuenta de desarrollador, no caduca.

Cada empujón a `ios/` dispara la compilación en GitHub Actions
(`.github/workflows/ios.yml`), así se sabe al momento si algo se rompió.

## Mejorarla

Cada archivo hace una cosa y está comentado en castellano. Para añadir algo:

- **Otro tipo de lista** → `Modelo/ParserM3U.swift` o un cliente nuevo junto a
  `ClienteXtream.swift`.
- **Cómo se ordena o recomienda** → `Modelo/Biblioteca.swift`.
- **Aspecto y pantallas** → `Vistas/`.
- **Comportamiento del reproductor** → `Vistas/Reproductor.swift`.
