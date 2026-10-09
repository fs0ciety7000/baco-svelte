import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { readExtensionFile } from "@/server/extension";

// Téléchargement d'un paquet du Connecteur DICOS (page PMR › Extension DICOS), réservé aux agents qui voient les
// missions PMR. Le paquet ne contient aucun secret : le jeton de connecteur se saisit dans l'extension.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "deplacements:read")) return new Response("Introuvable", { status: 404 });
  const { file } = await params;
  const body = await readExtensionFile(file);
  if (!body) return new Response("Introuvable", { status: 404 });
  // .xpi signé : servi en application/x-xpinstall, sans pièce jointe, pour que Firefox propose l'installation.
  const xpi = file.endsWith(".xpi");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": xpi ? "application/x-xpinstall" : "application/zip",
      ...(xpi ? {} : { "Content-Disposition": `attachment; filename="${file}"` }),
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
