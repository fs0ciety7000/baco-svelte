"use client";

import { Copy, Eye, Mail, Plus, Save, Send, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  deleteCampaign,
  duplicateCampaign,
  previewCampaign,
  saveCampaign,
  sendCampaign,
  sendCampaignTest,
} from "@/app/(app)/admin/campaign-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { DEFAULT_CAMPAIGN } from "@/lib/mail/campaign";
import { formatShortDay, pbDate, brusselsTime, brusselsDay } from "@/lib/orders/time";
import { cn, pl } from "@/lib/utils";

export type CampaignRow = {
  id: string;
  subject: string;
  body: string;
  status: "brouillon" | "envoi" | "envoyee";
  sentCount: number;
  failed: number;
  sentAt: string;
  testSentAt: string;
};

const when = (iso: string) => {
  const d = pbDate(iso);
  return d ? `${formatShortDay(brusselsDay(d))} à ${brusselsTime(d)}` : "";
};

/**
 * Campagnes d'e-mail : liste à gauche, éditeur + aperçu à droite. Texte en Markdown du Journal (gras, listes, liens),
 * `{prenom}` remplacé par le prénom de chaque agent. Envoi test à soi d'abord, puis à tous (confirmation).
 */
export function CampaignEditor({
  campaigns,
  smtp,
  recipients,
}: {
  campaigns: CampaignRow[];
  smtp: boolean;
  recipients: number;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(campaigns[0]?.id ?? null);
  const current = campaigns.find((c) => c.id === selected) ?? null;
  const [subject, setSubject] = useState(current?.subject ?? DEFAULT_CAMPAIGN.subject);
  const [body, setBody] = useState(current?.body ?? DEFAULT_CAMPAIGN.body);
  const [preview, setPreview] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const sent = current?.status === "envoyee" || current?.status === "envoi";
  const dirty = !current || current.subject !== subject || current.body !== body;

  useEffect(() => {
    setSubject(current?.subject ?? DEFAULT_CAMPAIGN.subject);
    setBody(current?.body ?? DEFAULT_CAMPAIGN.body);
    setPreview("");
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<string | null> => {
    const r = await saveCampaign(current?.id ?? null, { subject, body });
    if (!r.ok) {
      toast.error(r.error);
      return null;
    }
    setSelected(r.data.id);
    router.refresh();
    return r.data.id;
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card className="min-w-0 self-start">
        <CardHeader
          title="Campagnes"
          actions={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(null)}
              aria-label="Nouvelle campagne"
            >
              <Plus aria-hidden /> Nouvelle
            </Button>
          }
        />
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-small text-fg-muted">
              Aucune campagne. Le modèle « BACO devient CSM » est prêt à droite.
            </p>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="campaign-list">
              {campaigns.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-current={c.id === selected || undefined}
                    className={cn(
                      "flex w-full min-w-0 cursor-pointer flex-col items-start gap-0.5 rounded-box px-2 py-2 text-left hover:bg-surface-2",
                      c.id === selected && "bg-accent-soft",
                    )}
                  >
                    <span className="w-full truncate text-body text-fg">{c.subject}</span>
                    <span className="flex items-center gap-1.5 text-small text-fg-muted">
                      <Badge
                        tone={
                          c.status === "envoyee" ? "ok" : c.status === "envoi" ? "warn" : "neutral"
                        }
                      >
                        {c.status === "envoyee"
                          ? "Envoyée"
                          : c.status === "envoi"
                            ? "Envoi en cours"
                            : "Brouillon"}
                      </Badge>
                      {c.status === "envoyee" ? `${c.sentCount} ${pl(c.sentCount, "envoi")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {!smtp ? (
          <p
            className="flex items-start gap-2 rounded-box border border-warn bg-surface px-3 py-2 text-body text-fg"
            data-testid="smtp-missing"
          >
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
            Envoi impossible pour l&apos;instant : le SMTP n&apos;est pas configuré sur PocketBase
            (variables CSM_SMTP_*). Tu peux préparer et prévisualiser la campagne.
          </p>
        ) : null}
        <Card className="min-w-0">
          <CardHeader
            title={
              current ? (sent ? "Campagne envoyée" : "Modifier la campagne") : "Nouvelle campagne"
            }
            eyebrow={
              current?.sentAt
                ? `Envoyée le ${when(current.sentAt)} · ${current.sentCount} ${pl(current.sentCount, "envoi")}${current.failed ? ` · ${current.failed} en échec` : ""}`
                : current?.testSentAt
                  ? `Test envoyé le ${when(current.testSentAt)}`
                  : `${recipients} ${pl(recipients, "destinataire")} (agents actifs)`
            }
          />
          <CardContent className="flex flex-col gap-3">
            <Field label="Objet" required>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                disabled={sent}
              />
            </Field>
            <Field
              label="Texte"
              required
              hint="Markdown du Journal : **gras**, listes « - », liens. {prenom} = prénom de l'agent. Le bouton « Ouvrir CSM » est ajouté."
            >
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={16}
                maxLength={20000}
                disabled={sent}
                className="font-mono text-small"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              {!sent ? (
                <Button
                  variant="secondary"
                  loading={pending}
                  disabled={!dirty}
                  onClick={() => start(async () => void (await save()))}
                >
                  <Save aria-hidden /> Enregistrer
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="border border-border"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await previewCampaign({ subject, body });
                    if (!r.ok) return void toast.error(r.error);
                    setPreview(r.data.html);
                  })
                }
              >
                <Eye aria-hidden /> Aperçu
              </Button>
              {!sent ? (
                <Button
                  variant="secondary"
                  disabled={pending || !smtp}
                  data-testid="campaign-test"
                  onClick={() =>
                    start(async () => {
                      const id = dirty ? await save() : (current?.id ?? null);
                      if (!id) return;
                      const r = await sendCampaignTest(id);
                      if (!r.ok) return void toast.error(r.error);
                      toast.success(`E-mail de test envoyé à ${r.data.to}.`);
                      router.refresh();
                    })
                  }
                >
                  <Mail aria-hidden /> M&apos;envoyer un test
                </Button>
              ) : null}
              {!sent ? (
                <Button
                  variant="primary"
                  disabled={pending || !smtp || !current?.testSentAt || dirty}
                  title={!current?.testSentAt ? "Envoie-toi d'abord un test" : undefined}
                  onClick={() => setConfirm(true)}
                  data-testid="campaign-send"
                >
                  <Send aria-hidden /> Envoyer à tous ({recipients})
                </Button>
              ) : null}
              {current ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await duplicateCampaign(current.id);
                      if (!r.ok) return void toast.error(r.error);
                      setSelected(r.data.id);
                      router.refresh();
                    })
                  }
                >
                  <Copy aria-hidden /> Dupliquer
                </Button>
              ) : null}
              {current && !sent ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await deleteCampaign(current.id);
                      if (!r.ok) return void toast.error(r.error);
                      setSelected(null);
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden /> Supprimer
                </Button>
              ) : null}
            </div>
            {!sent && !current?.testSentAt ? (
              <p className="text-small text-fg-muted">
                L&apos;envoi à tous s&apos;active après un e-mail de test (et sans modification
                depuis).
              </p>
            ) : null}
          </CardContent>
        </Card>
        {preview ? (
          <Card className="min-w-0">
            <CardHeader title="Aperçu" eyebrow="Tel que reçu (avec ton prénom)" />
            <CardContent>
              <iframe
                title="Aperçu de l'e-mail"
                srcDoc={preview}
                sandbox=""
                className="h-[640px] w-full rounded-box border border-border bg-white"
                data-testid="campaign-preview"
              />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent
          title="Envoyer la campagne à tous ?"
          description={`${recipients} ${pl(recipients, "agent")} actifs vont recevoir « ${subject} ». Une campagne envoyée ne repart pas.`}
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  if (!current) return;
                  const r = await sendCampaign(current.id);
                  setConfirm(false);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(
                    `Campagne envoyée : ${r.data.sent} ${pl(r.data.sent, "envoi")}${r.data.failed ? `, ${r.data.failed} en échec` : ""}.`,
                  );
                  router.refresh();
                })
              }
            >
              <Send aria-hidden /> Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
