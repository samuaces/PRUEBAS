# MONETA

**Un motor que busca ventajas reales y se niega a financiar las falsas.**

Python puro, sin dependencias. Descárgalo, ejecútalo, funciona.

```bash
python3 -m moneta doctor      # comprueba la instalación
python3 -m moneta explain     # qué hace cada estrategia y quién te paga
python3 -m moneta simulate    # simula el sistema entero
python3 -m moneta verify      # intenta demostrar que el sistema no funciona
python3 -m moneta worklist    # qué comprar hoy, ordenado por €/hora
```

---

## Lo primero, porque te lo debo

Pediste algo que, al ponerlo en el PC, genere dinero. **No existe un programa
que cree dinero.** El dinero llega de una de tres formas: alguien te lo paga
por asumir un riesgo, alguien te lo paga por hacer un trabajo, o alguien te lo
paga por corregir un precio equivocado. Cualquier cosa que prometa lo contrario
está vendiendo el programa, no el resultado.

Lo que sí se puede construir —y es lo que hay aquí— es la máquina que hace bien
esas tres cosas: encuentra ventajas pequeñas y verificables, **demuestra que son
reales antes de arriesgar un euro**, las dimensiona para que una mala racha no
te arruine, y compone lo que sobrevive.

MONETA no te va a hacer rico. Lo que hace, y esto sí es difícil y sí vale, es
**impedir que pierdas dinero estando convencido de que ganabas**.

---

## El problema que realmente resuelve

Casi todo el mundo que pierde dinero con "sistemas para ganar dinero" comete el
mismo error, y no es el que cree. No es elegir la estrategia equivocada. Es
**mirar los resultados muchas veces y actuar en cuanto pintan bien**.

Esto es medible. Toma una estrategia con ventaja exactamente cero —una moneda al
aire— y revísala cada pocas horas, desplegando capital en cuanto supere el
umbral clásico del 95% de confianza:

```
VENTAJA VERDADERA = CERO, revisada continuamente durante ~3,3 años

  test clásico del 95%, mirando cada tick   ->  se dispara en el 30,8% de los casos
  cota válida en todo instante (α=0,05)     ->  se dispara en el  0,5% de los casos
  cota válida en todo instante (α=0,10)     ->  se dispara en el  2,5% de los casos
```

Ese **30,8%** es la razón matemática por la que tanta gente despliega dinero real
en algo que no tiene ventaja alguna. No es mala suerte ni falta de disciplina:
es que el test que usan no es válido cuando lo consultas muchas veces.

MONETA usa una [secuencia de confianza válida en todo instante][robbins]
(cota de mezcla normal, Robbins 1970; Howard et al. 2021). Su garantía se
mantiene *sin importar cuántas veces la mires*. Ese es el núcleo del sistema.

El precio de esa garantía también está medido, y es alto:

```
VENTAJA VERDADERA con Sharpe ~2 anual

  test clásico del 95%      ->  la detecta en ~119 días  (pero se equivoca el 30,8% de las veces)
  cota válida (α=0,10)      ->  la detecta en ~537 días  (y se equivoca el 2,5%)
```

Por eso el sistema valida sobre **histórico que ya tienes** antes de operar en
vivo. `python3 -m moneta seed` descarga dos años de tipos de financiación
reales y liquidados de un exchange público, los puntúa con el mismo modelo de
costes, y abre la puerta en dos minutos en lugar de en dos años.

[robbins]: https://projecteuclid.org/euclid.aoms/1177697092

---

## Cómo funciona

```
   mundo  ->  cada estrategia se mide a sí misma sobre papel
          ->  la puerta decide a quién se le permite dinero real
          ->  Thompson + Kelly deciden cuánto
          ->  el gobernador de riesgo decide cuánto de eso es seguro
          ->  las estrategias financiadas operan
          ->  el libro mayor registra lo que pasó de verdad
```

El mismo bucle ejecuta un Monte Carlo de 500 caminos y una cuenta en vivo. No
hay un "modo backtest" que se comporte distinto en silencio: ahí es donde la
mayoría de los sistemas de trading esconden sus pérdidas.

### 1. La puerta de promoción (escepticismo)

Cada estrategia arranca en **papel**, con una previa centrada en *"no tienes
ventaja"* y con peso real. Solo recibe dinero cuando su cota inferior válida en
todo instante supera el umbral. Hay dos rutas independientes, y el presupuesto
de error α se reparte entre ambas:

- **Retorno total** — funciona para cualquier estrategia, sin supuestos.
- **Caja realizada** — solo dinero efectivamente cobrado o pagado.

La segunda es la que da potencia sin hacer trampa. Una estrategia cuya ventaja
es *un flujo de caja contractual* (te pagan la financiación, la venta se
liquida) se demuestra mucho más rápido, porque el ruido de valoración que domina
la primera no tiene nada que ver con por qué gana dinero. Una estrategia cuya
ventaja es *una predicción de precio* no obtiene ningún atajo: su P&L realizado
es exactamente igual de ruidoso que sus marcas.

