# Pentomino Puzzle Solver — Spec del proyecto

## Qué hace la app
Una web donde el usuario sube un screenshot del juego móvil "Jigsaw Puzzle" (piezas tipo
pentominó que hay que acomodar para llenar un tablero rectangular). La app:
1. Procesa la imagen e identifica el estado del tablero (piezas ya puestas + huecos) y las
   piezas sueltas disponibles debajo.
2. Calcula la solución completa (qué pieza va en qué celda, con qué rotación/flip).
3. Muestra esa solución como una visualización estática (sin animación) — el tablero final
   resuelto, con cada pieza en su posición y color correcto.

## Contexto del juego (confirmado analizando screenshots reales)
- El tablero es rectangular, dividido en una grilla de celdas cuadradas.
- **El tamaño de celda en píxeles es constante entre niveles** (~120px de lado en capturas
  de 1080px de ancho), pero **el número de filas/columnas del tablero varía por nivel**
  (se vieron casos de 5x5 y de 6x5). Por eso el tamaño de grilla NO se puede hardcodear:
  hay que detectarlo en cada imagen.
- Las piezas son pentominós (5 celdas cada una), pueden rotar (botón "Rotate") y reflejarse
  (botón "Flip"). El número total de piezas (puestas + sueltas) siempre llena el tablero
  exacto (filas × columnas es múltiplo de 5).
- Las imágenes de entrada son **siempre screenshots limpios del juego** (no fotos de
  cámara), con colores planos y grilla perfectamente alineada. Esto simplifica mucho el
  procesamiento: no hace falta corrección de perspectiva, manejo de sombras/reflejos, ni
  detección robusta de bordes irregulares — es sampleo de color directo.

## Arquitectura

```
GitHub repo
 └─ main (protegida, deploy de producción vía Vercel)
 └─ ramas de feature (deploy preview automático por PR en Vercel)

Next.js (App Router), desplegado en Vercel
 /app
   /page.tsx                  → UI: subir imagen (input file + capture=environment
                                 para sacar foto directo desde el celu) y mostrar resultado
   /api/solve/route.ts        → recibe la imagen, corre los 2 módulos, devuelve la solución
 /lib
   /image-processing.ts       → Módulo 1
   /solver.ts                 → Módulo 2
   /pentomino-shapes.ts       → utilidades de normalización/rotación/flip de formas
   /types.ts                  → interfaces compartidas
```

Todo puede vivir en TypeScript / Node (no hace falta Python ni servicio aparte), dado que
el procesamiento de imagen es sampleo de color simple, no CV pesado. Usar algo como
`sharp` (Node) o Canvas API si se procesa client-side, para leer píxeles.

## Módulo 1: Procesamiento de imagen

Input: la imagen (buffer/base64).
Output:
```ts
interface BoardState {
  rows: number;
  cols: number;
  cells: (string | null)[][]; // color id de la pieza ya puesta, o null si está vacía
}

interface LoosePiece {
  id: string;
  color: string;
  shape: [number, number][]; // coordenadas relativas normalizadas (row, col)
}
```

Pasos:
1. **Detectar el rectángulo del tablero** por el marco/borde característico (color rosado
   del frame del juego) — buscar el bounding box de esa región.
2. **Detectar tamaño de celda**: escanear una fila/columna conocida en busca de las
   transiciones de color de las líneas de grilla (igual a como hicimos manualmente:
   diffs de color > umbral a lo largo de un eje). El tamaño de celda en px es
   aproximadamente constante entre niveles — usar eso como validación cruzada.
3. **Calcular filas/columnas**: ancho_tablero / tamaño_celda = cols, alto_tablero /
   tamaño_celda = rows. Redondear al entero más cercano.
4. **Samplear color en el centro de cada celda del tablero** → arma `BoardState.cells`.
   Celdas con el color de fondo/vacío (beige, ~`rgb(230,200,187)`) se marcan como `null`.
5. **Detectar la región de piezas sueltas** (debajo del tablero, delimitada por el borde
   inferior del marco). Ahí no hay grilla fija:
   - Recorrer la región buscando blobs de color (flood fill / connected components,
     ignorando el fondo de madera/tatami).
   - Agrupar celdas contiguas del mismo color en una misma pieza.
   - Convertir cada blob a coordenadas de grilla relativas (dividiendo por el tamaño de
     celda ya conocido) y normalizar (restar el mínimo row/col para que empiece en (0,0)).
6. Cada color distinto = una pieza distinta (colores no se repiten entre piezas en la
   misma pantalla, según lo visto).

## Módulo 2: Solver

**Insight de eficiencia (confirmado en esta conversación):** no hace falta buscar primero
"con estas piezas fijas" y después "solución completa" como pasos separados — eso duplica
trabajo. Basta con UNA sola búsqueda de backtracking (exact cover) sobre todas las piezas
libres, pero **ordenando la exploración para probar primero la posición/orientación actual
de cada pieza ya puesta en el tablero**. Así, la primera solución completa que encuentra el
backtracking ya es la que requiere mover menos piezas — sin tener que enumerar todas las
soluciones posibles y comparar después.

```ts
interface Placement {
  pieceId: string;
  cells: [number, number][]; // celdas absolutas en el tablero
}

function solve(board: BoardState, pieces: LoosePiece[]): Placement[] | null {
  // 1. Para cada pieza (puesta o suelta), generar todas las orientaciones únicas
  //    (hasta 8: 4 rotaciones × flip), normalizadas.
  // 2. Para piezas YA puestas en el tablero: anteponer su posición/orientación actual
  //    como primer candidato a probar en el backtracking.
  // 3. Backtracking tipo exact cover (Algorithm X / DLX opcional a futuro si hace falta
  //    más velocidad; con tableros de ~30 celdas un backtracking simple ya alcanza en ms).
  // 4. Devolver la primera solución completa encontrada (todas las celdas cubiertas,
  //    sin solapamientos).
  // 5. Si no hay ninguna solución posible (no debería pasar si el nivel es válido),
  //    devolver null y loggear para debug.
}
```

## Módulo 3: Visualización

- Sin animación. Renderizar directamente el tablero final resuelto como grilla estática
  (SVG o HTML/CSS grid), cada celda coloreada según a qué pieza pertenece en la solución.
- Idealmente reusar los mismos colores detectados de la imagen original, para que el
  usuario pueda comparar de un vistazo "esto tengo puesto → esto tengo que mover a esto".
- Opcional (no prioritario): marcar con un ícono/borde distinto las piezas que NO cambian
  de posición respecto al estado actual, para que el usuario sepa qué puede dejar como está.

## Notas / decisiones ya tomadas
- Input: solo screenshots limpios del juego (no fotos reales) → no se necesita corrección
  de perspectiva ni robustez ante ruido de cámara.
- Tamaño de tablero variable por nivel, tamaño de celda en px constante → detectar
  filas/columnas dinámicamente, no hardcodear.
- El solver hace una sola pasada de backtracking con orden de candidatos "posición actual
  primero", no dos búsquedas separadas.
- Visualización estática, sin animación.

## Próximos pasos sugeridos
1. Armar `pentomino-shapes.ts`: normalización, generación de las 8 orientaciones.
2. Armar `solver.ts` con el backtracking (probar primero con datos hardcodeados de algún
   nivel ya analizado en esta conversación, para validar contra la solución que ya
   verificamos a mano).
3. Armar `image-processing.ts`, probando contra los screenshots reales ya usados en esta
   conversación como casos de test.
4. Conectar todo en `/api/solve` + UI mínima de subida/visualización.
5. Deploy a Vercel, probar desde el celular.
