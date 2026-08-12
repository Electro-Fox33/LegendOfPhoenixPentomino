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
// Estan calibradas para capturas de 1080px de ancho. Como distintos
// dispositivos/exportaciones pueden generar capturas a otra resolucion (se
// encontro un caso real de 768px de ancho, misma UI pero escalada), todas
// estas constantes se escalan segun el ancho real de la imagen antes de
// usarlas -- ver `scaleForImage`.
const REFERENCE_WIDTH = 1080;
const BOARD_SEARCH_X: [number, number] = [150, 920];
const BOARD_SEARCH_Y: [number, number] = [400, 1040];
const BACKGROUND_COLOR: RGB = { r: 230, g: 200, b: 188 };
const BACKGROUND_TOLERANCE = 20;
const SAME_PIECE_TOLERANCE = 20;

/** Factor de escala para convertir las constantes (calibradas a 1080px) a la resolucion real de la imagen. */
export function scaleForImage(img: { width: number }): number {
  return img.width / REFERENCE_WIDTH;
}

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
  // El soporte minimo se calcula sobre las lineas que SI encontraron alguna
  // transicion, no sobre el total de lineas escaneadas -- si la ventana de
  // busqueda es mas ancha que el tablero real, muchas lineas no cruzan
  // ningun contenido y no deberian "diluir" el umbral de consistencia.
  const nonEmptyLines = allPoints.filter((p) => p.length > 0).length;
  const minSupport = Math.max(1, Math.floor(nonEmptyLines * 0.5));
  return clusters
    .filter((c) => c.points.length >= minSupport)
    .map((c) => Math.round(c.points.reduce((a, b) => a + b, 0) / c.points.length));
}

/**
 * Heuristica para decidir si una franja de la imagen todavia "parece
 * tablero" (fondo vacio o color de pieza) en vez de fondo de madera o el
 * marco decorativo. Se usa para extender la deteccion mas alla de lo que
 * encontro la busqueda de bordes, para tableros mas grandes que la ventana
 * de busqueda original (calibrada para el caso mas comun).
 */
function looksLikeBoardContent(color: RGB): boolean {
  if (colorDist(color, BACKGROUND_COLOR) <= BACKGROUND_TOLERANCE) return true;
  const { h, s, v } = rgbToHsv(color);
  const looksLikeWood = h >= 15 && h <= 42 && s >= 0.3 && s <= 0.62 && v <= 0.95;
  const looksLikeFrame = (h <= 20 || h >= 340) && s <= 0.5 && v >= 0.85; // rosa/salmon claro del marco
  return !looksLikeWood && !looksLikeFrame;
}

function rgbToHsv({ r, g, b }: RGB): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

/**
 * A partir de una deteccion inicial confiable, prueba si hay una columna o
 * fila mas alla del borde ya encontrado, celda por celda, sampleando
 * directamente en vez de repetir la busqueda de transiciones sobre una
 * ventana mas ancha (eso ultimo demostro traer ruido de la decoracion del
 * juego -- cordones, flores -- que rompe la deteccion de los casos que ya
 * andaban bien).
 */
function extendBoundaries(
  img: DecodedImage,
  colBoundaries: number[],
  rowBoundaries: number[]
): { colBoundaries: number[]; rowBoundaries: number[] } {
  const cols = [...colBoundaries];
  const rows = [...rowBoundaries];
  const avgGap = (arr: number[]) => (arr[arr.length - 1] - arr[0]) / (arr.length - 1);

  const colGap = avgGap(cols);
  const rowCenters = rows.slice(0, -1).map((_, i) => Math.round((rows[i] + rows[i + 1]) / 2));

  function stripLooksLikeBoard(cx: number): boolean {
    const matches = rowCenters.filter((cy) => looksLikeBoardContent(img.getPixel(cx, cy))).length;
    // exigir mayoria de filas (no alcanza con 1 sola coincidencia, que podia
    // ser ruido puntual del grano de la madera)
    return matches > rowCenters.length / 2;
  }

  // extender columnas hacia la derecha
  while (true) {
    const left = cols[cols.length - 1];
    const right = left + colGap;
    if (right > img.width - 10) break;
    const cx = Math.round((left + right) / 2);
    if (!stripLooksLikeBoard(cx)) break;
    cols.push(Math.round(right));
  }

  // extender columnas hacia la izquierda (el juego centra el tablero, asi
  // que uno mas ancho puede empezar mas a la izquierda de lo que la ventana
  // de busqueda original alcanzo a ver, no solo terminar mas a la derecha)
  while (true) {
    const right = cols[0];
    const left = right - colGap;
    if (left < 10) break;
    const cx = Math.round((left + right) / 2);
    if (!stripLooksLikeBoard(cx)) break;
    cols.unshift(Math.round(left));
  }

  return { colBoundaries: cols, rowBoundaries: rows };
}

/** Detecta los bordes de celda (columnas y filas) del tablero dentro de la imagen. */
export function detectBoardGrid(img: DecodedImage) {
  const scale = scaleForImage(img);
  const searchX: [number, number] = [BOARD_SEARCH_X[0] * scale, Math.min(BOARD_SEARCH_X[1] * scale, img.width - 1)];
  const searchY: [number, number] = [BOARD_SEARCH_Y[0] * scale, Math.min(BOARD_SEARCH_Y[1] * scale, img.height - 1)];

  const allColTransitions: number[][] = [];
  for (let y = searchY[0] + 20 * scale; y < searchY[1] - 20 * scale; y += 10 * scale) {
    allColTransitions.push(clusterPoints(scanRowTransitions(img, Math.round(y), Math.round(searchX[0]), Math.round(searchX[1]))));
  }
  const colBoundaries = findConsistentBoundaries(allColTransitions);

  const allRowTransitions: number[][] = [];
  for (let x = searchX[0] + 20 * scale; x < searchX[1] - 20 * scale; x += 10 * scale) {
    allRowTransitions.push(clusterPoints(scanColTransitions(img, Math.round(x), Math.round(searchY[0]), Math.round(searchY[1]))));
  }
  const rowBoundaries = findConsistentBoundaries(allRowTransitions);

  if (colBoundaries.length >= 2 && rowBoundaries.length >= 2) {
    return extendBoundaries(img, colBoundaries, rowBoundaries);
  }

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
