import { solveFromImage } from "@/lib/solve-from-image";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "Falta el archivo de imagen (campo 'image')." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await solveFromImage(buffer);

    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error desconocido procesando la imagen." },
      { status: 500 }
    );
  }
}
