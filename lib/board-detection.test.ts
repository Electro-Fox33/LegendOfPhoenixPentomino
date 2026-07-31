import fs from "node:fs";
import path from "node:path";
import { detectBoard } from "./board-detection";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FALLO:", msg);
    process.exitCode = 1;
  } else {
    console.log("OK:", msg);
  }
}

function cellsKey(cells: [number, number][]): string {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([r, c]) => `${r},${c}`).join("|");
}

async function testImage(imageName: string, fixtureName: string) {
  console.log(`\n=== ${imageName} ===`);
  const imgPath = path.join(__dirname, "..", "fixtures", "images", imageName);
  const fixturePath = path.join(__dirname, "..", "fixtures", "expected", fixtureName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const buffer = fs.readFileSync(imgPath);
  const board = await detectBoard(buffer);

  assert(
    board.rows === fixture.boardRows && board.cols === fixture.boardCols,
    `dimensiones del tablero correctas (${board.rows}x${board.cols})`
  );

  const expectedPlaced: Record<string, [number, number][]> = {};
  for (const [name, cells] of Object.entries(fixture.initialState) as [string, [number, number][]][]) {
    if (!name.endsWith("_loose_shape")) expectedPlaced[name] = cells;
  }

  const detectedPlaced: Record<string, [number, number][]> = {};
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const id = board.cells[r][c];
      if (id === null) continue;
      if (!detectedPlaced[id]) detectedPlaced[id] = [];
      detectedPlaced[id].push([r, c]);
    }
  }

  const expectedKeys = new Set(Object.values(expectedPlaced).map(cellsKey));
  const detectedKeys = new Set(Object.values(detectedPlaced).map(cellsKey));

  assert(
    expectedKeys.size === detectedKeys.size && [...expectedKeys].every((k) => detectedKeys.has(k)),
    `las piezas ya colocadas coinciden exactamente (${expectedKeys.size} piezas)`
  );
}

async function main() {
  await testImage("stage_7-2.png", "stage_7-2.json");
  await testImage("stage_7-5.png", "stage_7-5.json");
  await testImage("stage_7-6.png", "stage_7-6.json");
  console.log("\n--- Fin de tests de board-detection ---");
}

main();
