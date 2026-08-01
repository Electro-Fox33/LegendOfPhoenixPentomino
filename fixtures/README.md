# Fixtures de test

Screenshots reales del juego para usar como casos de test del procesamiento de imagen y del
solver.

## Estado de cada nivel

| Archivo | Nivel | Ground truth verificado |
|---|---|---|
| `images/stage_7-2.png` | Stage 7-2 | ✅ `expected/stage_7-2.json` |
| `images/stage_7-5.png` | Stage 7-5 | ✅ `expected/stage_7-5.json` |
| `images/stage_7-6.png` | Stage 7-6 | ✅ `expected/stage_7-6.json` |
| `images/stage_3-3_unverified.png` | Stage 3-3 | ❌ sin verificar |
| `images/stage_4-3_unverified.png` | Stage 4-3 | ❌ sin verificar |
| `images/stage_7-1_unverified.png` | Stage 7-1 | ❌ sin verificar |
| `images/stage_7-7_unverified.png` | Stage 7-7 | ❌ sin verificar |

Los 3 primeros (`7-2`, `7-5`, `7-6`) se procesaron a mano (sampleo de píxeles por código +
solver de backtracking exhaustivo) durante el diseño de este proyecto, verificando que cada
pieza de la solución tiene 5 celdas y que cubren el tablero sin solapamientos
(`validate_fixtures.py`). Sirven como test de regresión confiable: si el módulo de imagen +
solver reales no llegan a esta misma solución, hay un bug.

Los últimos 4 (`3-3`, `4-3`, `7-1`, `7-7`) son solo imágenes crudas — quedaron sin resolver
matemáticamente en su momento (heurística a mano no confiable, o análisis incompleto).
Sirven como casos de test adicionales para el módulo de *procesamiento de imagen* (extraer
correctamente la grilla, colores y piezas sueltas), pero **no tienen un `expected/*.json`
todavía** — hay que generarlo corriendo el solver ya implementado y revisando el resultado
a mano antes de confiar en él como ground truth.

## Estructura de cada `expected/*.json`

```jsonc
{
  "sourceImage": "images/stage_X-Y.png",
  "boardRows": 5,
  "boardCols": 6,
  "cellPixelSize": 120,        // tamaño de celda en px, constante entre niveles
  "initialState": {            // estado tal como aparece en el screenshot
    "nombrePieza": [[fila,col], ...]   // celdas ya puestas en el tablero (piezas fijas)
    // las piezas sueltas se listan con su forma normalizada (empieza en [0,0])
  },
  "solution": {
    "grid": [ [...], [...] ],  // grilla final, cada celda = nombre de la pieza que va ahi
    "unchangedPieces": [...]   // opcional: piezas que ya estaban bien puestas en el original
  }
}
```

## Validar los fixtures

```
python3 validate_fixtures.py
```

Chequea que cada pieza en `solution.grid` tenga exactamente 5 celdas y que la grilla cubra
el tablero completo sin huecos ni superposiciones.
