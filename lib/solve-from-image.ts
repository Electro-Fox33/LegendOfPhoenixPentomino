/**
 * solve-from-image.ts
 *
 * "Pegamento" final: conecta board-detection + loose-piece-detection + solver.
 * Recibe el buffer de una imagen (screenshot del juego) y devuelve la
 * solucion completa (que pieza va en que celda), o los warnings si algo no
 * se pudo detectar bien.
 *
 * No agrega logica nueva de deteccion/resolucion -- cada pieza de este
 * pipeline ya fue probada por separado contra los fixtures verificados.
 */

import { decodeImage, detectBoardGrid, classifyBoard, BoardState, RGB } from "./board-detection";
import { detectLoosePieces, LoosePiece, AmbiguousPiece, buildLoosePieceFromSelection } from "./loose-piece-detection";
import { solve, Piece, PlacementResult } from "./solver";

export interface SolveFromImageResult {
  /** null si no se pudo encontrar una solucion (revisar warnings o ambiguousPieces). */
  solution: PlacementResult[] | null;
  board: BoardState;
  loosePieces: LoosePiece[];
  /** Piezas que no se detectaron con confianza -- necesitan confirmacion manual antes de poder resolver. */
  ambiguousPieces: AmbiguousPiece[];
  /** Color de cada pieza (tanto las ya puestas como las sueltas), para pintar la visualizacion. */
  pieceColors: Record<string, RGB>;
  warnings: string[];
}

export async function solveFromImage(buffer: Buffer): Promise<SolveFromImageResult> {
  const warnings: string[] = [];

  // --- 1. Detectar el tablero ---
  const img = await decodeImage(buffer);
  const { colBoundaries, rowBoundaries } = detectBoardGrid(img);
  if (colBoundaries.length < 2 || rowBoundaries.length < 2) {
    throw new Error("No se pudo detectar el tablero en la imagen.");
  }
  const board = classifyBoard(img, rowBoundaries, colBoundaries);
  const boardBottom = rowBoundaries[rowBoundaries.length - 1];

  // --- 2. Detectar las piezas sueltas ---
  const { pieces: loosePieces, ambiguousPieces, warnings: looseWarnings } = detectLoosePieces(img, boardBottom);
  warnings.push(...looseWarnings);

  // --- 3. Armar el input del solver ---
  const pieceColors: Record<string, RGB> = { ...board.pieceColors };
  const solverPieces: Piece[] = [];

  // piezas ya colocadas en el tablero
  const placedCells: Record<string, [number, number][]> = {};
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const id = board.cells[r][c];
      if (id === null) continue;
      if (!placedCells[id]) placedCells[id] = [];
      placedCells[id].push([r, c]);
    }
  }
  for (const [id, cells] of Object.entries(placedCells)) {
    solverPieces.push({ id, shape: cells, currentCells: cells });
  }

  // piezas sueltas
  for (const piece of loosePieces) {
    solverPieces.push({ id: piece.id, shape: piece.shape });
    pieceColors[piece.id] = piece.color;
  }
  for (const piece of ambiguousPieces) {
    pieceColors[piece.id] = piece.color;
  }

  // --- 4. Si hay piezas ambiguas, no se puede resolver todavia: hace falta
  //     que el usuario confirme su forma (ver finalizeSolveWithConfirmedPieces) ---
  if (ambiguousPieces.length > 0) {
    warnings.push(
      `Hay ${ambiguousPieces.length} pieza(s) que necesitan confirmacion manual antes de poder resolver.`
    );
    return { solution: null, board, loosePieces, ambiguousPieces, pieceColors, warnings };
  }

  // --- 5. Validar que las celdas cierren antes de llamar al solver ---
  const totalBoardCells = board.rows * board.cols;
  const totalPieceCells = solverPieces.reduce((sum, p) => sum + p.shape.length, 0);
  if (totalPieceCells !== totalBoardCells) {
    warnings.push(
      `Las celdas detectadas (${totalPieceCells}) no coinciden con el tablero (${totalBoardCells} = ` +
      `${board.rows}x${board.cols}). No se puede resolver -- revisar los warnings de deteccion de piezas.`
    );
    return { solution: null, board, loosePieces, ambiguousPieces, pieceColors, warnings };
  }

  // --- 6. Resolver ---
  let solution: PlacementResult[] | null;
  try {
    solution = solve({ rows: board.rows, cols: board.cols, pieces: solverPieces });
  } catch (err) {
    warnings.push(`Error al resolver: ${err instanceof Error ? err.message : String(err)}`);
    solution = null;
  }

  if (!solution) {
    warnings.push("No se encontro ninguna solucion valida para las piezas detectadas.");
  }

  return { solution, board, loosePieces, ambiguousPieces, pieceColors, warnings };
}

/**
 * Una vez que el usuario confirmo a mano la forma correcta de las piezas
 * ambiguas (tocando celdas en la grilla de confirmacion de la UI), esta
 * funcion arma el input final del solver y resuelve -- sin volver a
 * procesar la imagen desde cero.
 *
 * @param result el resultado previo de solveFromImage (con las piezas ambiguas)
 * @param confirmations mapa de id de pieza ambigua -> celdas absolutas confirmadas por el usuario
 */
export function finalizeSolveWithConfirmedPieces(
  result: SolveFromImageResult,
  confirmations: Record<string, [number, number][]>
): { solution: PlacementResult[] | null; warnings: string[] } {
  const warnings: string[] = [];
  const solverPieces: Piece[] = [];

  const placedCells: Record<string, [number, number][]> = {};
  for (let r = 0; r < result.board.rows; r++) {
    for (let c = 0; c < result.board.cols; c++) {
      const id = result.board.cells[r][c];
      if (id === null) continue;
      if (!placedCells[id]) placedCells[id] = [];
      placedCells[id].push([r, c]);
    }
  }
  for (const [id, cells] of Object.entries(placedCells)) {
    solverPieces.push({ id, shape: cells, currentCells: cells });
  }

  for (const piece of result.loosePieces) {
    solverPieces.push({ id: piece.id, shape: piece.shape });
  }

  for (const ambiguous of result.ambiguousPieces) {
    const confirmed = confirmations[ambiguous.id];
    if (!confirmed) {
      warnings.push(`Falta confirmar la forma de la pieza ${ambiguous.id}.`);
      continue;
    }
    if (confirmed.length !== 5) {
      warnings.push(`La forma confirmada para ${ambiguous.id} tiene ${confirmed.length} celdas en vez de 5.`);
      continue;
    }
    const finalPiece = buildLoosePieceFromSelection(ambiguous.id, ambiguous.color, confirmed);
    solverPieces.push({ id: finalPiece.id, shape: finalPiece.shape });
  }

  const totalBoardCells = result.board.rows * result.board.cols;
  const totalPieceCells = solverPieces.reduce((sum, p) => sum + p.shape.length, 0);
  if (totalPieceCells !== totalBoardCells || warnings.length > 0) {
    warnings.push(
      `Las celdas no cierran (${totalPieceCells}/${totalBoardCells}). Revisar las confirmaciones.`
    );
    return { solution: null, warnings };
  }

  let solution: PlacementResult[] | null;
  try {
    solution = solve({ rows: result.board.rows, cols: result.board.cols, pieces: solverPieces });
  } catch (err) {
    warnings.push(`Error al resolver: ${err instanceof Error ? err.message : String(err)}`);
    solution = null;
  }
  if (!solution) warnings.push("No se encontro ninguna solucion valida.");

  return { solution, warnings };
}
