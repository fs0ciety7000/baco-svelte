"use client";

import { Pencil, Save, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteContact, findContactDuplicates, saveContact } from "@/app/(app)/ressources/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import type { DirectoryService, DirectoryZone } from "@/lib/referentiels/directory-model";
import type { ContactInput } from "@/lib/referentiels/model";
import type { Contact } from "@/server/data/referentiels";

/**
 * Listes du formulaire (annuaire v2, 5 nov. 2026) : services (`directory_services`, fonctions proposées), zones SPI connues
 * et codes de zone déjà en base hors de cette liste (« FB », « FR / LK » : gardés à l'affichage).
 */
export type Facets = { services: DirectoryService[]; zones: DirectoryZone[]; extraZones: string[] };

export const toInput = (c?: Contact | null): ContactInput => ({
  name: c?.name ?? "",
  phone: c?.phone ?? "",
  email: c?.email ?? "",
  service: c?.service ?? "",
  function: c?.function ?? "",
  zone: c?.zone ?? "",
  note: c?.note ?? "",
});

/** Modifier / supprimer une fiche (droits `repertoire:update` / `repertoire:delete`), dans le panneau de l'annuaire. */
export function ContactActions({
  contact,
  facets,
  canUpdate,
  canDelete,
  onSaved,
  onDeleted,
}: {
  contact: Contact;
  facets: Facets;
  canUpdate: boolean;
  canDelete: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {canUpdate ? (
        <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden className="size-4" /> Modifier
        </Button>
      ) : null}
      {canDelete ? (
        <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
          <Trash2 aria-hidden className="size-4" /> Supprimer
        </Button>
      ) : null}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="Modifier le contact">
          <ContactForm
            id={contact.id}
            initial={toInput(contact)}
            facets={facets}
            onSaved={() => {
              setEditOpen(false);
              onSaved();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent title="Supprimer ce contact ?" description="Action définitive.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Retour
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await safeCall(deleteContact(contact.id));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Contact supprimé.");
                  onDeleted();
                })
              }
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Création (avec détection de doublon) et modification d'une fiche de l'annuaire. */
export function ContactForm({
  id,
  initial,
  facets,
  onSaved,
  onOpen,
}: {
  id: string | null;
  initial: ContactInput;
  facets: Facets;
  onSaved: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const [f, setF] = useState(initial);
  const [dupes, setDupes] = useState<{ id: string; name: string }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      if (!id && !confirmed) {
        const d = await safeCall(findContactDuplicates(f.name, f.phone));
        if (d.ok && d.data.length) {
          setDupes(d.data.map((c) => ({ id: c.id, name: c.name })));
          setConfirmed(true);
          return;
        }
      }
      const res = await safeCall(saveContact(id, f));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Contact enregistré.");
      onSaved(res.data.id);
    });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Nom" required>
        <Input
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          required
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Téléphone">
          <Input
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
            maxLength={60}
          />
        </Field>
        <Field label="E-mail">
          <Input
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            maxLength={200}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service">
          <Select
            value={f.service}
            onValueChange={(v) => setF({ ...f, service: v })}
            options={[
              { value: "", label: "À classer" },
              ...facets.services.map((s) => ({ value: s.key, label: s.label })),
            ]}
            data-testid="contact-service"
          />
        </Field>
        <Field label="Fonction" hint="Choisis dans la liste ou tape une autre fonction.">
          <Combobox
            allowFree
            openOnFocus
            value={f.function}
            onValueChange={(v) => setF({ ...f, function: v })}
            options={functionsOf(facets, f.service, f.function).map((v) => ({
              value: v,
              label: v,
            }))}
            maxLength={60}
            data-testid="contact-function"
          />
        </Field>
        <Field label="Zone">
          <Select
            value={f.zone}
            onValueChange={(v) => setF({ ...f, zone: v })}
            options={zoneOptions(facets, f.zone)}
            data-testid="contact-zone"
          />
        </Field>
      </div>
      <Field label="Remarque">
        <Textarea
          value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })}
          maxLength={1000}
        />
      </Field>
      {dupes.length ? (
        <div role="alert" className="flex flex-col gap-1 border border-warn/60 p-3 text-small">
          <p className="font-medium text-fg">Contacts proches déjà existants :</p>
          <ul className="list-inside list-disc">
            {dupes.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  className="min-h-11 cursor-pointer link md:min-h-0"
                  onClick={() => onOpen?.(d.id)}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted">
            Enregistrer à nouveau pour créer quand même un nouveau contact.
          </p>
        </div>
      ) : null}
      <DialogFooter className={id ? "mx-0 mb-0 border-0 px-0" : undefined}>
        <Button type="submit" variant="primary" loading={pending} data-testid="contact-save">
          <Save aria-hidden />{" "}
          {id ? "Enregistrer" : dupes.length ? "Créer quand même" : "Créer le contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Fonctions proposées pour le service choisi (toutes si aucun), plus la valeur actuelle si elle est hors liste. */
function functionsOf(facets: Facets, service: string, current: string): string[] {
  const list = service
    ? (facets.services.find((s) => s.key === service)?.functions ?? [])
    : facets.services.flatMap((s) => s.functions);
  const out = [...new Set(list)];
  if (current && !out.some((f) => f.toLowerCase() === current.toLowerCase())) out.unshift(current);
  return out;
}

/** Zones SPI connues + « Aucune » ; un code déjà en base hors de la liste reste proposé (tel quel). */
function zoneOptions(facets: Facets, current: string) {
  const known = facets.zones.map((z) => ({ value: z.code, label: `${z.code} · ${z.name}` }));
  const extra = [...new Set([...facets.extraZones, current])]
    .filter((c) => c && !facets.zones.some((z) => z.code === c))
    .sort((a, b) => a.localeCompare(b, "fr"))
    .map((c) => ({ value: c, label: `${c} (hors carte SPI)` }));
  return [{ value: "", label: "Aucune" }, ...known, ...extra];
}
