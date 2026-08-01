/**
 * loose-piece-detection.ts
 *
 * Detecta las piezas sueltas debajo del tablero (las que el usuario todavia
 * no coloco) a partir del screenshot.
 *
 * A diferencia del tablero, aca no hay una grilla ya dibujada: hay que
 * encontrar la alineacion real de las piezas (su "fase" dentro de la grilla
 * de 120px) y despues agrupar celdas contiguas del mismo color en piezas.
 *
 * Resultado en los 3 fixtures verificados: 7 de 8 piezas sueltas detectadas
 * exactas.
 *
 * PROBLEMAS ENCONTRADOS Y RESUELTOS:
 *  - Piezas de tono calido (ej. naranja) se confundian con la madera de
 *    fondo por tener hue/saturacion parecidos. Se resolvio agregando un
 *    chequeo de Value/brillo (HSV): la madera nunca es tan brillante como
 *    una pieza calida (V maximo observado en madera ~0.84-0.92 segun la
 *    imagen, vs V~0.96+ en piezas calidas).
 *  - Algunas piezas tienen un brillo/highlight blanco dibujado en el medio,
 *    que hacia que el pixel central sampleado no representara el color real
 *    de la celda. Se resolvio detectando cuando el pixel central es muy
 *    claro y desaturado, y resampleando con un offset chico en ese caso.
 *
 * LIMITACION CONOCIDA (1 caso de 8 en los fixtures, no resuelta):
 * Una celda de la pieza roja en stage 7-6 tiene un brillo que cubre un area
 * mas amplia que un solo pixel (no un punto, sino una zona con gradiente),
 * y el offset de resampleo cae todavia dentro de esa zona lavada. Se probo
 * ademas: (a) promediar/tomar mediana de muchos puntos por celda -- genero
 * mezclas incorrectas con piezas vecinas cuando estan pegadas entre si; (b)
 * agrandar la tolerancia de conectividad de color -- no existe un valor que
 * capture exactamente esa celda sin de paso fusionar una celda de mas; (c)
 * "relleno de huecos" (si una celda esta rodeada por una sola pieza, asumir
 * que es parte de ella) -- genero mas falsos positivos de los que arreglaba.
 * El modulo SI avisa cuando esto pasa: si una pieza detectada no tiene
 * exactamente 5 celdas, se agrega un warning para revision manual en vez de
 * fallar en silencio.
 *
 * Proxima idea a probar (no implementada): en vez de un solo punto de
 * resampleo, votar entre varios candidatos chicos y quedarse con el color
 * mas frecuente/saturado, en vez de el primero que no sea highlight.
 */

import type { DecodedImage, RGB } from "./board-detection";

export interface LoosePiece {
  id: string;
  color: RGB;
  /** Celdas relativas normalizadas (la celda mas arriba-izquierda queda en fila/columna 0). */
  shape: [number, number][];
}

/**
 * Una pieza que se detecto pero con una cantidad de celdas distinta a 5 --
 * no se puede confiar en ella automaticamente. Trae la info necesaria para
 * que la UI muestre una grilla chica alrededor de la zona y el usuario
 * confirme/corrija a mano cuales celdas son parte de la pieza.
 */
export interface AmbiguousPiece {
  id: string;
  color: RGB;
  /** Celdas detectadas actualmente (coords absolutas en la grilla de piezas sueltas). */
  detectedCells: [number, number][];
  /** Region candidata (bounding box expandido en 1 celda de margen) para mostrar en la UI. */
  region: { minRow: number; maxRow: number; minCol: number; maxCol: number };
  /** Color de cada celda dentro de la region (para pintar la grilla de confirmacion). null = fondo/vacio. */
  regionColors: (RGB | null)[][];
}

export interface LoosePieceDetectionResult {
  pieces: LoosePiece[];
  ambiguousPieces: AmbiguousPiece[];
  warnings: string[];
}

/**
 * Construye la pieza final a partir de la seleccion corregida manualmente
 * por el usuario (celdas absolutas dentro de la region que aparecian en
 * AmbiguousPiece.region).
 */
