"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { firstNameOf, renderCampaign } from "@/lib/mail/campaign";
import { requireAdmin } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";

// Campagnes d'e-mail (demande du 10 oct. 2026) : admin et sysop seulement (contrôle ici ET règles `1760002700`). Envoi
// un destinataire à la fois par la route interne de PocketBase (SMTP de mail.pb.js), 400 ms entre deux envois.

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);
const campaignSchema = z.object({
  subject: z.string().trim().min(1, "Objet requis").max(200),
  body: z.string().trim().min(1, "Texte requis").max(20000),
});

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError)
    return {
      ok: false,
      error: e.status === 404 ? "Campagne introuvable." : e.response?.message || "Refusé.",
    };
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

/** Adresse publique du site dans le bouton « Ouvrir CSM ». */
const appUrl = () => env.CSM_PUBLIC_URL || "https://csm.fs0ciety.org";

export async function saveCampaign(
  id: string | null,
  input: unknown,
): Promise<Result<{ id: string }>> {
  try {
    const me = await requireAdmin();
    const p = campaignSchema.parse(input);
    const pb = await pbForRequest();
    const rec = id
      ? await pb.collection("mail_campaigns").update(pbId.parse(id), p)
      : await pb
          .collection("mail_campaigns")
          .create({ ...p, status: "brouillon", sent_count: 0, created_by: me.id });
    revalidatePath("/admin/campagnes");
    return { ok: true, data: { id: rec.id } };
  } catch (e) {
    return fail(e);
  }
}

async function sendOne(to: string, mail: { subject: string; html: string; text: string }) {
  if (env.CSM_INTERNAL_SECRET.length < 32)
    throw new Error("DROIT:Envoi indisponible : secret interne absent.");
  const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/mail/send`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: JSON.stringify({ to, ...mail }),
    cache: "no-store",
  });
  if (res.status === 503)
    throw new Error("DROIT:SMTP non configuré sur PocketBase (variables CSM_SMTP_*).");
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(b.message || `Envoi refusé (${res.status}).`);
  }
}

/** Envoi de test à l'administrateur connecté seulement. */
export async function sendCampaignTest(id: string): Promise<Result<{ to: string }>> {
  try {
    const me = await requireAdmin();
    const pb = await pbForRequest();
    const c = await pb.collection("mail_campaigns").getOne(pbId.parse(id));
    const mail = renderCampaign({
      subject: `[TEST] ${String(c.subject)}`,
      body: String(c.body),
      firstName: firstNameOf(me.name),
      appUrl: appUrl(),
    });
    await sendOne(me.email, mail);
    await pb
      .collection("mail_campaigns")
      .update(c.id, { test_sent_at: new Date().toISOString().replace("T", " ") });
    revalidatePath("/admin/campagnes");
    return { ok: true, data: { to: me.email } };
  } catch (e) {
    return fail(e);
  }
}

/** Destinataires : comptes actifs avec une adresse e-mail (hors compte de service). */
async function recipients() {
  const pb = await pbForRequest();
  const rows = await pb.collection("users").getFullList({
    filter: 'role != "disabled" && role != "connector"',
    fields: "id,name,email",
    sort: "name",
  });
  return rows
    .map((r) => ({ id: r.id, name: String(r.name ?? ""), email: String(r.email ?? "") }))
    .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) && !r.email.endsWith(".invalid"));
}

export async function campaignRecipientCount(): Promise<number> {
  await requireAdmin();
  return (await recipients()).length;
}

/** Envoi à tous les agents actifs ; une campagne envoyée ne repart pas (dupliquer pour renvoyer). */
export async function sendCampaign(id: string): Promise<Result<{ sent: number; failed: number }>> {
  try {
    await requireAdmin();
    const pb = await pbForRequest();
    const c = await pb.collection("mail_campaigns").getOne(pbId.parse(id));
    if (c.status === "envoyee")
      throw new Error("DROIT:Campagne déjà envoyée : duplique-la pour la renvoyer.");
    const list = await recipients();
    if (!list.length) throw new Error("DROIT:Aucun destinataire.");
    let sent = 0;
    const failed: { email: string; error: string }[] = [];
    for (const r of list) {
      try {
        await sendOne(
          r.email,
          renderCampaign({
            subject: String(c.subject),
            body: String(c.body),
            firstName: firstNameOf(r.name),
            appUrl: appUrl(),
          }),
        );
        sent++;
      } catch (e) {
        // SMTP absent : inutile d'insister sur les suivants.
        if (e instanceof Error && e.message.startsWith("DROIT:")) throw e;
        failed.push({
          email: r.email,
          error: e instanceof Error ? e.message.slice(0, 120) : "erreur",
        });
      }
      await new Promise((ok) => setTimeout(ok, 400));
    }
    await pb.collection("mail_campaigns").update(c.id, {
      status: "envoyee",
      sent_count: sent,
      failed,
      sent_at: new Date().toISOString().replace("T", " "),
    });
    revalidatePath("/admin/campagnes");
    return { ok: true, data: { sent, failed: failed.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function duplicateCampaign(id: string): Promise<Result<{ id: string }>> {
  try {
    const me = await requireAdmin();
    const pb = await pbForRequest();
    const c = await pb.collection("mail_campaigns").getOne(pbId.parse(id));
    const rec = await pb.collection("mail_campaigns").create({
      subject: String(c.subject),
      body: String(c.body),
      status: "brouillon",
      sent_count: 0,
      created_by: me.id,
    });
    revalidatePath("/admin/campagnes");
    return { ok: true, data: { id: rec.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCampaign(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const pb = await pbForRequest();
    await pb.collection("mail_campaigns").delete(pbId.parse(id));
    revalidatePath("/admin/campagnes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Aperçu HTML (rendu côté serveur, pour l'iframe isolée de l'éditeur). */
export async function previewCampaign(input: unknown): Promise<Result<{ html: string }>> {
  try {
    const me = await requireAdmin();
    const p = campaignSchema.parse(input);
    return {
      ok: true,
      data: {
        html: renderCampaign({ ...p, firstName: firstNameOf(me.name), appUrl: appUrl() }).html,
      },
    };
  } catch (e) {
    return fail(e);
  }
}
