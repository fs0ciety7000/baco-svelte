import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// Lecture d'un document de la bibliothèque : fin du bucket public de BACO (BUG-1). La fiche est lue avec le jeton de
// l'agent (règles PocketBase), le fichier protégé est demandé avec un jeton de fichier à usage court ; jamais d'URL
// publique ni d'URL PocketBase dans le navigateur. Image / PDF en aperçu, tout le reste en téléchargement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INLINE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "documents:read")) return new Response("Introuvable", { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]{15}$/.test(id)) return new Response("Introuvable", { status: 404 });
  try {
    const pb = await pbForRequest();
    const rec = await pb.collection("documents").getOne(id, { fields: "id,file,name" });
    const file = typeof rec.file === "string" ? rec.file : "";
    if (!file) return new Response("Introuvable", { status: 404 });
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    const inlineType = INLINE[ext];
    const token = await pb.files.getToken();
    const res = await fetch(
      `${env.PB_URL}/api/files/documents/${id}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
    // Nom de téléchargement lisible (le nom saisi + l'extension réelle), caractères de contrôle retirés.
    const downloadName = `${String(rec.name || "document").replace(/[\u0000-\u001f\u007f"/\\]/g, "_")}.${ext}`;
    return new Response(res.body, {
      headers: {
        "content-type": inlineType ?? "application/octet-stream",
        "content-disposition": `${inlineType ? "inline" : "attachment"}; filename="${downloadName}"`,
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
