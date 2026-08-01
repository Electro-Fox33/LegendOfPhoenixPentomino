import { finalizeSolveWithConfirmedPieces, SolveFromImageResult } from "@/lib/solve-from-image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      result: SolveFromImageResult;
      confirmations: Record<string, [number, number][]>;
    };

    if (!body.result || !body.confirmations) {
      return Response.json({ error: "Falta 'result' o 'confirmations' en el body." }, { status: 400 });
    }

    const final = finalizeSolveWithConfirmedPieces(body.result, body.confirmations);
    return Response.json(final);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error desconocido al finalizar la solucion." },
      { status: 500 }
    );
  }
}
