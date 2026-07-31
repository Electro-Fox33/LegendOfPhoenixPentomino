import fs from "node:fs";
import path from "node:path";
import { decodeImage, detectBoardGrid } from "./board-detection";
import { detectLoosePieces } from "./loose-piece-detection";

function cellsKey(cells: [number, number][]): string {
  return [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([r, c]) => `${r},${c}`).join("|");
}

async function testImage(imageName: string, fixtureName: string) {
  console.log(`\n=== ${imageName} ===`);
  const imgPath = path.join(__dirname, "..", "fixtures", "images", imageName);
  const fixturePath = path.join(__dirname, "..", "fixtures", "expected", fixtureName);
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

  const buffer = fs.readFileSync(imgPath);
  const img = await decodeImage(buffer);
  const { rowBoundaries } = detectBoardGrid(img);
  const boardBottom = rowBoundaries[rowBoundaries.length - 1];

  const { pieces, warnings } = detectLoosePieces(img, boardBottom);

  const expectedLoose: [number, number][][] = [];
  for (const [name, cells] of Object.entries(fixture.initialState) as [string, [number, number][]][]) {
    if (name.endsWith("_loose_shape")) expectedLoose.push(cells);
  }
  const expectedKeys = new Set(expectedLoose.map(cellsKey));
  const detectedKeys = new Set(pieces.map((p) => cellsKey(p.shape)));

  const matched = [...expectedKeys].filter((k) => detectedKeys.has(k));
  console.log(`Esperadas: ${expectedLoose.length}  Detectadas: ${pieces.length}  Coinciden exacto: ${matched.length}`);

  for (const cells of expectedLoose) {
    const found = detectedKeys.has(cellsKey(cells));
    console.log(`  ${found ? "OK  " : "FALTA"} ${JSON.stringify(cells)}`);
  }

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const w of warnings) console.log("  -", w);
  }
}

async function main() {
  await testImage("stage_7-2.png", "stage_7-2.json");
  await testImage("stage_7-5.png", "stage_7-5.json");
  await testImage("stage_7-6.png", "stage_7-6.json");
  console.log("\n--- Fin de tests de loose-piece-detection ---");
  console.log("(Este test es informativo, no de pass/fail estricto: la deteccion de");
  console.log(" piezas sueltas todavia tiene la limitacion conocida documentada arriba.)");
}

main();
