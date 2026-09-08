# VETA

**Encuentra trabajo pagado, calcula si te van a pagar, y te dice cuándo no vale la pena.**

Python puro, sin dependencias, capital inicial cero.

```bash
python3 -m veta doctor          # ¿hay red? ¿hay token? ¿cuál es tu historial?
python3 -m veta scan            # busca y ordena por € por hora esperados
python3 -m veta brief 1 --start # genera el encargo para Claude Code
python3 -m veta record --key ... --outcome won --hours 5 --paid 400
python3 -m veta verify          # demuestra que el ranking sirve para algo
```

---

## Por qué esto y no otra cosa

Pediste algo que genere dinero sin capital inicial. Busqué qué ha funcionado de
verdad, y la respuesta es aburrida y consistente: **con cero capital lo único
que paga rápido es vender un servicio**, y el cuello de botella no es saber
hacerlo — es encontrar a alguien que pague.

Eso sí es un problema de búsqueda. Y hay un mercado, uno solo, donde ese
problema es resoluble con matemáticas en vez de con suerte:

**Las *bounties* de código abierto.** Tareas públicas, con el alcance ya escrito
por otro, y **con el dinero ya depositado en garantía**. No es la promesa de un
desconocido: está puesto antes de que empieces.

Y hay algo que hace tres años no existía: **tú tienes un agente que programa**.
Una bounty de 400 € que a un desarrollador le costaría ocho horas puede costarte
dos. Eso cambia la aritmética por completo.

---

## El error que arruina a los cazadores de bounties

No es elegir un problema difícil. Es elegir un problema **en un repositorio que
no fusiona trabajo de fuera**.

Puedes escribir un parche correcto, con tests, bien acotado, y no cobrar nada,
porque el mantenedor no fusiona una *pull request* de un desconocido desde
marzo. La bounty sigue publicada, tus horas se han ido, y **nada en la issue te
avisaba**.

Pero está todo en datos públicos antes de empezar:

- qué porcentaje de PRs de fuera acaban fusionándose
- cuánto tarda la fusión cuando ocurre
- si se ha fusionado algo de un extraño recientemente
- cuánta cola sin revisar hay acumulada

Un repo que fusiona el 5% y no ha tocado nada en seis meses no es una bounty, es
una rifa. VETA lo dice antes de que gastes el fin de semana.

```
REPO SANO      fusiona 90% de PRs de fuera, mediana 3 días  ->  factor de cobro 1,00
REPO MUERTO    fusiona 5%, última fusión hace 245 días      ->  factor de cobro 0,02
REPO ARCHIVADO                                              ->  factor de cobro 0,00
```

---

## Cómo decide

Tres cantidades, estimadas por separado porque fallan por motivos distintos:

| | de dónde sale |
|---|---|
| **HORAS** | de la propia issue: ¿hay pasos para reproducir? ¿hay traza? ¿es un *refactor*? ¿58 comentarios discutiendo el alcance? |
| **P(cobro)** | de tu historial × la salud del repo × quién más ha dicho que va a por ella |
| **PAGO** | lo publica la fuente |

Y el veredicto es uno solo: **€ por hora esperados**.

```
bounty                                    horas  P(cobro)  EUR/h  veredicto
Fix null deref in parser                2,8-5,3-9,7    25%     22  INTENTAR
Refactor scheduler architecture ($2000) 12-43-99       10%      4  SALTAR
Fix typo in README ($50)                1,1-2,2-4,2    25%      5  SALTAR
Fix null deref  [en un repo muerto]     2,8-5,3-9,7     1%      0  SALTAR
```

Fíjate en la segunda línea: **la bounty de 2.000 $ es el peor negocio de la
lista.** Eso es exactamente lo que el ranking intuitivo se equivoca.

---

## ¿Sirve de algo el ranking? Los números

Simulación: mismo mercado, mismas horas, misma habilidad, misma regla de
abandono para todas las políticas. Lo único que cambia es cuál eliges. Cada
bounty tiene una verdad oculta (horas reales, si el repo paga de verdad, cuánta
gente va a por ella) y el cazador solo ve una sombra ruidosa de esa verdad.

40 temporadas de 26 semanas a 20 h/semana:

| política | €/h | ganado | aciertos | parches perdidos por repos que no pagan | p vs VETA |
|---|---:|---:|---:|---:|---:|
| **VETA (valor esperado + salud del repo)** | **18,1** | 10.325 € | 26% | 21,3 | — |
| pago / horas estimadas | 15,8 | 9.364 € | 22% | 29,3 | 0,063 |
| mayor pago primero | 6,0 | 3.144 € | 7% | 5,1 | <0,0001 |
| la más reciente | 4,6 | 2.396 € | 19% | 12,6 | <0,0001 |
| al azar | ~7 | — | — | — | <0,0001 |

Y en un mercado hostil, donde casi ningún proyecto fusiona trabajo de fuera:

| | normal | hostil | caída |
|---|---:|---:|---:|
| VETA | 19,6 | 9,1 | **54%** |
| pago / horas | 17,7 | 7,2 | 59% |
| mayor pago | 5,4 | 1,6 | 70% |

### Lo que estos números NO dicen

