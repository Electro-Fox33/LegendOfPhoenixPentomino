"use client";

import { useState } from "react";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface AmbiguousPieceInput {
  id: string;
  color: RGB;
  detectedCells: [number, number][];
  region: { minRow: number; maxRow: number; minCol: number; maxCol: number };
  regionColors: (RGB | null)[][];
}

interface PieceConfirmationGridProps {
  piece: AmbiguousPieceInput;
  onConfirm: (pieceId: string, selectedCells: [number, number][]) => void;
  onCancel?: () => void;
}

const REQUIRED_CELLS = 5;

function rgbToCss({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}

export default function PieceConfirmationGrid({ piece, onConfirm, onCancel }: PieceConfirmationGridProps) {
  const { region, regionColors, detectedCells, color } = piece;

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(detectedCells.map(([r, c]) => cellKey(r, c)))
  );

  const count = selected.size;
  const isValid = count === REQUIRED_CELLS;

  function toggleCell(r: number, c: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = cellKey(r, c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    if (!isValid) return;
    const cells: [number, number][] = [...selected].map((key) => {
      const [r, c] = key.split(",").map(Number);
      return [r, c];
    });
    onConfirm(piece.id, cells);
  }

  const rows = regionColors.length;
  const cols = regionColors[0]?.length ?? 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: rgbToCss(color) }}
          aria-hidden
        />
        <h3 className="text-sm font-medium text-neutral-900">
          Confirmá la forma de esta pieza
        </h3>
      </div>

      <p className="mb-4 text-sm text-neutral-500">
        No pudimos leer esta pieza con seguridad. Tocá las celdas para marcar
        exactamente las 5 que forman la pieza.
      </p>

      <div
        className="mx-auto grid w-fit gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="group"
        aria-label="Grilla de confirmación de pieza"
      >
        {regionColors.map((row, rIdx) =>
          row.map((cellColor, cIdx) => {
            const absR = region.minRow + rIdx;
            const absC = region.minCol + cIdx;
            const key = cellKey(absR, absC);
            const isSelected = selected.has(key);

            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCell(absR, absC)}
                aria-pressed={isSelected}
                aria-label={`Celda fila ${absR}, columna ${absC}${isSelected ? ", seleccionada" : ""}`}
                className={[
                  "h-12 w-12 rounded-lg border-2 transition-colors sm:h-14 sm:w-14",
                  isSelected ? "border-neutral-900" : "border-neutral-200",
                ].join(" ")}
                style={{
                  backgroundColor: cellColor
                    ? isSelected
                      ? rgbToCss(cellColor)
                      : `rgba(${cellColor.r}, ${cellColor.g}, ${cellColor.b}, 0.35)`
                    : isSelected
                      ? rgbToCss(color)
                      : "transparent",
                }}
              />
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span
          className={[
            "text-sm font-medium tabular-nums",
            isValid ? "text-emerald-600" : "text-neutral-500",
          ].join(" ")}
        >
          {count}/{REQUIRED_CELLS} celdas seleccionadas
        </span>

        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            className={[
              "rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors",
              isValid ? "bg-neutral-900 hover:bg-neutral-800" : "bg-neutral-300",
            ].join(" ")}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
