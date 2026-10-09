import Form from "next/form";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { requireAdmin } from "@/server/auth";
import { auditListSchema, listAudit } from "@/server/data/admin";

export const metadata: Metadata = { title: "Journal d'audit · CSM" };

const ACTION = {
  create: { label: "Création", tone: "ok" },
  update: { label: "Modification", tone: "info" },
  delete: { label: "Suppression", tone: "danger" },
} as const;

const at = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Brussels",
});

const short = (v: unknown) => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s && s.length > 160 ? `${s.slice(0, 160)}…` : (s ?? "—");
};

type SP = Record<string, string | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const parsed = auditListSchema.safeParse(sp);
  const p = parsed.success ? parsed.data : auditListSchema.parse({});
  const res = await listAudit(p);
  const keep = Object.fromEntries(
    Object.entries({
      collection: p.collection,
      action: p.action,
      user: p.user,
      record: p.record,
      du: p.du,
      au: p.au,
    }).filter(([, v]) => v),
  ) as Record<string, string>;
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({ ...keep, ...extra }).toString();
  return (
    <section className="flex flex-col gap-4" aria-label="Journal d'audit">
      <Form
        action="/admin/audit"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <FormAutoSubmit />
        <label className="flex min-w-0 flex-col gap-1 md:w-48">
          <span className="text-small text-fg-muted">Collection</span>
          <Input
            name="collection"
            defaultValue={p.collection}
            placeholder="ex. bus_orders"
            maxLength={100}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Action</span>
          <Select name="action" defaultValue={p.action ?? ""}>
            <option value="">Toutes</option>
            {Object.entries(ACTION).map(([k, a]) => (
              <option key={k} value={k}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-48">
          <span className="text-small text-fg-muted">Fiche (identifiant)</span>
          <Input name="record" defaultValue={p.record} maxLength={100} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Du</span>
          <Input type="date" name="du" defaultValue={p.du} />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Au</span>
          <Input type="date" name="au" defaultValue={p.au} />
        </label>
        {p.user ? <input type="hidden" name="user" value={p.user} /> : null}
        <div className="col-span-2 flex flex-wrap gap-2">
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/audit">Effacer</Link>
          </Button>
          <Button asChild variant="ghost">
            <a href={`/api/admin/audit/export?${qs({})}`} download>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        </div>
      </Form>
      <p className="text-body text-fg-muted">
        <span className="font-mono text-fg tabular">{res.totalItems}</span> ligne(s)
        {p.user ? (
          <>
            {" "}
            · auteur filtré ·{" "}
            <Link
              className="text-accent underline-offset-2 hover:underline"
              href={`/admin/audit?${new URLSearchParams(Object.fromEntries(Object.entries(keep).filter(([k]) => k !== "user")))}`}
            >
              retirer
            </Link>
          </>
        ) : null}
      </p>
      {res.items.length === 0 ? (
        <EmptyState
          title="Aucune ligne"
          description="Aucune écriture ne correspond à ces filtres."
        />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="audit-list">
          {res.items.map((r) => {
            const a = ACTION[r.action as keyof typeof ACTION] ?? ACTION.update;
            const changes =
              r.changes && typeof r.changes === "object"
                ? Object.entries(r.changes as Record<string, unknown>)
                : [];
            return (
              <li key={r.id} className="border border-border bg-surface">
                <details>
                  <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
                    <Badge tone={a.tone}>{a.label}</Badge>
                    <span className="font-mono text-small">{r.collection}</span>
                    <span className="font-mono text-small text-fg-muted">{r.record}</span>
                    <span className="ml-auto flex flex-wrap items-center gap-2 text-small text-fg-muted">
                      {r.user ? (
                        <Link
                          className="text-accent underline-offset-2 hover:underline"
                          href={`/admin/audit?${qs({ user: r.user })}`}
                        >
                          {r.userName || "Compte technique"}
                        </Link>
                      ) : (
                        <span>système</span>
                      )}
                      <span className="tabular">{at.format(new Date(r.at.replace(" ", "T")))}</span>
                      {r.legacy ? <Badge tone="neutral">BACO</Badge> : null}
                    </span>
                  </summary>
                  <div className="border-t border-border px-3 py-2">
                    {changes.length === 0 ? (
                      <p className="text-small text-fg-muted">Pas de différentiel enregistré.</p>
                    ) : (
                      <dl className="grid gap-x-3 gap-y-1 text-small sm:grid-cols-[minmax(8rem,auto)_1fr]">
                        {changes.map(([k, v]) => {
                          const d = (v ?? {}) as { old?: unknown; new?: unknown };
                          const isDiff = v && typeof v === "object" && ("old" in d || "new" in d);
                          return (
                            <div key={k} className="contents">
                              <dt className="font-mono text-fg-muted">{k}</dt>
                              <dd className="min-w-0 break-words">
                                {isDiff ? (
                                  <>
                                    <span className="text-danger line-through">{short(d.old)}</span>{" "}
                                    → <span className="text-ok">{short(d.new)}</span>
                                  </>
                                ) : (
                                  short(v)
                                )}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {res.totalPages > 1 ? (
        <nav className="flex items-center justify-between gap-2" aria-label="Pagination">
          {res.page > 1 ? (
            <Button asChild variant="secondary">
              <Link href={`/admin/audit?${qs({ page: String(res.page - 1) })}`}>Précédent</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-small text-fg-muted">
            Page {res.page} / {res.totalPages}
          </span>
          {res.page < res.totalPages ? (
            <Button asChild variant="secondary">
              <Link href={`/admin/audit?${qs({ page: String(res.page + 1) })}`}>Suivant</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}
