import { normalize, allOrientations, translate, shapeBounds, Cell } from "./pentomino-shapes";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FALLO:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

// --- Test 1: normalize corre el shape para que empiece en (0,0) ---
const raw: Cell[] = [[3, 1], [4, 0], [4, 1], [4, 2], [4, 3]]; // blue_Y de stage 7-6
const norm = normalize(raw);
assert(
  JSON.stringify(norm) === JSON.stringify([[0,1],[1,0],[1,1],[1,2],[1,3]]),
  "normalize traslada correctamente al origen"
);

// --- Test 2: cada pieza tiene exactamente 5 celdas en cada orientacion ---
const pieces: Record<string, Cell[]> = {
  yellow_L_stage72: [[0,0],[0,1],[0,2],[0,3],[1,1]],
  magenta_U_stage72: [[1,0],[1,2],[2,0],[2,1],[2,2]],
  purple_N_stage72: [[0,1],[1,1],[2,0],[2,1],[3,0]],
};

for (const [name, cells] of Object.entries(pieces)) {
  const orientations = allOrientations(cells);
  for (const o of orientations) {
    assert(o.length === 5, `${name}: cada orientacion tiene 5 celdas`);
  }
}

// --- Test 3: numero de orientaciones unicas esperado ---
// Forma asimetrica (sin ningun eje/rotacion de simetria) -> 8 orientaciones unicas.
// La pieza N (purple_N_stage72) es asimetrica -> esperamos 8.
const nOrientations = allOrientations(pieces.purple_N_stage72);
assert(nOrientations.length === 8, `pieza N tiene 8 orientaciones unicas (obtuvo ${nOrientations.length})`);

// La pieza U (magenta_U_stage72) tiene un eje de simetria (espejo vertical) -> esperamos 4.
const uOrientations = allOrientations(pieces.magenta_U_stage72);
assert(uOrientations.length === 4, `pieza U tiene 4 orientaciones unicas (obtuvo ${uOrientations.length})`);

// --- Test 4: translate mueve la forma al offset correcto ---
const translated = translate(normalize(raw), 2, 3);
assert(
  JSON.stringify(translated) === JSON.stringify([[2,4],[3,3],[3,4],[3,5],[3,6]]),
  "translate aplica el offset correctamente"
);

// --- Test 5: shapeBounds calcula bien el bounding box ---
const bounds = shapeBounds(normalize(pieces.yellow_L_stage72));
assert(
  bounds.height === 2 && bounds.width === 4,
  `shapeBounds correcto para yellow_L (obtuvo ${JSON.stringify(bounds)})`
);

console.log("\n--- Fin de tests ---");