**Contra el ranking ingenuo la ventaja es real pero no está demostrada**:
18,1 vs 15,8 €/h da **p = 0,063**, por encima del umbral del 5%. Con 40
temporadas no alcanza para afirmarlo. Lo que sí es aplastante es la diferencia
contra lo que hace la gente de verdad — coger la de mayor pago — que es **3×**.

Si solo te llevas una cosa: **el tamaño de la bounty no te dice casi nada, y
mirarlo primero es la forma más rápida de trabajar gratis.**

---

## Qué está probado y dónde

Sé honesto sobre esto porque es importante:

| | estado |
|---|---|
| Extracción de importes, detección de reclamos | **probado**, 45 tests |
| Modelo de salud del repo | **probado** contra fixtures |
| Estimación de horas y ranking | **probado** |
| Pipeline completo de punta a punta | **probado** con datos de fixture, sin red |
| La política gana a las alternativas | **probado** en simulación, 5/5 |
| Los clientes de GitHub y Algora contra la API real | **NO probado desde aquí** |

Lo último tiene una razón concreta: el sandbox donde escribí esto bloquea la API
de búsqueda de GitHub por diseño (*"sessions are bound to their configured
repositories"*) y bloquea Algora entera. **En tu máquina no hay esa restricción.**

Por eso el cliente de Algora usa mapeo tolerante — busca cada valor bajo todos
los nombres que podría tener — y por eso existe `veta probe algora`, que te
enseña el JSON real para que corrijas el mapeo en dos minutos si hace falta.

Y por eso arreglé un fallo que encontré probando esto: `scan` se tragaba los
errores de red y mostraba **"0 bounties"**, indistinguible de "hoy no hay
trabajo". Ahora dice:

```
NO es que no haya trabajo: las fuentes fallaron.
  - GitHub search failed for EVERY label -- this is a connectivity or
    permissions problem, not an empty market. First failure: HTTP 403
```

---

## El encargo, y por qué empieza por el reloj

`veta brief 1` genera un documento para pasarle a Claude Code. Lo primero que
pone no es el contexto técnico, es esto:

> **Presupuesto: 3,9 horas. Parada dura: 2,5 horas.**
>
> Esta bounty se eligió porque vale unos 29 €/hora a 3,9 horas estimadas. Esa
> cifra es la única razón para estar aquí, y se degrada rápido: al doble de la
> estimación paga 15 €/h, por debajo del suelo que le habría permitido ser
> elegida siquiera.
>
> A las 2,5 horas, para y sé honesto. ¿El trabajo que queda está claro y es
> pequeño? Termínalo. ¿Sigues leyendo el código, o el bug está en otro sitio?
> **Para.** Deja en la issue lo que has aprendido y anota el intento como
> abandonado.
>
> Abandonar en la línea de parada es un éxito del proceso. Pasarte es cómo la
> tarifa por hora se va a cero.

Porque el error no es elegir mal la issue. Es elegir una razonable y luego
dedicarle tres días porque parar parecía desperdiciar lo invertido.

---

## Tu historial es lo que hace que esto funcione

`P(cobro)` empieza siendo una previa escéptica: Beta(2,6), media 25%. Se asume
que pierdes tres de cada cuatro intentos hasta que **tus** datos digan otra cosa.

```bash
python3 -m veta record --key algora:123 --outcome won --hours 5.5 --paid 400
python3 -m veta record --list
```

```
4 cerrados, 2 cobrados (50%), 27h, 640 EUR -> 23,7 EUR/h
posterior de habilidad: 33% (IC90 12%-55%)
tus estimaciones van sobradas: gastas x0,94 lo estimado
```

**Un intento abandonado cuenta como derrota.** Tiene que contar: las horas se
gastaron y no llegó dinero, y un modelo que las perdonara te recomendaría la
misma trampa otra vez.

---

## El bucle completo

```bash
export GITHUB_TOKEN=...          # opcional: 30 búsquedas/min en vez de 10
python3 -m veta doctor
python3 -m veta scan --floor 15  # solo lo que pase de 15 EUR/h
python3 -m veta brief 1 --start
claude "lee brief-1.md y haz el trabajo, respetando el límite de horas"
# ...abres la PR, y pase lo que pase:
python3 -m veta record --key <clave> --outcome won --hours 4.5 --paid 368
```

Cada vuelta mejora la estimación. Ese es el único activo que se acumula aquí.

---

## Lo que no te voy a vender

- **Esto no gana dinero por ti.** Hay que hacer el trabajo. Lo que hace es
  asegurarse de que las horas van a algo que paga, y pararte cuando no.
- **Las bounties son competitivas.** Puedes hacerlo todo bien y que otro llegue
  antes. El modelo lo tiene en cuenta; no lo elimina.
- **Los primeros intentos serán malos.** La previa escéptica no es pesimismo, es
  lo que dicen los datos de un principiante en cualquier oficio.
- **Los números de arriba son de simulación**, no una previsión. El mercado
  simulado está en `veta/sim/market.py` y está escrito para que discutas con él.
- **No hay atajo.** Si alguien te ofrece uno, te está vendiendo el programa, no
  el resultado.

```bash
python3 -m unittest veta.tests.test_veta    # 45 tests
```
