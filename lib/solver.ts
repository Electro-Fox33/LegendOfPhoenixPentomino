/**
 * solver.ts
 *
 * Resuelve el tablero de pentominos: dado el tamano del tablero y la lista
 * de piezas (algunas ya colocadas, otras sueltas), encuentra una asignacion
 * de celdas para cada pieza que cubra el tablero exacto, sin superposiciones.
 *
 * Diseño (una sola pasada, sin busquedas duplicadas):
 * - Se genera UNA sola busqueda de backtracking (exact cover) sobre TODAS las
 *   piezas libres para moverse.
 * - Para las piezas que ya estan colocadas en el tablero, se prueba primero
 *   su posicion/orientacion actual como candidato antes que cualquier otra.
 *   Esto hace que la primera solucion completa encontrada ya sea, de forma
 *   natural, la que menos piezas mueve respecto al estado actual -- sin
 *   necesidad de enumerar todas las soluciones posibles y comparar despues.
 */

import { allOrientations, normalize, translate, shapeBounds, Cell, Shape } from "./pentomino-shapes";

export interface Piece {
  id: string;
  /** Forma de la pieza tal como aparece actualmente (celdas absolutas si ya
   *  esta puesta en el tablero, o relativas si es una pieza suelta). */
  shape: Shape;
  /** Si la pieza ya esta colocada en el tablero, sus celdas absolutas
   *  actuales. Si es una pieza suelta (no colocada), omitir este campo. */
  currentCells?: Cell[];
}

export interface SolveInput {
  rows: number;
  cols: number;
  pieces: Piece[];
}

export interface PlacementResult {
  pieceId: string;
  cells: Cell[];
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

function cellsKey(cells: readonly Cell[]): string {
  return [...cells]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([r, c]) => cellKey(r, c))
    .join("|");
}

/** Genera todas las posiciones absolutas posibles para una pieza dentro del tablero. */
function generateCandidates(shape: Shape, rows: number, cols: number): Cell[][] {
  const orientations = allOrientations(shape);
  const candidates: Cell[][] = [];
  const seen = new Set<string>();

  for (const orientation of orientations) {
    const { height, width } = shapeBounds(orientation);
    for (let dr = 0; dr <= rows - height; dr++) {
      for (let dc = 0; dc <= cols - width; dc++) {
        const placed = translate(orientation, dr, dc) as Cell[];
        const key = cellsKey(placed);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(placed);
        }
      }
    }
  }
  return candidates;
}

/**
 * Resuelve el tablero. Devuelve null si no existe ninguna solucion valida
 * (no deberia pasar si el nivel es valido, pero se contempla el caso).
 */
export function solve(input: SolveInput): PlacementResult[] | null {
  const { rows, cols, pieces } = input;
  const totalCells = rows * cols;
  const totalPieceCells = pieces.length * 5;

  if (totalPieceCells !== totalCells) {
    throw new Error(
      `Las piezas no cubren el tablero exacto: ${totalPieceCells} celdas de piezas vs ${totalCells} celdas de tablero`
    );
  }

  const candidatesPerPiece: Cell[][][] = pieces.map((piece) => {
    const candidates = generateCandidates(piece.shape, rows, cols);

    if (piece.currentCells) {
      const currentKey = cellsKey(piece.currentCells);
      candidates.sort((a, b) => {
        const aMatch = cellsKey(a) === currentKey ? 0 : 1;
        const bMatch = cellsKey(b) === currentKey ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    return candidates;
  });

  const used = new Set<string>();
  const chosen: PlacementResult[] = [];

  function backtrack(idx: number): boolean {
    if (idx === pieces.length) {
      return used.size === totalCells;
    }
    const piece = pieces[idx];
    for (const candidate of candidatesPerPiece[idx]) {
      let ok = true;
      for (const [r, c] of candidate) {
        if (r < 0 || r >= rows || c < 0 || c >= cols || used.has(cellKey(r, c))) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (const [r, c] of candidate) used.add(cellKey(r, c));
      chosen.push({ pieceId: piece.id, cells: candidate });

      if (backtrack(idx + 1)) return true;

      chosen.pop();
      for (const [r, c] of candidate) used.delete(cellKey(r, c));
    }
    return false;
  }

  const success = backtrack(0);
  return success ? chosen : null;
}

/** Utilidad: compara si una pieza quedo en la misma posicion que ya tenia. */
export function isUnchanged(piece: Piece, result: PlacementResult): boolean {
  if (!piece.currentCells) return false;
  return cellsKey(piece.currentCells) === cellsKey(result.cells);
}
