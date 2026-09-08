# MONETA

**Un motor que busca ventajas reales y se niega a financiar las falsas.**

Python puro, sin dependencias. Descárgalo, ejecútalo, funciona.

```bash
python3 -m moneta doctor      # comprueba la instalación
python3 -m moneta explain     # qué hace cada estrategia y quién te paga
python3 -m moneta simulate    # simula el sistema entero
python3 -m moneta verify      # intenta demostrar que el sistema no funciona
python3 -m moneta worklist    # qué comprar hoy, ordenado por €/hora
python3 -m moneta seed        # abre la puerta con historial real de un exchange
python3 -m moneta dashboard   # panel HTML local, un solo fichero
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

El mismo bucle ejecuta un Monte Carlo de cientos de caminos y una cuenta en
vivo. No
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

### 4. Rentabilidad y capacidad son preguntas distintas

Esto parece un detalle y no lo es. Si mides el retorno de una estrategia contra
el **nocional que le diste**, cualquier estrategia con capacidad limitada parece
mala simplemente porque le diste más dinero del que puede usar — y la puerta
acaba rechazando justo lo que funciona. `retail_arb` está limitada por tus
horas, no por tus euros, y medida así se hundía en cuentas grandes.

Cada estrategia responde por separado a dos preguntas:

- `capital_in_use()` — cuánto dinero tiene realmente trabajando ahora mismo. Es
  el denominador del que aprende la puerta.
- `capacity()` — cuánto podría absorber como máximo. Es el tope del asignador.

Los ticks en los que una estrategia no tiene nada desplegado **no cuentan como
observación**: el capital parado no dice nada sobre su ventaja, y contarlo
arrastraría la media hacia cero mientras infla la n, haciendo que la puerta
parezca mejor informada de lo que está.

### 5. El gobernador de riesgo (veto)

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

### El veredicto

La suite se ejecuta bajo los dos presets de coste. Cada comprobación puede
fallar, y el veredicto se calcula a partir de los números, no está escrito de
antemano.

```
                                          realistic      adversarial
  el control de ventaja cero no se financia
                                          2,5% (<10%)    0,8% (<10%)
  la línea base gana a la caja tras impuestos
                                         +20,49%          +1,57%   (caja: +1,44%)
  el riesgo de cola está acotado
                                     P(dd>=20%) 1,7%   P(dd>=20%) 3,3%
  sobrevive a todo el estrés sin ruina
                              peor p05 -21,25%      peor p05 -24,36%
  la puerta es lo que deja fuera a la moneda al aire
                                    5% vs 100%          2% vs 100%
  la puerta reduce el drawdown de cola
                                  4,2% vs 4,4%        1,9% vs 3,4%

  6/6 superadas                       6/6 superadas
```

MONETA **nunca financió** el arbitraje entre exchanges, en ninguna de las 240
historias. Financió las dos ideas que tenían ventaja real.

### Todo depende de tus costes reales

Este es el hallazgo central, y no lo esperaba tan limpio. El mismo sistema, el
mismo mundo, las mismas horas — solo cambian las comisiones, el spread, la
latencia y las devoluciones. La referencia es dejar el dinero quieto en un
monetario al 2,00%, que después de impuestos son **1,44%**:

| capital | `realistic` | `adversarial` | caja |
|---:|---:|---:|---:|
| 2.000 € | **+68,5%** (1.410 €) | +1,58% (32 €) | +1,44% |
| 10.000 € | **+20,8%** (2.139 €) | +1,56% (160 €) | +1,44% |
| 50.000 € | **+5,9%** (3.011 €) | +1,54% (793 €) | +1,44% |
| 200.000 € | **+3,0%** (6.103 €) | **+1,33%** (2.726 €) | +1,44% |

Con condiciones minoristas normales gana entre 1.400 € y 6.100 € al año. Con
condiciones punitivas **no pierde: se queda prácticamente en la caja**, que es
exactamente lo que debe hacer un sistema que sabe medir. Cuando la ventaja no
cubre el peaje, la respuesta correcta es no operar.

Y fíjate en la última fila, porque es la más útil de toda la tabla: con
**200.000 € y costes adversos el sistema rinde 1,33% frente al 1,44% de no
hacer nada**. Pierde contra la caja. Los costes fijos de mantenerlo en marcha
y unos márgenes finos bastan para que la respuesta correcta sea un fondo
monetario. El sistema no oculta ese caso: lo mide y lo enseña.

Si te llevas una sola cosa de todo esto: mide tus comisiones reales antes de
creerte ninguna estrategia, y vuelve a ejecutar `verify`. **Si tu resultado solo
funciona con el preset `optimistic`, no funciona.**

### La línea base, con detalle

10.000 €, fricciones `realistic`, 120 historias independientes:

```
  retorno anual (mediana)   +20,49%
  retorno anual (media)     +20,17%   IC 95% [+18,87%, +21,33%]
  percentil 5 / 95           +12,57% / +28,24%
  peor 5% de años (CVaR)      +1,82%
  probabilidad de pérdida         2%
  P(drawdown >= 20%)            1,7%
  drawdown máx. mediana/p95   2,5% / 4,6%
  Sharpe (mediana)              3,56
  paradas de emergencia         1,7% de los caminos
  beneficio mediano          2.110 € sobre 10.000 €
  tus horas (mediana)          310 h/año  ->  6,89 €/hora
