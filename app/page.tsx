"use client";

import { useState } from "react";
import PieceConfirmationGrid, { type AmbiguousPieceInput, type RGB } from "@/components/PieceConfirmationGrid";
import SolutionBoard, { type PlacementResult } from "@/components/SolutionBoard";

interface BoardState {
  rows: number;
  cols: number;
  cells: (string | null)[][];
  pieceColors: Record<string, RGB>;
}

interface SolveResponse {
  solution: PlacementResult[] | null;
  board: BoardState;
  ambiguousPieces: AmbiguousPieceInput[];
  pieceColors: Record<string, RGB>;
  warnings: string[];
  error?: string;
}

type Phase = "idle" | "loading" | "needsConfirmation" | "done" | "error";

async function safeParseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `El servidor no devolvió JSON (status ${res.status}). Respuesta: ${text.slice(0, 200)}`
    );
  }
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<SolveResponse | null>(null);
  const [confirmations, setConfirmations] = useState<Record<string, [number, number][]>>({});
  const [finalSolution, setFinalSolution] = useState<PlacementResult[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhase("loading");
    setErrorMessage(null);
    setResult(null);
    setFinalSolution(null);
    setConfirmations({});

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/solve", { method: "POST", body: formData });
      const data: SolveResponse = await safeParseJson(res);

      if (!res.ok) {
        setErrorMessage(data.error ?? "No se pudo procesar la imagen.");
        setPhase("error");
        return;
      }

      setResult(data);
      if (data.solution) {
        setFinalSolution(data.solution);
        setPhase("done");
      } else if (data.ambiguousPieces.length > 0) {
        setPhase("needsConfirmation");
      } else {
        setErrorMessage(data.warnings.join(" "));
        setPhase("error");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      setPhase("error");
    }
  }

  function handlePieceConfirm(pieceId: string, cells: [number, number][]) {
    setConfirmations((prev) => ({ ...prev, [pieceId]: cells }));
  }

  const allConfirmed =
    !!result && result.ambiguousPieces.every((p) => confirmations[p.id]?.length === 5);

  async function handleFinalize() {
    if (!result) return;
    setPhase("loading");
    try {
      const res = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, confirmations }),
      });
      const data = await safeParseJson(res);

      if (!res.ok || !data.solution) {
        setErrorMessage((data.warnings ?? [data.error]).filter(Boolean).join(" "));
        setPhase("error");
        return;
      }

      setFinalSolution(data.solution);
      setPhase("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Error inesperado.");
      setPhase("error");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-10">
      <h1 className="mb-2 text-xl font-semibold text-neutral-900">Resolvedor de Pentominós</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Subí una captura del juego y te muestro cómo acomodar las piezas.
      </p>

      <label className="mb-6 block cursor-pointer rounded-2xl border-2 border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 hover:border-neutral-400">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        {phase === "loading" ? "Procesando…" : "Tocá para elegir o sacar una foto"}
      </label>

      {phase === "error" && errorMessage && (
        <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>
      )}

      {phase === "needsConfirmation" && result && (
        <div className="mb-6 space-y-4">
          <p className="text-sm text-neutral-600">
            {result.ambiguousPieces.length === 1
              ? "Hay 1 pieza que no pude leer con seguridad."
              : `Hay ${result.ambiguousPieces.length} piezas que no pude leer con seguridad.`}{" "}
            Confirmalas antes de resolver.
          </p>
          {result.ambiguousPieces.map((piece) => (
            <PieceConfirmationGrid key={piece.id} piece={piece} onConfirm={handlePieceConfirm} />
          ))}
          <button
            type="button"
            onClick={handleFinalize}
            disabled={!allConfirmed}
            className={[
              "w-full rounded-lg px-4 py-3 text-sm font-medium text-white transition-colors",
              allConfirmed ? "bg-neutral-900 hover:bg-neutral-800" : "bg-neutral-300",
            ].join(" ")}
          >
            Resolver
          </button>
        </div>
      )}

      {phase === "done" && result && finalSolution && (
        <SolutionBoard
          rows={result.board.rows}
          cols={result.board.cols}
          solution={finalSolution}
          pieceColors={result.pieceColors}
        />
      )}
    </main>
  );
}
