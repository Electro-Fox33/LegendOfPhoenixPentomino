import fs from "node:fs";
import path from "node:path";
import { solveFromImage } from "./solve-from-image";

async function testImage(imageName: string) {
  console.log(`\n=== ${imageName} ===`);
  const imgPath = path.join(__dirname, "..", "fixtures", "images", imageName);
  const buffer = fs.readFileSync(imgPath);

  const result = await solveFromImage(buffer);

  console.log(`Tablero: ${result.board.rows}x${result.board.cols}`);
  console.log(`Piezas ya puestas: ${Object.keys(result.board.pieceColors).length}`);
  console.log(`Piezas sueltas detectadas: ${result.loosePieces.length}`);

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const w of result.warnings) console.log("  -", w);
  }

  if (result.solution) {
    console.log(`✅ Solucion encontrada (${result.solution.length} piezas ubicadas)`);
    // sanity check basico: cobertura completa sin superposiciones
    const seen = new Set<string>();
    let overlap = false;
    for (const p of result.solution) {
      for (const [r, c] of p.cells) {
        const key = `${r},${c}`;
        if (seen.has(key)) overlap = true;
        seen.add(key);
      }
    }
    const totalCells = result.board.rows * result.board.cols;
    console.log(
      `   cobertura: ${seen.size}/${totalCells} celdas, superposiciones: ${overlap ? "SI (mal)" : "no"}`
    );
  } else {
    console.log("❌ No se encontro solucion (ver warnings arriba)");
  }
}

async function main() {
  await testImage("stage_7-2.png");
  await testImage("stage_7-5.png");
  await testImage("stage_7-6.png");
  console.log("\n--- Fin del test end-to-end ---");
}

main();
