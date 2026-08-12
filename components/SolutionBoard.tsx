export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PlacementResult {
  pieceId: string;
  cells: [number, number][];
}

interface SolutionBoardProps {
  rows: number;
  cols: number;
  solution: PlacementResult[];
  pieceColors: Record<string, RGB>;
  /** ids de piezas que ya estaban bien puestas y no hace falta mover. */
  unchangedPieceIds?: string[];
}

const SEAM_WIDTH = 4; // px de separacion visible SOLO entre piezas distintas
const SEAM_COLOR = "#ffffff"; // debe coincidir con el fondo de la tarjeta

function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export default function SolutionBoard({
  rows,
  cols,
  solution,
  pieceColors,
  unchangedPieceIds = [],
}: SolutionBoardProps) {
  const cellToPiece = new Map<string, string>();
  for (const placement of solution) {
    for (const [r, c] of placement.cells) {
      cellToPiece.set(`${r},${c}`, placement.pieceId);
    }
  }
  const unchangedSet = new Set(unchangedPieceIds);

  function pieceAt(r: number, c: number): string | undefined {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return undefined;
    return cellToPiece.get(`${r},${c}`);
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-neutral-900">Solución</h3>

      <div
        className="mx-auto grid w-fit overflow-hidden rounded-xl"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const pieceId = pieceAt(r, c);
            const color = pieceId ? pieceColors[pieceId] : undefined;
            const isUnchanged = pieceId ? unchangedSet.has(pieceId) : false;

            // Solo mostrar "costura" (separacion) hacia un vecino que sea de
            // una pieza distinta (o no haya pieza) -- entre celdas de la
            // misma pieza no se ve ningun borde, para que se lean como un
            // bloque solido, igual que en el juego real.
            const sameTop = pieceAt(r - 1, c) === pieceId;
            const sameBottom = pieceAt(r + 1, c) === pieceId;
            const sameLeft = pieceAt(r, c - 1) === pieceId;
            const sameRight = pieceAt(r, c + 1) === pieceId;

            return (
              <div
                key={`${r},${c}`}
                className="relative h-11 w-11 sm:h-13 sm:w-13"
                style={{
                  backgroundColor: color ? rgbToCss(color) : "#e5e5e5",
                  borderTop: sameTop ? "none" : `${SEAM_WIDTH}px solid ${SEAM_COLOR}`,
                  borderBottom: sameBottom ? "none" : `${SEAM_WIDTH}px solid ${SEAM_COLOR}`,
                  borderLeft: sameLeft ? "none" : `${SEAM_WIDTH}px solid ${SEAM_COLOR}`,
                  borderRight: sameRight ? "none" : `${SEAM_WIDTH}px solid ${SEAM_COLOR}`,
                }}
                title={pieceId}
              >
                {isUnchanged && (
                  <span className="pointer-events-none absolute inset-1 rounded-md ring-2 ring-emerald-500" />
                )}
              </div>
            );
          })
        )}
      </div>

      {unchangedPieceIds.length > 0 && (
        <p className="mt-4 text-sm text-neutral-500">
          <span className="mr-2 inline-block h-3 w-3 rounded ring-2 ring-emerald-500 align-middle" />
          Las piezas marcadas ya estaban bien puestas, no hace falta moverlas.
        </p>
      )}
    </div>
  );
}