### 2. Muestreo de Thompson (exploración)

Entre las financiadas, el capital se reparte extrayendo la ventaja verdadera de
cada una de su posterior. Las inciertas reciben de vez en cuando una extracción
alta y con ella una oportunidad de demostrarse; las que son malas con confianza,
casi nunca. Sin calendarios de exploración ajustados a mano.

### 3. Kelly fraccionario (dimensionado)

La fracción óptima de crecimiento es μ/σ². Kelly completo es inutilizable cuando
μ está estimado, así que MONETA apuesta una fracción (0,25 por defecto) y acota.
La incertidumbre encoge la apuesta automáticamente, porque μ viene de la
posterior y no de una estimación puntual.

### 4. El gobernador de riesgo (veto)

Tiene poder de veto absoluto sobre el asignador. Ningún retorno esperado compra
una violación de estos límites: drawdown total, pérdida diaria, concentración
por estrategia, concentración por contraparte, apalancamiento, colchón de caja,
e interruptor de emergencia.

---

## Las cinco estrategias

Cada una se juzga en los mismos dos ejes: **€ por € de capital** y **€ por hora
de tu atención**. Son las dos únicas cosas que tienes.

| estrategia | ligada a | de dónde sale el dinero |
|---|---|---|
| `funding_carry` | capital | Los largos apalancados pagan por su apalancamiento. Compras contado y vendes el perpetuo: sin exposición al precio, cobras la comisión de financiación. |
| `cross_venue_arb` | capital | La misma moneda a distinto precio en dos exchanges. |
| `stat_arb_pairs` | capital | Quien necesitó liquidez con suficiente urgencia como para separar dos activos de su relación. |
| `retail_arb` | **trabajo** | Vendedores comprando rapidez y compradores comprando variedad. Nadie sale engañado. |
| `control_null` | — | **Nada. Ese es el objetivo.** |

### `control_null` existe para falsar el sistema

Todo lo que afirma MONETA se apoya en una hipótesis: que la puerta distingue una
ventaja real de una buena racha. La única manera de comprobarlo es darle algo
cuya respuesta ya conocemos.

`control_null` lanza una moneda al aire, dimensionada como una operación real y
pagando comisiones reales. Su ventaja verdadera es negativa. Y aun así:

```
control_null, un año, fricciones adversas:
  retorno medio    -7,2%
  desviación       19,1%
  años rentables   35%          <- parece un genio uno de cada tres años
  mejor año        +50,7%
```

**Si MONETA le da capital significativo, MONETA está roto** y nada en este
repositorio significa nada. La suite de verificación falla si eso ocurre.

---

## Resultados

Todo lo que sigue sale de ejecutar `python3 -m moneta verify`. Los números están
en `VERIFICATION.txt` y en `verification.json`, y se regeneran ejecutándolo.

Salvo indicación contraria: **10.000 €, preset de fricciones `adversarial`,
después de impuestos, 10 h/semana de tu tiempo, un año en vivo tras validar
sobre histórico**.

### El resultado que importa

MONETA **nunca financió** la estrategia de moneda al aire, ni el arbitraje entre
exchanges, ni el pairs trading. Financió las dos que tenían ventaja real.

Sin la puerta, la moneda al aire se financia en el **100%** de los futuros.

### Lo que descubrió sobre cada idea

- **Arbitraje entre exchanges**: de ~1.000 ventanas al año, solo **9 superan el
  peaje** con fricciones adversas. Rentable solo con fricciones optimistas
  (+0,97%/año), pierde con realistas (−0,93%) y adversas (−2,08%). La idea más
  repetida de internet no funciona a latencia y comisiones minoristas.
- **Pairs trading**: 74% de acierto, y aun así mediana ≈0% (realista) y −1,7%
  (adverso), con cola izquierda de −12%. Una moneda al aire cara.
- **Carry de financiación**: real y modesto. +2,45%/año (adverso), +4,02%
  (realista), Sharpe 1,57–3,01, delta-neutral. Peor caso −0,5% en dos años.
- **Arbitraje minorista**: la mejor rentabilidad sobre capital pequeño, y con un
  techo duro. **14–21 €/hora.** Tasa de acierto: 133 compras de 49.270 listados
  analizados (0,27%).

### El hallazgo estructural

El mismo sistema, las mismas horas, distinto tamaño de cuenta:

| capital | beneficio mediano | de tus **horas** | de tu **dinero** |
|---|---|---|---|
| 3.000 € | ~+88% | casi todo | casi nada |
| 12.000 € | ~+22% | casi todo | poco |

**Idéntico beneficio absoluto.** La rama de trabajo no escala con dinero: está
limitada por las horas que tienes, y ningún capital levanta ese techo. Las ramas
de capital sí escalan, a un porcentaje bajo de un dígito, y solo empiezan a
importar en términos absolutos por encima de unos 50.000 €.

> **Lectura práctica:** por debajo de ~20.000 €, esto es una herramienta para
> gastar bien tus horas. Por encima, se convierte en una herramienta para
> asignar dinero. Son dos productos distintos y conviene saber cuál estás usando.

