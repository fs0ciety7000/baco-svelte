import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// Lecture d'un document de la bibliothèque : fin du bucket public de BACO (BUG-1). La fiche est lue avec le jeton de
// l'agent (règles PocketBase), le fichier protégé est demandé avec un jeton de fichier à usage court ; jamais d'URL
// publique ni d'URL PocketBase dans le navigateur. Image en aperçu ; PDF en aperçu seulement pour la visionneuse
// (`?vue=1`, cadre de la page `/referentiels/documents/voir/<id>`) ; `?dl=1` force le téléchargement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Type MIME par extension (pour l'en-tête). Seules les IMAGES sont servies en aperçu ; le PDF est TÉLÉCHARGÉ : sous
// CSP `sandbox`, le visionneur PDF de Chrome ne s'ouvre pas (même correctif que la main courante d'Opérations).
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};
const INLINE = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sp = new URL(request.url).searchParams;
  const view = sp.get("vue") === "1";
  const download = sp.get("dl") === "1";
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
    const type = TYPES[ext];
    const pdfView = view && ext === "pdf";
    const inline = !download && (INLINE.has(ext) || pdfView);
    const token = await pb.files.getToken();
    const res = await fetch(
      `${env.PB_URL}/api/files/documents/${id}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
    // Nom de téléchargement lisible (nom saisi sans extension + l'extension réelle), caractères de contrôle retirés.
    const base = String(rec.name || "document")
      .replace(/\.[^.]+$/, "")
      .replace(/[\u0000-\u001f\u007f"/\\]/g, "_");
    const downloadName = ext ? `${base}.${ext}` : base;
    return new Response(res.body, {
      headers: {
        "content-type": type ?? "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        // Visionneuse PDF : pas de `sandbox`, `object-src 'self'` explicite (sinon `default-src 'none'` s'y applique et le
        // lecteur PDF de Chrome ne s'ouvre pas),
        // aucune autre ressource permise ; affichable seulement dans une page CSM (cadre même origine). Le type est
        // garanti PDF par la détection à l'envoi et `nosniff`.
        "content-security-policy": pdfView
          ? "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"
          : "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'",
        "x-frame-options": "SAMEORIGIN",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
