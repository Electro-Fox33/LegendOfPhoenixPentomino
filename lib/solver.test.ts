import fs from "node:fs";
import path from "node:path";
import { solve, Piece, PlacementResult, isUnchanged } from "./solver";
import { Cell } from "./pentomino-shapes";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FALLO:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

interface FixtureJson {
  boardRows: number;
  boardCols: number;
  initialState: Record<string, Cell[]>;
  solution: { grid: string[][]; unchangedPieces?: string[] };
}

function loadFixture(name: string): FixtureJson {
  const fixturePath = path.join(__dirname, "..", "fixtures", "expected", name);
  return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function buildPieces(fixture: FixtureJson): Piece[] {
  return Object.entries(fixture.initialState).map(([name, cells]) => {
    const isLoose = name.endsWith("_loose_shape");
    const piece: Piece = { id: name, shape: cells };
    if (!isLoose) {
      piece.currentCells = cells;
    }
    return piece;
  });
}

function validateSolution(
  fixtureName: string,
  rows: number,
  cols: number,
  pieces: Piece[],
  result: PlacementResult[] | null
) {
  assert(result !== null, `${fixtureName}: se encontro una solucion`);
  if (!result) return;

  // cada pieza tiene 5 celdas
  assert(
    result.every((r) => r.cells.length === 5),
    `${fixtureName}: cada pieza tiene exactamente 5 celdas en la solucion`
  );

  // todas las piezas de entrada estan representadas
  assert(
    result.length === pieces.length,
    `${fixtureName}: la solucion incluye las ${pieces.length} piezas`
  );

  // cobertura completa sin superposiciones
  const seen = new Set<string>();
  let overlap = false;
  for (const r of result) {
    for (const [row, col] of r.cells) {
      const key = `${row},${col}`;
      if (seen.has(key)) overlap = true;
      seen.add(key);
    }
  }
  assert(!overlap, `${fixtureName}: no hay celdas superpuestas`);
  assert(
    seen.size === rows * cols,
    `${fixtureName}: la solucion cubre el tablero completo (${seen.size}/${rows * cols})`
  );

  // celdas dentro de los limites del tablero
  const inBounds = result.every((r) =>
    r.cells.every(([row, col]) => row >= 0 && row < rows && col >= 0 && col < cols)
  );
  assert(inBounds, `${fixtureName}: todas las celdas estan dentro del tablero`);
}

// --- Correr contra los 3 fixtures verificados ---
for (const name of ["stage_7-2.json", "stage_7-5.json", "stage_7-6.json"]) {
  const fixture = loadFixture(name);
  const pieces = buildPieces(fixture);
  const result = solve({ rows: fixture.boardRows, cols: fixture.boardCols, pieces });
  validateSolution(name, fixture.boardRows, fixture.boardCols, pieces, result);

  // Reportar que piezas quedaron sin cambios (informativo, no siempre debe ser >0)
  if (result) {
    const unchanged = pieces
      .filter((p) => p.currentCells)
      .map((p) => {
        const r = result.find((x) => x.pieceId === p.id)!;
        return { id: p.id, unchanged: isUnchanged(p, r) };
      });
    console.log(`  -> ${name} piezas ya puestas:`, unchanged);
  }
}

// --- Test especifico: stage 7-6 DEBE poder dejar blue_Y sin cambios ---
// (ya probamos matematicamente en Python que existe al menos una solucion
// completa que preserva blue_Y; el heuristico de "posicion actual primero"
// deberia encontrar justamente esa.)
{
  const fixture = loadFixture("stage_7-6.json");
  const pieces = buildPieces(fixture);
  const result = solve({ rows: fixture.boardRows, cols: fixture.boardCols, pieces });
  const bluePiece = pieces.find((p) => p.id === "blue_Y")!;
  const blueResult = result?.find((r) => r.pieceId === "blue_Y");
  assert(
    !!blueResult && isUnchanged(bluePiece, blueResult),
    "stage_7-6: el heuristico logra dejar blue_Y sin cambios (igual que la solucion verificada a mano)"
  );
}

console.log("\n--- Fin de tests del solver ---");
