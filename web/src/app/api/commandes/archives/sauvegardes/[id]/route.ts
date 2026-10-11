import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// Sauvegarde zip mensuelle des PDF de bons (archives:read), toujours en téléchargement.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "archives:read")) return new Response("Introuvable", { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]{15}$/.test(id)) return new Response("Introuvable", { status: 404 });
  try {
    const pb = await pbForRequest();
    const rec = await pb.collection("order_pdf_backups").getOne(id, { fields: "id,file,month" });
    const file = typeof rec.file === "string" ? rec.file : "";
    if (!file) return new Response("Introuvable", { status: 404 });
    const token = await pb.files.getToken();
    const res = await fetch(
      `${env.PB_URL.replace(/\/$/, "")}/api/files/order_pdf_backups/${id}/${encodeURIComponent(file)}?token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok || !res.body) return new Response("Introuvable", { status: 404 });
    return new Response(res.body, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="bons-${String(rec.month).replace(/[^\d-]/g, "")}.zip"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
