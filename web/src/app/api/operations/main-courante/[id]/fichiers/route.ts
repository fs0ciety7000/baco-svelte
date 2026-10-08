import { ClientResponseError } from "pocketbase";

import { ATTACHMENT_MAX } from "@/lib/ops/log";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Ajout de pièces jointes à une entrée de main courante (multipart). Droit journal:write ; la règle PocketBase
// (auteur ou coordinateur) et le champ fichier (3 au plus, 5 Mo, images et PDF, protégé) revérifient.
// Le type est contrôlé sur les premiers octets, pas sur l'extension ni le type annoncé.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAGIC: { type: string; test: (b: Uint8Array) => boolean }[] = [
  {
    type: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/webp",
    test: (b) =>
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  },
  { type: "application/pdf", test: (b) => String.fromCharCode(...b.slice(0, 5)) === "%PDF-" },
];
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non connecté" }, { status: 401 });
  if (!can(user, "journal:write"))
    return Response.json({ error: "Droit manquant" }, { status: 403 });
  // Même origine seulement (le cookie est SameSite=Lax, contrôle en plus).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json({ error: "Origine refusée" }, { status: 403 });
  const LIMIT = 3 * ATTACHMENT_MAX + 64 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > LIMIT)
    return Response.json(
      { error: "Fichiers trop lourds (5 Mo chacun au maximum)." },
      { status: 413 },
    );
  const { id } = await params;
  if (!/^[a-z0-9]{15}$/.test(id)) return Response.json({ error: "Introuvable" }, { status: 404 });
  // Lecture bornée du corps (un envoi sans longueur annoncée, ou qui ment, est coupé à la limite).
  let form: FormData;
  try {
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Envoi vide." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) {
        await reader.cancel();
        return Response.json(
          { error: "Fichiers trop lourds (5 Mo chacun au maximum)." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return Response.json({ error: "Envoi illisible." }, { status: 400 });
  }
  const files = form.getAll("fichiers").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 || files.length > 3)
    return Response.json({ error: "1 à 3 fichiers." }, { status: 400 });
  const out = new FormData();
  for (const [i, f] of files.entries()) {
    if (f.size > ATTACHMENT_MAX)
      return Response.json({ error: `${f.name} dépasse 5 Mo.` }, { status: 413 });
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = MAGIC.find((m) => m.test(bytes));
    if (!kind)
      return Response.json(
        { error: `${f.name} : seuls les images (PNG, JPEG, WebP) et les PDF sont acceptés.` },
        { status: 415 },
      );
    // Nom neutre : le nom d'origine (qui peut contenir des données) n'est pas gardé.
    out.append(
      "attachments+",
      new File([bytes], `piece-${Date.now()}-${i + 1}.${EXT[kind.type]}`, { type: kind.type }),
    );
  }
  try {
    const pb = await pbForRequest();
    await pb.collection("ops_log").update(id, out);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ClientResponseError) {
      if (e.status === 404)
        return Response.json({ error: "Entrée introuvable ou accès refusé." }, { status: 404 });
      return Response.json(
        { error: "Pièce jointe refusée (3 fichiers au maximum par entrée)." },
        { status: 400 },
      );
    }
    return Response.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
