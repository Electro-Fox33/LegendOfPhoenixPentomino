/**
 * board-detection.ts
 *
 * Detecta el tablero en un screenshot del juego y clasifica cada celda:
 * a que pieza pertenece (por color) o si esta vacia.
 *
 * Validado al 100% contra los 3 fixtures verificados (stage_7-2, 7-5, 7-6):
 * reproduce exactamente las mismas piezas/posiciones que confirmamos a mano.
 */

import sharp from "sharp";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface BoardState {
  rows: number;
  cols: number;
  /** cells[r][c] = id de pieza si esa celda ya tiene una pieza puesta, o null si esta vacia. */
  cells: (string | null)[][];
  /** Color promedio de cada id de pieza detectado (para visualizacion). */
  pieceColors: Record<string, RGB>;
}

// --- Constantes derivadas de analizar screenshots reales del juego ---
const BOARD_SEARCH_X: [number, number] = [150, 920];
const BOARD_SEARCH_Y: [number, number] = [400, 1040];
const BACKGROUND_COLOR: RGB = { r: 230, g: 200, b: 188 };
const BACKGROUND_TOLERANCE = 20;
const SAME_PIECE_TOLERANCE = 20;

function colorDist(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

export interface DecodedImage {
  width: number;
  height: number;
  getPixel(x: number, y: number): RGB;
}

export async function decodeImage(buffer: Buffer): Promise<DecodedImage> {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  return {
    width,
    height,
    getPixel(x, y) {
      const idx = (y * width + x) * channels;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    },
  };
}

function scanRowTransitions(img: DecodedImage, y: number, xStart: number, xEnd: number, threshold = 25): number[] {
  const points: number[] = [];
  let prev: RGB | null = null;
  for (let x = xStart; x < xEnd; x++) {
    const px = img.getPixel(x, y);
    if (prev && colorDist(px, prev) > threshold) points.push(x);
    prev = px;
  }
  return points;
}

function scanColTransitions(img: DecodedImage, x: number, yStart: number, yEnd: number, threshold = 25): number[] {
  const points: number[] = [];
  let prev: RGB | null = null;
  for (let y = yStart; y < yEnd; y++) {
    const px = img.getPixel(x, y);
    if (prev && colorDist(px, prev) > threshold) points.push(y);
    prev = px;
  }
  return points;
}

function clusterPoints(points: number[], minGap = 8): number[] {
  if (points.length === 0) return [];
  const clusters: number[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const last = clusters[clusters.length - 1];
    if (points[i] - last[last.length - 1] <= minGap) last.push(points[i]);
    else clusters.push([points[i]]);
  }
  return clusters.map((c) => Math.round(c.reduce((a, b) => a + b, 0) / c.length));
}

/**
 * Se queda con los boundaries que se repiten consistentemente entre muchas
 * lineas de escaneo (esto filtra el ruido del marco decorativo del tablero,
 * que genera transiciones espurias solo en algunas lineas puntuales).
 */
function findConsistentBoundaries(allPoints: number[][], tolerance = 15): number[] {
  const flat = allPoints.flat().sort((a, b) => a - b);
  if (flat.length === 0) return [];
  const clusters: { points: number[] }[] = [];
  for (const p of flat) {
    const last = clusters[clusters.length - 1];
    if (last && p - last.points[last.points.length - 1] <= tolerance) last.points.push(p);
    else clusters.push({ points: [p] });
  }
  const minSupport = Math.floor(allPoints.length * 0.5);
  return clusters
    .filter((c) => c.points.length >= minSupport)
    .map((c) => Math.round(c.points.reduce((a, b) => a + b, 0) / c.points.length));
}

/** Detecta los bordes de celda (columnas y filas) del tablero dentro de la imagen. */
export function detectBoardGrid(img: DecodedImage) {
  const allColTransitions: number[][] = [];
  for (let y = BOARD_SEARCH_Y[0] + 20; y < BOARD_SEARCH_Y[1] - 20; y += 10) {
    allColTransitions.push(clusterPoints(scanRowTransitions(img, y, BOARD_SEARCH_X[0], BOARD_SEARCH_X[1])));
  }
  const colBoundaries = findConsistentBoundaries(allColTransitions);

  const allRowTransitions: number[][] = [];
  for (let x = BOARD_SEARCH_X[0] + 20; x < BOARD_SEARCH_X[1] - 20; x += 10) {
    allRowTransitions.push(clusterPoints(scanColTransitions(img, x, BOARD_SEARCH_Y[0], BOARD_SEARCH_Y[1])));
  }
  const rowBoundaries = findConsistentBoundaries(allRowTransitions);

  return { colBoundaries, rowBoundaries };
}

/** Samplea el color en el centro de cada celda y agrupa colores similares en la misma pieza. */
export function classifyBoard(img: DecodedImage, rowBoundaries: number[], colBoundaries: number[]): BoardState {
  const rows = rowBoundaries.length - 1;
  const cols = colBoundaries.length - 1;
  const cells: (string | null)[][] = [];
  const pieceColors: RGB[] = [];
  const pieceColorMap: Record<string, RGB> = {};

  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    const cy = Math.round((rowBoundaries[r] + rowBoundaries[r + 1]) / 2);
    for (let c = 0; c < cols; c++) {
      const cx = Math.round((colBoundaries[c] + colBoundaries[c + 1]) / 2);
      const color = img.getPixel(cx, cy);

      if (colorDist(color, BACKGROUND_COLOR) <= BACKGROUND_TOLERANCE) {
        row.push(null);
        continue;
      }
      let matchedIdx = -1;
      for (let i = 0; i < pieceColors.length; i++) {
        if (colorDist(color, pieceColors[i]) <= SAME_PIECE_TOLERANCE) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx === -1) {
        pieceColors.push(color);
        matchedIdx = pieceColors.length - 1;
      }
      const id = `board_piece_${matchedIdx}`;
      pieceColorMap[id] = pieceColors[matchedIdx];
      row.push(id);
    }
    cells.push(row);
  }

  return { rows, cols, cells, pieceColors: pieceColorMap };
}

/** Punto de entrada: detecta y clasifica el tablero completo a partir de la imagen. */
export async function detectBoard(buffer: Buffer): Promise<BoardState> {
  const img = await decodeImage(buffer);
  const { colBoundaries, rowBoundaries } = detectBoardGrid(img);
  if (colBoundaries.length < 2 || rowBoundaries.length < 2) {
    throw new Error("No se pudo detectar el tablero en la imagen.");
  }
  return classifyBoard(img, rowBoundaries, colBoundaries);
}
