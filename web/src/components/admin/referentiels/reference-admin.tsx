"use client";

import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteReference,
  saveReference,
  setCrossingActive,
  type RefKind,
} from "@/app/(app)/admin/referentiels/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";

// Gestion d'un référentiel du réseau (Administration › Référentiels, navigation v3) : tableau dense (cartes en mobile),
// panneau de création / modification, suppression confirmée, et pour les passages à niveau désactivation /
// réactivation. Un seul composant pour PtCar, EBP, points SPI et PN : la description des champs vient de la page.

export type RefField = {
  name: string;
  label: string;
  required?: boolean;
  max?: number;
  hint?: string;
  type?: "text" | "number" | "textarea";
  /** Saisie en majuscules (abréviations, zones). */
  upper?: boolean;
  placeholder?: string;
};

export type RefRow = { id: string; updated: string } & Record<string, string | number | boolean>;

export function ReferenceAdmin({
  kind,
  noun,
  rows,
  fields,
  columns,
  titleFields,
  metaFields,
  canCreate,
  canUpdate,
  canDelete,
  deleteHint,
}: {
  kind: RefKind;
  /** « un PtCar », « une EBP »… (titres et confirmations). */
  noun: { one: string; the: string };
  rows: RefRow[];
  fields: RefField[];
  /** Colonnes du tableau desktop (nom de champ + libellé). */
  columns: { name: string; label: string; mono?: boolean }[];
  /** Champs du titre d'une fiche (joints par « · »). */
  titleFields: string[];
  /** Champs de la ligne secondaire en mobile. */
  metaFields: string[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  deleteHint?: string;
}) {
  const router = useRouter();
  const join = (r: RefRow, names: string[]) =>
    names
      .map((n) => String(r[n] ?? "").trim())
      .filter(Boolean)
      .join(" · ") || "—";
  const titleOf = (r: RefRow) => join(r, titleFields);
  const metaOf = (r: RefRow) => join(r, metaFields);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<RefRow | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<RefRow | null>(null);
  const [pending, start] = useTransition();

  const edit = (r: RefRow | null) => {
    setCurrent(r);
    setError("");
    setValues(
      Object.fromEntries(
        fields.map((f) => {
          const v = r?.[f.name];
          return [f.name, v === undefined || v === null || v === 0 ? "" : String(v)];
        }),
      ),
    );
    setOpen(true);
  };

  const submit = () =>
    start(async () => {
      const missing = fields.find((f) => f.required && !values[f.name]?.trim());
      if (missing) return setError(`${missing.label} : obligatoire.`);
      const res = await saveReference({
        kind,
        id: current?.id,
        expectedUpdated: current?.updated,
        data: values,
      });
      if (!res.ok) return setError(res.error);
      toast.success(current ? "Fiche enregistrée" : "Fiche créée");
      setOpen(false);
      router.refresh();
    });

  const remove = (r: RefRow) =>
    start(async () => {
      const res = await deleteReference({ kind, id: r.id });
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Fiche supprimée");
      setOpen(false);
      router.refresh();
    });

  const toggleActive = (r: RefRow) =>
    start(async () => {
      const res = await setCrossingActive({ id: r.id, active: r.active !== true });
      if (!res.ok) return void toast.error(res.error);
      toast.success(r.active === true ? "PN désactivé (retiré de la carte)" : "PN réactivé");
      router.refresh();
    });

  const isPn = kind === "pn";
  const status = (r: RefRow) =>
    isPn && r.active !== true ? <Badge tone="warn">Désactivé</Badge> : null;
  const actions = (r: RefRow) => (
    <div className="flex justify-end gap-1">
      {canUpdate ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Modifier ${titleOf(r)}`}
          data-testid={`ref-edit-${r.id}`}
          onClick={() => edit(r)}
        >
          <Pencil />
        </Button>
      ) : null}
      {isPn && canUpdate ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`${r.active === true ? "Désactiver" : "Réactiver"} ${titleOf(r)}`}
          title={r.active === true ? "Désactiver (retiré de la carte)" : "Réactiver"}
          disabled={pending}
          onClick={() => toggleActive(r)}
        >
          <Power />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Supprimer ${titleOf(r)}`}
          onClick={() => setConfirm(r)}
        >
          <Trash2 className="text-danger" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      {canCreate ? (
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => edit(null)} data-testid="ref-create">
            <Plus /> Ajouter {noun.one}
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucune fiche" description="Rien ne correspond à cette recherche." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  {columns.map((c) => (
                    <Th key={c.name}>{c.label}</Th>
                  ))}
                  <Th className="w-1">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <tbody data-testid={`ref-table-${kind}`}>
                {rows.map((r) => (
                  <Tr key={r.id} selected={open && current?.id === r.id}>
                    {columns.map((c, i) => (
                      <Td key={c.name} className={c.mono ? "font-mono" : undefined}>
                        <span className="inline-flex items-center gap-2">
                          {String(r[c.name] ?? "") || <span className="text-fg-subtle">—</span>}
                          {i === 0 ? status(r) : null}
                        </span>
                      </Td>
                    ))}
                    <Td>{actions(r)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid={`ref-cards-${kind}`}>
            {rows.map((r) => (
              <li key={r.id}>
                <ListCard
                  title={
                    <span className="inline-flex items-center gap-2">
                      {titleOf(r)} {status(r)}
                    </span>
                  }
                  meta={metaOf(r)}
                  aside={actions(r)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        eyebrow={current ? "Modifier" : "Ajouter"}
        title={current ? titleOf(current) : `Nouveau : ${noun.one}`}
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            {current && canDelete ? (
              <Button variant="danger" onClick={() => setConfirm(current)} disabled={pending}>
                <Trash2 /> Supprimer
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button variant="primary" loading={pending} onClick={submit} data-testid="ref-save">
                Enregistrer
              </Button>
            </div>
          </div>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {fields.map((f) => {
            const common = {
              name: f.name,
              value: values[f.name] ?? "",
              placeholder: f.placeholder,
              maxLength: f.max,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                const v = f.upper ? e.target.value.toUpperCase() : e.target.value;
                setValues((s) => ({ ...s, [f.name]: v }));
              },
            };
            return (
              <Field key={f.name} label={f.label} hint={f.hint} required={f.required}>
                {f.type === "textarea" ? (
                  <Textarea rows={3} {...common} />
                ) : (
                  <Input
                    type="text"
                    inputMode={f.type === "number" ? "decimal" : undefined}
                    {...common}
                  />
                )}
              </Field>
            );
          })}
          {error ? (
            <p role="alert" className="text-small text-danger" data-testid="ref-error">
              {error}
            </p>
          ) : null}
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      </Sheet>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={`Supprimer ${noun.the} ${confirm ? titleOf(confirm) : ""} ?`}
          description={
            deleteHint ?? "La suppression est définitive (tracée dans le journal d'audit)."
          }
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Garder
            </Button>
            <Button
              variant="danger"
              loading={pending}
              data-testid="ref-delete-confirm"
              onClick={() => confirm && remove(confirm)}
            >
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
