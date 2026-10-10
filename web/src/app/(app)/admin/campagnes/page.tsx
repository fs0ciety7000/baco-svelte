import type { Metadata } from "next";

import { CampaignEditor, type CampaignRow } from "@/components/admin/campaigns";
import { passwordResetEnabled } from "@/app/connexion/reset-actions";
import { requireAdmin } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

import { campaignRecipientCount } from "../campaign-actions";

export const metadata: Metadata = { title: "Campagnes · Administration · CSM" };

/** Campagnes d'e-mail (demande du 10 oct. 2026) : annonce du passage BACO → CSM, envoi test puis envoi à tous. */
export default async function Page() {
  await requireAdmin();
  const pb = await pbForRequest();
  const [rows, smtp, count] = await Promise.all([
    pb
      .collection("mail_campaigns")
      .getFullList({
        sort: "-created",
        fields: "id,subject,body,status,sent_count,failed,sent_at,test_sent_at,created",
      })
      .catch(() => []),
    passwordResetEnabled(),
    campaignRecipientCount().catch(() => 0),
  ]);
  const campaigns: CampaignRow[] = rows.map((r) => ({
    id: r.id,
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    status: r.status === "envoyee" ? "envoyee" : "brouillon",
    sentCount: Number(r.sent_count ?? 0),
    failed: Array.isArray(r.failed) ? (r.failed as { email: string; error: string }[]).length : 0,
    sentAt: String(r.sent_at ?? ""),
    testSentAt: String(r.test_sent_at ?? ""),
  }));
  return (
    <section className="flex flex-col gap-4" aria-label="Campagnes d'e-mail">
      <CampaignEditor campaigns={campaigns} smtp={smtp} recipients={count} />
    </section>
  );
}
