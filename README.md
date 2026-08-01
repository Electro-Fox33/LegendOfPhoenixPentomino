# Pentomino Puzzle Solver

Subís una captura del juego móvil "Jigsaw Puzzle" (piezas tipo pentominó que hay que
acomodar para llenar un tablero) y la app te dice exactamente cómo armarlo: qué pieza va
en cada celda, con qué rotación/flip, y cuáles ya estaban bien puestas.

🔗 [legend-of-phoenix-pentomino.vercel.app](https://legend-of-phoenix-pentomino.vercel.app/)

## Cómo funciona

1. **Detección del tablero** (`lib/board-detection.ts`): encuentra la grilla del tablero
   en la imagen escaneando transiciones de color, y clasifica cada celda según a qué
   pieza pertenece (por color) o si está vacía.
2. **Detección de piezas sueltas** (`lib/loose-piece-detection.ts`): encuentra las piezas
   disponibles debajo del tablero, agrupando celdas contiguas del mismo color. Cuando una
   pieza no se puede leer con confianza (por ejemplo, colores parecidos al fondo, o brillos
   que el juego dibuja encima de algunas piezas), queda marcada como **ambigua** en vez de
   arriesgar una lectura incorrecta.
3. **Confirmación manual** (`components/PieceConfirmationGrid.tsx`): si hay piezas
   ambiguas, se le muestra al usuario una grilla chica para que confirme con el dedo cuáles
   celdas son parte de la pieza, en vez de que el sistema adivine.
4. **Resolución** (`lib/solver.ts`): backtracking tipo *exact cover* sobre todas las
   piezas (probando rotaciones y reflejos), en una sola pasada. Para las piezas que ya
   estaban puestas en el tablero, se prueba primero su posición actual como candidato --
   así la primera solución completa que encuentra ya es, de forma natural, la que menos
   piezas mueve respecto al estado original.
5. **Visualización** (`components/SolutionBoard.tsx`): muestra el tablero resuelto como
   grilla estática, coloreada según la solución.

## Stack

- **Next.js** (App Router) + **React** + **TypeScript**
- **Tailwind CSS** para estilos
- **sharp** para decodificar y samplear píxeles de la imagen
- Desplegado en **Vercel**, conectado a GitHub (deploy automático en cada push)

## Estructura

```
app/
  page.tsx                    -- UI: subir imagen, confirmar piezas, ver solución
  api/solve/route.ts          -- POST: imagen -> estado detectado (+ solución si no hay ambiguas)
  api/finalize/route.ts       -- POST: confirmaciones manuales -> solución final
components/
  PieceConfirmationGrid.tsx   -- grilla para confirmar a mano una pieza ambigua
  SolutionBoard.tsx           -- grilla estática con la solución final
lib/
  pentomino-shapes.ts         -- normalización, rotaciones y reflejos de una forma
  solver.ts                   -- backtracking / exact cover
  board-detection.ts          -- detección y clasificación del tablero
  loose-piece-detection.ts    -- detección de piezas sueltas + piezas ambiguas
  solve-from-image.ts         -- pegamento: conecta todo lo anterior
fixtures/
  images/                     -- screenshots reales usados como casos de test
  expected/                   -- soluciones verificadas a mano (ground truth)
CLAUDE.md                     -- spec histórico del proyecto (contexto para Claude Code)
```

## Correr localmente

Requiere Node instalado vía [nvm](https://github.com/nvm-sh/nvm) (el Node del sistema en
Ubuntu/WSL suele traer un `npm` roto).

```bash
nvm install --lts
nvm use --lts

npm install
npm run dev
```

Abrí `http://localhost:3000` y subí una imagen (podés usar cualquiera de
`fixtures/images/`).

## Correr los tests

Cada módulo de `lib/` tiene un test que corre contra los fixtures verificados:

```bash
npx tsx lib/pentomino-shapes.test.ts
npx tsx lib/solver.test.ts
npx tsx lib/board-detection.test.ts
npx tsx lib/loose-piece-detection.test.ts
npx tsx lib/solve-from-image.test.ts
```

Ver `fixtures/README.md` para el detalle de qué niveles tienen ground truth verificado.

## Limitaciones conocidas

- Los screenshots deben ser **capturas limpias del juego** (no fotos de cámara) -- el
  detector asume colores planos y grilla alineada, sin corrección de perspectiva.
- La detección de piezas sueltas no es perfecta: en los fixtures verificados acierta
  7 de 8 piezas exactas. El caso que falla (una pieza con un brillo que cubre un área
  más grande de lo normal) queda documentado en el código de
  `lib/loose-piece-detection.ts`, junto con los enfoques que se probaron y por qué no
  alcanzaron. Para estos casos, el flujo de confirmación manual permite resolver igual.
- Solo 3 de los 7 niveles usados durante el desarrollo tienen solución verificada
  matemáticamente (`fixtures/expected/`); el resto son solo imágenes de referencia sin
  ground truth todavía.

## Deploy

Conectado a Vercel vía GitHub: cada push a cualquier rama genera una preview URL, y los
merges a `main` despliegan a producción automáticamente. `sharp` está declarado en
`dependencies` (no en `devDependencies`) para asegurar que se instale en el build de
producción, y `next.config.ts` lo marca como paquete externo del servidor
(`serverExternalPackages`) para que Next no intente empaquetarlo con webpack/Turbopack.
