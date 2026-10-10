import { getCurrentUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Avatar d'un agent (profil enrichi, 10 oct. 2026) : fichier PocketBase protégé, lu avec le jeton de l'agent connecté
// (tout agent actif voit les avatars). `?t=96|256` choisit la miniature ; l'URL porte le nom du fichier (`v`) pour que le
// cache du navigateur suive un changement de photo.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401, headers: NO });
  const { id } = await params;
  if (!/^[a-z0-9]{15}$/.test(id)) return new Response("Introuvable", { status: 404, headers: NO });
  const size = new URL(request.url).searchParams.get("t") === "256" ? "256x256" : "96x96";
  const pb = await pbForRequest();
  try {
    const r = await pb.collection("users").getOne(id, { fields: "id,avatar" });
    const file = typeof r.avatar === "string" ? r.avatar : "";
    if (!file) return new Response("Introuvable", { status: 404, headers: NO });
    const token = await pb.files.getToken();
    const res = await fetch(
      `${pb.baseURL.replace(/\/$/, "")}/api/files/users/${id}/${encodeURIComponent(file)}?thumb=${size}&token=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(type))
      return new Response("Introuvable", { status: 404, headers: NO });
    return new Response(res.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Introuvable", { status: 404, headers: NO });
  }
}
