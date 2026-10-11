import { contentDisposition } from "@/lib/orders/eml";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// PDF archivé d'un bon (archives:read) : fichier protégé lu avec le jeton de l'agent et un jeton de fichier.
// `?dl=1` : téléchargement ; sinon ouverture dans le navigateur (nouvel onglet, sans cadre).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "archives:read")) return new Response("Introuvable", { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]{15}$/.test(id)) return new Response("Introuvable", { status: 404 });
  try {
    const pb = await pbForRequest();
    const rec = await pb
      .collection("order_pdfs")
      .getOne(id, { fields: "id,file,reference,service_day" });
    const file = typeof rec.file === "string" ? rec.file : "";
    if (!file) return new Response("Introuvable", { status: 404 });
    const token = await pb.files.getToken();
    const res = await fetch(
      `${env.PB_URL.replace(/\/$/, "")}/api/files/order_pdfs/${id}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
    const name = `${String(rec.service_day || "bon")} ${String(rec.reference || "")}`
      .trim()
      .replace(/[\u0000-\u001f\u007f"/\\]/g, "_");
    const dl = new URL(request.url).searchParams.get("dl") === "1";
    return new Response(res.body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition(dl ? "attachment" : "inline", `${name}.pdf`),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
