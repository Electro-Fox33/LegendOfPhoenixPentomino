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

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-medium text-neutral-900">Solución</h3>

      <div
        className="mx-auto grid w-fit gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const pieceId = cellToPiece.get(`${r},${c}`);
            const color = pieceId ? pieceColors[pieceId] : undefined;
            const isUnchanged = pieceId ? unchangedSet.has(pieceId) : false;

            return (
              <div
                key={`${r},${c}`}
                className={[
                  "h-12 w-12 rounded-lg sm:h-14 sm:w-14",
                  isUnchanged ? "ring-2 ring-emerald-500 ring-offset-2" : "",
                ].join(" ")}
                style={{ backgroundColor: color ? rgbToCss(color) : "#e5e5e5" }}
                title={pieceId}
              />
            );
          })
        )}
      </div>

      {unchangedPieceIds.length > 0 && (
        <p className="mt-4 text-sm text-neutral-500">
          <span className="mr-2 inline-block h-3 w-3 rounded ring-2 ring-emerald-500 ring-offset-2 align-middle" />
          Las piezas marcadas ya estaban bien puestas, no hace falta moverlas.
        </p>
      )}
    </div>
  );
}