```

| estrategia | financiada en | cuota de capital | P&L medio | promocionada el día |
|---|---:|---:|---:|---:|
| `retail_arb` | 100% | 24,6% | **+2.571 €** | 286 |
| `funding_carry` | 98% | 23,0% | +112 € | 72 |
| `stat_arb_pairs` | 11% | 1,1% | +8 € | 582 |
| `control_null` | **2%** | 0,2% | +6 € | 630 |
| `cross_venue_arb` | **0%** | 0,0% | +0 € | nunca |

Fíjate en las dos últimas filas: el control de ventaja cero se financió en el 2%
de los caminos, **dentro de la garantía α=0,10** que promete la cota. No es cero
porque no puede serlo: es un límite estadístico honesto, no una afirmación de
infalibilidad.

Y fíjate en las horas: **310 al año, unas 6 a la semana** de las 10 disponibles,
a 6,89 €/hora contando todo el mantenimiento. El trabajo marginal de sourcing
paga 14–21 €/hora; el sistema completo, incluyendo el tiempo que se va en
operarlo, paga bastante menos. Las dos cifras son ciertas y no conviene
confundirlas.

### El techo del trabajo, visible en los números

| capital | CAGR | beneficio | de tus **horas** | de tu **dinero** |
|---:|---:|---:|---:|---:|
| 2.000 € | +68,5% | 1.410 € | +1.617 € | +20 € |
| 10.000 € | +20,8% | 2.139 € | +2.583 € | +126 € |
| 50.000 € | +5,9% | 3.011 € | +2.583 € | +547 € |
| 200.000 € | +3,0% | 6.103 € | +2.635 € | +2.193 € |

Multiplicar la cuenta por **100** multiplicó la aportación del trabajo por
**1,6** y la del capital por **107**.

La rama de trabajo no escala con dinero: la limitan las horas que tienes, y
ningún capital levanta ese techo. Por eso el porcentaje se ve espectacular con
2.000 € y el euro apenas se mueve. Las ramas de capital sí escalan, y solo
igualan al trabajo por encima de unos 200.000 €.

> **Lectura práctica:** por debajo de ~20.000 €, esto es una herramienta para
> gastar bien tus horas. Por encima, se convierte en una herramienta para
> asignar dinero. Son dos productos distintos y conviene saber cuál usas.

### Lo que descubrió sobre cada idea

- **Arbitraje entre exchanges**: de ~1.000 ventanas al año, solo **9 superan el
  peaje** con fricciones adversas. Rentable solo con `optimistic` (+0,97%/año);
  pierde con `realistic` (−0,93%) y `adversarial` (−2,08%). La idea más repetida
  de internet no funciona a latencia y comisiones minoristas. **Nunca financiada,
  en ninguna de las 240 historias.**
- **Pairs trading**: 74% de acierto y aun así mediana ≈0% (realista) y −1,7%
  (adverso), con cola izquierda de −12%. Financiado en el 11% de los caminos y
  con el 1,1% del capital: el sistema no se lo cree, y hace bien.
- **Carry de financiación**: real y modesto. Delta-neutral, Sharpe 1,57–3,01,
  +2,45%/año (adverso) y +4,02% (realista). Financiado en el 96–98% de los
  caminos y a cualquier tamaño de cuenta, promocionado hacia el día 72.
- **Arbitraje minorista**: la mejor rentabilidad sobre capital pequeño, con techo
  duro. Tasa de acierto: 133 compras de 49.270 listados analizados (**0,27%**).
  Por eso hace falta un ordenador: el filtro es trivial, el volumen no.

### Lo que lo mata

El estrés se aplica **durante la operación en vivo**, no durante la validación:
si el golpe cae mientras el motor duerme, no prueba nada. (Ese fue uno de los
fallos que encontró la propia suite.)

| escenario | mediana | percentil 5 | P(pérdida) | drawdown |
|---|---:|---:|---:|---:|
| base | +20,77% | +13,33% | 2% | 2,4% |
| caída del 40% en una vela | +20,67% | +12,76% | 2% | 2,4% |
| se rompe la cointegración | +21,03% | +15,16% | 0% | 2,6% |
| el doble de volatilidad | +22,06% | +7,56% | 3% | 2,7% |
| la financiación se invierte y no vuelve | +19,81% | +12,82% | 0% | 2,5% |
| quiebra el exchange **secundario** | +19,25% | +9,68% | 0% | 2,7% |
| suben las comisiones en todas partes | +10,75% | +0,88% | 3% | 1,7% |
| todo lo anterior, el mismo año | +11,28% | −1,10% | 7% | 2,0% |
| **quiebra el exchange principal** | **−17,54%** | **−21,25%** | **97%** | **25,5%** |

Que una caída del 40% en una sola vela no haga prácticamente nada es la prueba
de que el libro es de verdad delta-neutral: la pata corta gana justo lo que
pierde la larga.

El que hace daño merece leerse despacio. **La quiebra del exchange no es un
drawdown, es una pérdida total** de lo que tengas allí. Por eso el tope de
concentración por contraparte *es* tu pérdida máxima: está en el 25%, y el
sistema pierde justo eso, en el 97% de los caminos. Subirlo sube el retorno y
agranda el agujero en la misma proporción. FTX, Celsius, Mt. Gox: esto pasa, y
le pasa a gente que tenía razón en todo lo demás.

### La ablación, leída honestamente

Cada mecanismo se quita por turnos y el sistema se vuelve a ejecutar sobre las
**mismas** historias. Un mecanismo que no gana a su propia ausencia es adorno.

| brazo | mediana | vs base | p | financia la moneda al aire |
|---|---:|---:|---:|---:|
| MONETA (todo) | 20,77% | — | — | 5% · 0,4% del capital |
| sin puerta de promoción | 20,98% | +0,05pp | 0,97 | 10% · 0,4% |
| sin Kelly (reparto plano) | 20,79% | +0,04pp | 0,97 | 7% · 0,7% |
| **reparto uniforme, sin puerta, sin Kelly** | **18,95%** | **−2,14pp** | **0,056** | **100% · 7,0%** |

Esto no dice lo que yo esperaba, así que lo digo como es.

**Ningún mecanismo mejora el retorno de forma estadísticamente significativa.**
Quitar la puerta: +0,05pp, p=0,97. Quitar Kelly: +0,04pp, p=0,97. Y ni siquiera
el brazo uniforme, que pierde 2,14 puntos, llega al umbral del 5% en esta
ejecución (p=0,056, con 120 caminos contra 60). Si solo miras la columna de la
mediana, la conclusión honesta es que **no está demostrado que nada de esto te
haga ganar más dinero**.

Donde sí hay una diferencia categórica es en **a quién le llega el dinero**. Y
ahí se ve que hay dos defensas independientes, no una:

- La puerta impide que una estrategia sin ventaja llegue a estar viva.
- Y aunque la desactives, el muestreo de Thompson sobre una posterior escéptica
  le sigue asignando casi cero, porque extrae ventajas negativas.

Por eso el brazo "sin puerta" todavía deja a la moneda al aire en el 0,4% del
capital. Hay que quitar **las dos** —que es exactamente lo que hace el brazo
uniforme, y exactamente lo que hace una persona que reparte su dinero a partes
iguales entre las ideas que le gustaron— para que el ruido se lleve el **7% del
capital en el 100% de los futuros**.

**MONETA no afirma que la puerta te haga ganar más de media; los datos no lo
sostienen. Afirma que te impide equivocarte con confianza y con dinero real**, y
que para conseguirlo hacen falta dos mecanismos, no uno.

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
  realizadas, con liquidación anual en efectivo. Los intereses de la caja
  ociosa tributan igual, para que la comparación "¿gana a no hacer nada?" sea
  limpia. Tu jurisdicción es más complicada que esto.
- **La rentabilidad sin riesgo del 2%** es un supuesto, y de los que más pesan:
  si tu banco te paga 0%, todo el sistema se ve mejor; si te paga 3,5%, la mitad
  de las estrategias dejan de merecer la pena. Cámbialo con `idle_yield_annual`
  y vuelve a medir.
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
  tests/           60 tests
```

```bash
python3 -m unittest moneta.tests.test_moneta -v
```

Los tests incluyen los que de verdad importan: que el dinero nunca se crea de la
nada (el equity se reconstruye desde el diario y tiene que cuadrar), que la
garantía anytime-valid se cumple **empíricamente** y no solo sobre el papel, que
el libro de carry se mantiene delta-neutral dentro del 10% a lo largo de un año,
que la contabilidad de inventario cuadra artículo a artículo en cada tick, y que
los libros de papel jamás tocan dinero real.

Cuatro de ellos son regresiones de fallos que esta misma suite encontró y que
antes pasaban desapercibidos. Ese es el argumento a favor de tener una suite
así.

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

