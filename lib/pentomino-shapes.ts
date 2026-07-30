/**
 * pentomino-shapes.ts
 *
 * Utilidades para trabajar con formas de piezas pentominó (5 celdas cada una):
 * normalizacion, generacion de las orientaciones unicas (rotaciones + flip),
 * y traduccion a posiciones absolutas en el tablero.
 */

export type Cell = readonly [row: number, col: number];
export type Shape = readonly Cell[];

/**
 * Normaliza una forma: la traslada para que su celda superior-izquierda
 * quede en (0,0), y devuelve las celdas ordenadas de forma canonica
 * (para poder comparar formas por igualdad de string).
 */
export function normalize(cells: Shape): Shape {
  const minRow = Math.min(...cells.map(([r]) => r));
  const minCol = Math.min(...cells.map(([, c]) => c));
  const shifted: Cell[] = cells.map(([r, c]) => [r - minRow, c - minCol]);
  shifted.sort(([r1, c1], [r2, c2]) => r1 - r2 || c1 - c2);
  return shifted;
}

function shapeKey(cells: Shape): string {
  return cells.map(([r, c]) => `${r},${c}`).join("|");
}

function rotate90(cells: Shape): Shape {
  // (r, c) -> (c, -r)
  return cells.map(([r, c]) => [c, -r] as Cell);
}

function flipHorizontal(cells: Shape): Shape {
  // (r, c) -> (r, -c)
  return cells.map(([r, c]) => [r, -c] as Cell);
}

/**
 * Genera todas las orientaciones UNICAS de una forma (hasta 8: 4 rotaciones
 * x 2 por el flip). Formas simetricas van a generar menos de 8 (duplicados
 * se descartan automaticamente).
 */
export function allOrientations(cells: Shape): Shape[] {
  const seen = new Map<string, Shape>();

  let current: Shape = cells;
  for (let flip = 0; flip < 2; flip++) {
    const base = flip === 1 ? flipHorizontal(cells) : cells;
    current = base;
    for (let rot = 0; rot < 4; rot++) {
      current = rotate90(current);
      const norm = normalize(current);
      const key = shapeKey(norm);
      if (!seen.has(key)) {
        seen.set(key, norm);
      }
    }
  }

  // Tambien agregar la forma original y su flip normalizados (por si alguna
  // rotacion no las produce exactamente, es una red de seguridad barata)
  for (const c of [cells, flipHorizontal(cells)]) {
    const norm = normalize(c);
    const key = shapeKey(norm);
    if (!seen.has(key)) {
      seen.set(key, norm);
    }
  }

  return Array.from(seen.values());
}

/**
 * Traduce una forma normalizada a celdas absolutas en el tablero,
 * aplicando un offset (fila, columna).
 */
export function translate(shape: Shape, rowOffset: number, colOffset: number): Shape {
  return shape.map(([r, c]) => [r + rowOffset, c + colOffset] as Cell);
}

/** Devuelve el ancho/alto (bounding box) de una forma ya normalizada. */
export function shapeBounds(shape: Shape): { height: number; width: number } {
  const maxRow = Math.max(...shape.map(([r]) => r));
  const maxCol = Math.max(...shape.map(([, c]) => c));
  return { height: maxRow + 1, width: maxCol + 1 };
}
