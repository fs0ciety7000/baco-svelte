import { ClientResponseError } from "pocketbase";

import { can } from "@/lib/permissions";
import { detectDocument } from "@/lib/referentiels/detect";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Envoi d'un document de la bibliothèque (Ressources › Procédures et documents ; demande du 11 oct. 2026). Route et non
// Server Action : une action est limitée à 1 Mo par Next, les documents vont jusqu'à 30 Mo. Droit documents:write ; la
// règle PocketBase (auteur forcé) et le champ fichier (30 Mo, types bureautiques, protégé) revérifient. Le type est
// contrôlé sur les premiers octets (et l'extension pour départager les formats Office), pas sur le type annoncé.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 30 * 1024 * 1024;
const LIMIT = MAX + 64 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Non connecté" }, { status: 401 });
  if (!can(user, "documents:write"))
    return Response.json({ error: "Droit manquant" }, { status: 403 });
  // Même origine seulement (le cookie est SameSite=Lax, contrôle en plus).
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json({ error: "Origine refusée" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > LIMIT)
    return Response.json({ error: "Fichier trop lourd (30 Mo au maximum)." }, { status: 413 });
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
        return Response.json({ error: "Fichier trop lourd (30 Mo au maximum)." }, { status: 413 });
      }
      chunks.push(value);
    }
    form = await new Response(new Blob(chunks as BlobPart[]), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return Response.json({ error: "Envoi illisible." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return Response.json({ error: "Aucun fichier sélectionné." }, { status: 400 });
  if (file.size > MAX)
    return Response.json({ error: "Fichier trop lourd (30 Mo au maximum)." }, { status: 413 });
  const name = String(form.get("name") ?? "")
    .trim()
    .slice(0, 300);
  const category = String(form.get("category") ?? "")
    .trim()
    .slice(0, 60);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectDocument(bytes, file.name);
  if (!kind)
    return Response.json(
      {
        error:
          "Format refusé : PDF, image (PNG, JPEG, GIF, WebP), Word, Excel, PowerPoint, texte ou CSV.",
      },
      { status: 415 },
    );
  const out = new FormData();
  out.set("name", name || file.name.replace(/\.[^.]+$/, "").slice(0, 300) || "Document");
  out.set("category", category);
  out.set("uploaded_by", user.id);
  // Nom de stockage neutre ; le nom lisible est dans `name` (et sert au téléchargement).
  out.set("file", new File([bytes], `document.${kind.ext}`, { type: kind.type }));
  try {
    const pb = await pbForRequest();
    const r = await pb.collection("documents").create(out);
    return Response.json({ ok: true, id: r.id, name: String(r.name ?? "") });
  } catch (e) {
    if (e instanceof ClientResponseError)
      return Response.json(
        { error: e.status === 403 ? "Droit manquant." : "Document refusé par le serveur." },
        { status: e.status === 403 ? 403 : 400 },
      );
    return Response.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
