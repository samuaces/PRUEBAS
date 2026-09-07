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

Todo lo que sigue sale de `python3 -m moneta verify`. Los números están en
`VERIFICATION.txt` y en los `verification_*.json`, y se regeneran ejecutándolo.

Condiciones: **10.000 €, después de impuestos, 10 h/semana, un año en vivo tras
validar sobre histórico**. La alternativa contra la que se compara todo es
dejar el dinero en un fondo monetario al 2,00%.

### El resultado que importa

MONETA **nunca financió** la moneda al aire, ni el arbitraje entre exchanges,
ni el pairs trading. Financió las dos que tenían ventaja real.

Sin la puerta, la moneda al aire se financia en el **100%** de los futuros.

### Todo depende de tus costes reales

Este es el hallazgo central, y no lo esperaba tan limpio. El mismo sistema, el
mismo mundo, las mismas horas — solo cambian las comisiones, el spread, la
latencia y las devoluciones:

| capital | `realistic` | `adversarial` |
|---:|---:|---:|
| 2.000 € | **+78,9%** (1.640 €) | +2,0% (42 €) |
| 10.000 € | **+20,4%** (2.118 €) | +2,0% (212 €) |
| 50.000 € | **+6,0%** (3.121 €) | +2,0% (1.051 €) |
| 200.000 € | **+3,3%** (6.898 €) | +1,9% (3.913 €) |

Con condiciones minoristas normales, gana entre 1.600 € y 6.900 € al año. Con
condiciones punitivas, **no pierde: se queda en la caja**. Eso es exactamente lo
que debe hacer un sistema que sabe medir — cuando la ventaja no cubre el peaje,
la respuesta correcta es no operar.

Si te llevas una sola cosa: antes de creerte ninguna estrategia, mide tus
comisiones de verdad y vuelve a ejecutar `verify`. **Si tu resultado solo
funciona con el preset `optimistic`, no funciona.**

### El techo del trabajo, visible en los números

Con fricciones realistas, el beneficio de la rama de trabajo según el capital:

| capital | de tus **horas** | de tu **dinero** |
|---:|---:|---:|
| 2.000 € | +1.966 € | +24 € |
| 10.000 € | +2.512 € | +120 € |
| 50.000 € | +2.680 € | +616 € |
| 200.000 € | +2.666 € | +2.375 € |

Multiplicar la cuenta por **100** multiplicó la aportación del trabajo por
**1,36** y la del capital por **99**.

La rama de trabajo no escala con dinero: está limitada por las horas que tienes,
y ningún capital levanta ese techo. Por eso el porcentaje se ve espectacular con
2.000 € y el euro no se mueve. Las ramas de capital sí escalan, a un porcentaje
bajo, y solo igualan al trabajo por encima de unos 200.000 €.

> **Lectura práctica:** por debajo de ~20.000 €, esto es una herramienta para
> gastar bien tus horas. Por encima, se convierte en una herramienta para
> asignar dinero. Son dos productos distintos y conviene saber cuál usas.

### Lo que descubrió sobre cada idea

- **Arbitraje entre exchanges**: de ~1.000 ventanas al año, solo **9 superan el
  peaje** con fricciones adversas. Rentable solo con `optimistic` (+0,97%/año);
  pierde con `realistic` (−0,93%) y `adversarial` (−2,08%). La idea más repetida
  de internet no funciona a latencia y comisiones minoristas. **Nunca financiada.**
- **Pairs trading**: 74% de acierto y aun así mediana ≈0% (realista) y −1,7%
  (adverso), con cola izquierda de −12%. Una moneda al aire cara. **Nunca
  financiada.**
- **Carry de financiación**: real y modesto. Delta-neutral, Sharpe 1,57–3,01,
  +2,45%/año (adverso) y +4,02% (realista). Financiada en el 88–100% de los
  caminos y a cualquier tamaño de cuenta.
- **Arbitraje minorista**: la mejor rentabilidad sobre capital pequeño, con techo
  duro. **14–21 €/hora** de trabajo marginal. Tasa de acierto: 133 compras de
  49.270 listados analizados (**0,27%**) — por eso hace falta un ordenador.

### Lo que lo mata

El estrés se aplica **durante la operación en vivo**, no durante la validación:
si el golpe cae mientras el motor duerme, no prueba nada.

| escenario | mediana | percentil 5 | P(pérdida) |
|---|---:|---:|---:|
| base | +4,06% | +0,69% | 0% |
| caída del 40% en una vela | +3,66% | +0,60% | 0% |
| la financiación se invierte y no vuelve | +2,84% | +0,50% | 4% |
| **el exchange quiebra** | **−21,6%** | **−23,8%** | **62%** |
| **suben las comisiones en todas partes** | +1,98% | **−20,3%** | 21% |

Los dos que hacen daño merecen leerse despacio:

**La quiebra del exchange no es un drawdown, es una pérdida total** de lo que
tengas allí. Por eso el tope de concentración por contraparte *es* tu pérdida
máxima: está en el 25%, y el sistema pierde justo eso. Subirlo sube el retorno y
agranda el agujero en la misma proporción. FTX, Celsius, Mt. Gox: esto pasa.

**Una subida de comisiones aniquila la rama de trabajo.** El beneficio de
`retail_arb` cae de ~450 € a ~4 €. Los márgenes finos no sobreviven a que el
intermediario suba su tajada.

### La ablación, leída honestamente

Quitar la puerta **sube** la mediana: el capital se pone a trabajar de inmediato
en lugar de esperar a la prueba. Ese es el trato completo, y no lo voy a
disimular.

Lo que compras con la puerta es la cola izquierda y la garantía de que algo sin
ventaja alguna se financie en ~0% de los futuros en vez del 100%.

**MONETA no afirma que la puerta te haga ganar más de media. Afirma que te
impide equivocarte con confianza y con dinero real.**

### Tres errores que encontró la propia suite

Vale la pena decir esto porque es el argumento más fuerte a favor de tener una
suite así. Estos fallos estaban en el código, parecían funcionar, y los detectó
la verificación, no yo:

1. **Retirar capital se contabilizaba como pérdida**, así que desfinanciar una
   estrategia disparaba su corte por drawdown y la mataba. Arreglado con un
   índice tipo NAV que separa flujos de rendimiento.
2. **La previa sobre σ era una escala absoluta fija**, así que con cuentas
   grandes ahogaba al dato y la puerta no se abría nunca. El sistema fallaba en
   silencio por encima de 50.000 €.
3. **El listón estaba en cero en vez de en el tipo sin riesgo**, así que el
   sistema desplegaba capital en estrategias que ganaban dinero pero perdían
   contra dejarlo en caja. Con 200.000 € eso costaba dinero real.

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

