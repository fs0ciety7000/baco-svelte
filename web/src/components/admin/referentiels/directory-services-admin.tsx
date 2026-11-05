"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  deleteDirectoryService,
  saveDirectoryService,
} from "@/app/(app)/admin/referentiels/directory-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { pl } from "@/lib/utils";

// Administration › Référentiels › Services de l'annuaire (annuaire v2, 5 nov. 2026) : une carte par service (libellé,
// ordre, fonctions proposées une par ligne, nombre de contacts), création d'un service (clé figée ensuite), suppression
// seulement d'un service inutilisé (le hook PocketBase le refuse aussi).

export type ServiceRow = {
  id: string;
  key: string;
  label: string;
  sort: number;
  functions: string[];
  used: number;
};

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export function DirectoryServicesAdmin({
  services,
  unclassified,
}: {
  services: ServiceRow[];
  unclassified: number;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4" data-testid="directory-services-admin">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-small text-fg-muted">
          Services de Ressources › Contacts. Les fonctions proposées apparaissent dans le formulaire
          d&apos;un contact (l&apos;agent peut aussi en taper une autre).
          {unclassified ? (
            <>
              {" "}
              <span className="text-fg">
                {unclassified} {pl(unclassified, "contact")} à classer
              </span>{" "}
              (sans service).
            </>
          ) : null}
        </p>
        <Button variant="secondary" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden /> Nouveau service
        </Button>
      </div>
      <ul className="grid gap-4 lg:grid-cols-2">
        {services.map((s) => (
          <li key={s.id}>
            <ServiceCard service={s} />
          </li>
        ))}
      </ul>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title="Nouveau service"
          description="La clé sert dans les adresses et ne change plus ensuite."
        >
          <ServiceForm onDone={() => setCreateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceRow }) {
  const router = useRouter();
  const [label, setLabel] = useState(service.label);
  const [sort, setSort] = useState(String(service.sort));
  const [fns, setFns] = useState(service.functions.join("\n"));
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, start] = useTransition();
  const dirty =
    label !== service.label ||
    sort !== String(service.sort) ||
    lines(fns).join("\n") !== service.functions.join("\n");
  return (
    <form
      className="flex h-full flex-col gap-3 rounded-box border border-(--card-frame) bg-surface p-4 shadow-rest"
      data-testid="directory-service-card"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(
            saveDirectoryService({
              id: service.id,
              data: { key: service.key, label, sort, functions: lines(fns) },
            }),
          );
          if (!res.ok) return void toast.error(res.error);
          toast.success("Service enregistré.");
          router.refresh();
        });
      }}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-control border border-border bg-surface-2 px-1.5 font-mono text-label text-fg-muted">
          {service.key}
        </span>
        <span className="text-small text-fg-muted">
          <span className="tabular">{service.used}</span> {pl(service.used, "contact")}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <Field label="Libellé" required>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
        </Field>
        <Field label="Ordre">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Fonctions proposées" hint="Une par ligne, dans l'ordre d'affichage.">
        <Textarea value={fns} onChange={(e) => setFns(e.target.value)} rows={5} />
      </Field>
      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={!dirty}>
          <Save aria-hidden /> Enregistrer
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={service.used > 0}
          title={service.used > 0 ? "Utilisé par des contacts : non supprimable" : undefined}
          onClick={() => setConfirmDel(true)}
        >
          <Trash2 aria-hidden /> Supprimer
        </Button>
      </div>
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent title={`Supprimer « ${service.label} » ?`} description="Action définitive.">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>
              Retour
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const res = await safeCall(deleteDirectoryService(service.id));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Service supprimé.");
                  setConfirmDel(false);
                  router.refresh();
                })
              }
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}

function ServiceForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [sort, setSort] = useState("100");
  const [fns, setFns] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(
            saveDirectoryService({ data: { key, label, sort, functions: lines(fns) } }),
          );
          if (!res.ok) return void toast.error(res.error);
          toast.success("Service créé.");
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Clé" required hint="Ex. securite (minuscules, sans accent).">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
            maxLength={30}
            pattern="[a-z][a-z0-9_\-]{1,29}"
            required
          />
        </Field>
        <Field label="Ordre">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Libellé" required>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
      </Field>
      <Field label="Fonctions proposées" hint="Une par ligne.">
        <Textarea value={fns} onChange={(e) => setFns(e.target.value)} rows={4} />
      </Field>
      <DialogFooter>
        <Button type="submit" variant="primary" loading={pending}>
          <Save aria-hidden /> Créer le service
        </Button>
      </DialogFooter>
    </form>
  );
}
