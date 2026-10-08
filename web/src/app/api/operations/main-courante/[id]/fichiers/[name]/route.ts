import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// Lecture d'une pièce jointe de main courante : la fiche est lue avec le jeton de l'agent (règles PocketBase), le
// fichier protégé est demandé avec un jeton de fichier à usage court, jamais d'URL PocketBase dans le navigateur.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "journal:read")) return new Response("Introuvable", { status: 404 });
  const { id, name } = await params;
  if (!/^[a-z0-9]{15}$/.test(id) || !/^[\w.-]{1,200}$/.test(name))
    return new Response("Introuvable", { status: 404 });
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return new Response("Introuvable", { status: 404 });
  try {
    const pb = await pbForRequest();
    const rec = await pb
      .collection("ops_log")
      .getOne(id, { fields: "id,attachments,collectionId" });
    if (!Array.isArray(rec.attachments) || !rec.attachments.includes(name))
      return new Response("Introuvable", { status: 404 });
    const token = await pb.files.getToken();
    const res = await fetch(
      `${env.PB_URL}/api/files/ops_log/${id}/${encodeURIComponent(name)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
    return new Response(res.body, {
      headers: {
        "content-type": type,
        // PDF téléchargé (il peut contenir du script ; le visionneur de Chrome ne s'ouvre pas dans un document « sandbox »).
        "content-disposition": `${type.startsWith("image/") ? "inline" : "attachment"}; filename="${name}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