### Lo que lo mata

El estrés se aplica **durante la operación en vivo**, no durante la validación
—si el golpe cae mientras el motor duerme, no prueba nada.

| escenario | mediana | percentil 5 | P(pérdida) |
|---|---|---|---|
| base | +4,06% | +0,69% | 0% |
| caída del 40% en una vela | +3,66% | +0,60% | 0% |
| financiación se invierte y no vuelve | +2,84% | +0,50% | 4% |
| **el exchange quiebra** | **−21,6%** | **−23,8%** | **62%** |
| **subida de comisiones en todas partes** | +1,98% | **−20,3%** | 21% |

Los dos que hacen daño de verdad merecen leerse con atención:

**La quiebra del exchange no es un drawdown, es una pérdida total** de lo que
tengas allí. Por eso el tope de concentración por contraparte *es* tu pérdida
máxima. Está en el 25%, y el sistema pierde justo eso. Subirlo sube el retorno y
agranda el agujero en la misma proporción. FTX, Celsius, Mt. Gox: esto pasa.

**Una subida de comisiones aniquila la rama de trabajo**: el beneficio de
`retail_arb` cae de ~450 € a ~4 €. Los márgenes finos no sobreviven a que el
intermediario suba su tajada.

### La ablación, leída honestamente

Quitar la puerta **sube** la mediana: el capital se pone a trabajar de inmediato
en vez de esperar a la prueba. Ese es el trato completo.

Lo que compras con la puerta es la cola izquierda y la garantía de que algo sin
ventaja alguna se financie en ~0% de los futuros en lugar del 100%.

**MONETA no afirma que la puerta te haga ganar más de media. Afirma que te
impide equivocarte con confianza y con dinero real.**

---

## Por qué deberías dudar de estos números

Son resultados simulados bajo un modelo. No son una previsión ni una promesa.

- **El modelo puede estar mal.** Los supuestos están en `moneta/sim/market.py`,
  documentados y calibrados contra condiciones minoristas públicas. Están
  escritos para que discutas con ellos, no para que te los creas.
- **La liquidez real es peor de lo que cree cualquier modelo** cuando más la
  necesitas.
- **No modela**: cambios regulatorios, que tu banco cierre tu cuenta por operar
  con cripto, errores propios, que a un marketplace no le guste tu volumen, ni
  el coste mental de todo esto.
- **Los impuestos** se modelan como un tipo plano sobre ganancias netas
  realizadas, con liquidación anual. Tu jurisdicción es más complicada.
- **El módulo de ejecución en vivo no existe a propósito.** MONETA lee datos
  públicos y simula. No manda órdenes. Un programa que mueve tu dinero solo
  debería escribirlo alguien que entienda cada línea, y ese alguien tienes que
  ser tú.

**Nada de esto es asesoramiento financiero.**

---

## Estructura

```
moneta/
  core/
    stats.py       inferencia válida en todo instante, posteriors, métricas
    frictions.py   comisiones, spread, impacto, latencia, devoluciones, impuestos
    ledger.py      partida doble, posiciones, atribución exacta de P&L
    strategy.py    contrato de estrategia; libros de papel y reales separados
    allocator.py   la puerta, Thompson, Kelly
    risk.py        drawdown, concentración, apalancamiento, parada de emergencia
    engine.py      el bucle
  sim/
    processes.py   OU, difusión con saltos, cambio de régimen
    market.py      un mundo coherente que ven todas las estrategias
    montecarlo.py  barridos paralelos
    scenarios.py   estrés con nombre propio
    verify.py      la suite de falsación
  strategies/      las cinco ramas de ingresos
  feeds/public.py  datos públicos de solo lectura, sin claves
  ui/dashboard.py  panel HTML local de un solo fichero
  tests/           55 tests
```

```bash
python3 -m unittest moneta.tests.test_moneta -v
```

Los tests incluyen los que de verdad importan: que el dinero nunca se crea de la
nada, que la garantía anytime-valid se cumple empíricamente, que el libro de
carry se mantiene delta-neutral, y que los libros de papel jamás tocan dinero
real.

---

## Si quieres llevarlo a la realidad

Por orden de sensatez:

1. **`python3 -m moneta seed`** — descarga historial real de financiación y mira
   si la puerta se abre con tus costes reales. Dos minutos, cero riesgo.
2. **Conecta `retail_arb` a marketplaces de verdad.** Es la única rama con
   rentabilidad decente sobre capital pequeño. La economía —el filtro, el
   ranking, el modelo de comisiones— ya es correcta; falta un cliente de API o
   un scraper que produzca objetos `Deal`. Ahí está el trabajo, y es trabajo de
   verdad.
3. **Ajusta las fricciones a tus condiciones reales** y vuelve a ejecutar
   `verify`. Si tu resultado solo funciona con el preset `optimistic`, no
   funciona.
4. **La ejecución en vivo, la última y con las manos frías.**