export function buildLoosePieceFromSelection(
  id: string,
  color: RGB,
  selectedAbsoluteCells: [number, number][]
): LoosePiece {
  const minR = Math.min(...selectedAbsoluteCells.map((c) => c[0]));
  const minC = Math.min(...selectedAbsoluteCells.map((c) => c[1]));
  const shape = selectedAbsoluteCells
    .map(([r, c]) => [r - minR, c - minC] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { id, color, shape };
}

const CELL_SIZE = 120;
const LOOSE_AREA_X: [number, number] = [40, 1020];
const LOOSE_AREA_Y_END = 2100;
const LOOSE_CONNECTIVITY_TOLERANCE = 90;

function colorDist(a: RGB, b: RGB): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
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

/** Heuristica: hue/saturacion/brillo tipicos de la madera/tatami de fondo del juego. */
function isWoodOrDecoration(color: RGB): boolean {
  const { h, s, v } = rgbToHsv(color);
  const isWoodHue = h >= 15 && h <= 42;
  const isWoodSat = s >= 0.3 && s <= 0.62;
  // La madera nunca es tan brillante como una pieza de color calido (naranja/amarillo):
  // en las muestras reales, el maximo V de la madera fue ~0.84, mientras que las
  // piezas calidas rondan V~0.95+. Este umbral separa limpiamente ambos casos.
  const isTooBrightForWood = v > 0.93;
  if (isWoodHue && isWoodSat && !isTooBrightForWood) return true;
  if (s < 0.15) return true; // blancos/grises desaturados (origami, iconos, brillos)
  return false;
}

function scanRowTransitions(img: DecodedImage, y: number, xStart: number, xEnd: number, threshold = 30): number[] {
  const points: number[] = [];
  let prev: RGB | null = null;
  for (let x = xStart; x < xEnd; x++) {
    const px = img.getPixel(x, y);
    if (prev && colorDist(px, prev) > threshold) points.push(x);
    prev = px;
  }
  return points;
}

function scanColTransitions(img: DecodedImage, x: number, yStart: number, yEnd: number, threshold = 30): number[] {
  const points: number[] = [];
  let prev: RGB | null = null;
  for (let y = yStart; y < yEnd; y++) {
    const px = img.getPixel(x, y);
    if (prev && colorDist(px, prev) > threshold) points.push(y);
    prev = px;
  }
  return points;
}

/**
 * Vota cual "fase" (offset dentro de un ciclo de 120px) es la mas frecuente
 * entre todos los puntos de transicion detectados, para alinear la grilla
 * virtual exactamente con los bordes reales de las piezas.
 */
function findGridPhase(allPoints: number[]): number {
  const votes = new Map<number, number>();
  for (const p of allPoints) {
    const phase = ((p % CELL_SIZE) + CELL_SIZE) % CELL_SIZE;
    for (let d = -3; d <= 3; d++) {
      const key = ((phase + d) + CELL_SIZE) % CELL_SIZE;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }
  let bestPhase = 0, bestVotes = -1;
  for (const [phase, count] of votes) {
    if (count > bestVotes) {
      bestVotes = count;
      bestPhase = phase;
    }
  }
  return bestPhase;
}

/**
 * Samplea el color de una celda. Si el punto central resulta ser un brillo/
 * highlight blanco puntual que el juego dibuja en el medio de algunas piezas
 * (muy desaturado y muy claro), se descarta ese punto y se prueba con un
 * offset chico en su lugar -- sin promediar muchos puntos, para no arriesgarse
 * a cruzar a una celda vecina cuando las piezas estan pegadas entre si.
 */
function sampleCellColorRobust(img: DecodedImage, cx: number, cy: number): RGB {
  const center = img.getPixel(cx, cy);
  const { s, v } = rgbToHsv(center);
  const looksLikeHighlight = s < 0.25 && v > 0.9;
  if (!looksLikeHighlight) return center;

  // probar un par de offsets chicos (bien adentro de la celda) hasta encontrar
  // uno que no sea el mismo brillo puntual
  const fallbackOffsets: [number, number][] = [[10, 10], [-10, -10], [10, -10], [-10, 10]];
  for (const [dx, dy] of fallbackOffsets) {
    const candidate = img.getPixel(cx + dx, cy + dy);
    const { s: cs, v: cv } = rgbToHsv(candidate);
    if (!(cs < 0.25 && cv > 0.9)) return candidate;
  }
  return center; // si todos los offsets tambien son brillo, devolver el original
}

/**
 * Detecta las piezas sueltas debajo del tablero.
 * @param img imagen ya decodificada
 * @param boardBottom coordenada Y del borde inferior del tablero (para saber donde empezar a buscar)
 */
export function detectLoosePieces(img: DecodedImage, boardBottom: number): LoosePieceDetectionResult {
  const warnings: string[] = [];
  const y0 = boardBottom + 10;
  const y1 = Math.min(LOOSE_AREA_Y_END, img.height);
  const x0 = LOOSE_AREA_X[0];
  const x1 = Math.min(LOOSE_AREA_X[1], img.width);

  const allXTransitions: number[] = [];
  for (let y = y0; y < y1; y += 5) allXTransitions.push(...scanRowTransitions(img, y, x0, x1));
  const allYTransitions: number[] = [];
  for (let x = x0; x < x1; x += 5) allYTransitions.push(...scanColTransitions(img, x, y0, y1));

  const xPhase = findGridPhase(allXTransitions);
  const yPhase = findGridPhase(allYTransitions);

  const colLines: number[] = [];
  for (let x = xPhase % CELL_SIZE; x < x1; x += CELL_SIZE) if (x >= x0) colLines.push(x);
  const rowLines: number[] = [];
  for (let y = yPhase % CELL_SIZE; y < y1; y += CELL_SIZE) if (y >= y0) rowLines.push(y);

  const rows = rowLines.length - 1;
  const cols = colLines.length - 1;
  if (rows < 1 || cols < 1) {
    warnings.push("No se pudo determinar la grilla de piezas sueltas.");
    return { pieces: [], ambiguousPieces: [], warnings };
  }

  const grid: (RGB | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (RGB | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const cx = Math.round((colLines[c] + colLines[c + 1]) / 2);
      const cy = Math.round((rowLines[r] + rowLines[r + 1]) / 2);
      const color = sampleCellColorRobust(img, cx, cy);
      row.push(isWoodOrDecoration(color) ? null : color);
    }
    grid.push(row);
  }

  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const pieceCellSets: { cells: [number, number][]; refColor: RGB }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c] || visited[r][c]) continue;
      const refColor = grid[r][c]!;
      const stack: [number, number][] = [[r, c]];
      visited[r][c] = true;
      const cells: [number, number][] = [];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        cells.push([cr, cc]);
        for (const [nr, nc] of [[cr + 1, cc], [cr - 1, cc], [cr, cc + 1], [cr, cc - 1]] as [number, number][]) {
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || visited[nr][nc]) continue;
          const neighborColor = grid[nr][nc];
          if (neighborColor && colorDist(neighborColor, refColor) < LOOSE_CONNECTIVITY_TOLERANCE) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (cells.length < 3) continue; // ruido de 1-2 celdas sueltas

      pieceCellSets.push({ cells, refColor });
    }
  }

  const pieces: LoosePiece[] = [];
  const ambiguousPieces: AmbiguousPiece[] = [];
  let pieceCounter = 0;
  let ambiguousCounter = 0;

  for (const { cells, refColor } of pieceCellSets) {
    if (cells.length === 5) {
      const minR = Math.min(...cells.map((c) => c[0]));
      const minC = Math.min(...cells.map((c) => c[1]));
      const shape = cells
        .map(([r2, c2]) => [r2 - minR, c2 - minC] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      pieces.push({ id: `loose_piece_${pieceCounter++}`, color: refColor, shape });
      continue;
    }

    warnings.push(
      `Una pieza suelta detectada tiene ${cells.length} celdas en vez de 5 ` +
      `(color aprox. rgb(${refColor.r},${refColor.g},${refColor.b})). ` +
      `Se pide confirmacion manual de la forma antes de resolver.`
    );

    // region candidata: bounding box de lo detectado + 1 celda de margen por cada lado
    const minRow = Math.max(0, Math.min(...cells.map((c) => c[0])) - 1);
    const maxRow = Math.min(rows - 1, Math.max(...cells.map((c) => c[0])) + 1);
    const minCol = Math.max(0, Math.min(...cells.map((c) => c[1])) - 1);
    const maxCol = Math.min(cols - 1, Math.max(...cells.map((c) => c[1])) + 1);

    const regionColors: (RGB | null)[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: (RGB | null)[] = [];
      for (let c = minCol; c <= maxCol; c++) row.push(grid[r][c]);
      regionColors.push(row);
    }

    ambiguousPieces.push({
      id: `ambiguous_piece_${ambiguousCounter++}`,
      color: refColor,
      detectedCells: cells,
      region: { minRow, maxRow, minCol, maxCol },
      regionColors,
    });
  }

  return { pieces, ambiguousPieces, warnings };
}
