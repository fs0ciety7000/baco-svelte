"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createRailLine, deleteRailLine } from "@/app/(app)/admin/referentiels/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { lineLabel } from "@/lib/lines";
import { pl } from "@/lib/utils";

export type LineRow = {
  id: string;
  line: string;
  name: string;
  count: number;
  manual: boolean;
  oriented: boolean;
};

/**
 * Administration › Référentiels › Lignes : toutes les lignes du référentiel (`rail_lines`) avec leur état (manuelle,
 * orientée), création d'une ligne absente de l'horaire (ex. L.26) et suppression d'une ligne MANUELLE. Les gares d'une
 * ligne se corrigent dans sa fiche (Réseau › Lignes › « Modifier »), même éditeur.
 */
export function LinesAdmin({ rows }: { rows: LineRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [line, setLine] = useState("");
  const [name, setName] = useState("");
  const [stations, setStations] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<LineRow | null>(null);
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const list = stations
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await createRailLine({ line, name, stations: list });
      if (!res.ok) return setError(res.error);
      toast.success(`${lineLabel(res.data?.line ?? line)} créée`);
      setOpen(false);
      setLine("");
      setName("");
      setStations("");
      router.refresh();
    });

  const remove = (r: LineRow) =>
    start(async () => {
      const res = await deleteRailLine({ id: r.id });
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${lineLabel(r.line)} supprimée`);
      router.refresh();
    });

  const state = (r: LineRow) => (
    <span className="inline-flex flex-wrap gap-1">
      {r.manual ? <Badge tone="info">Manuelle</Badge> : null}
      {!r.oriented ? <Badge tone="warn">Sans km</Badge> : null}
    </span>
  );
  const actions = (r: LineRow) => (
    <div className="flex justify-end gap-1">
      <Button asChild size="icon" variant="ghost">
        <Link
          href={`/reseau/lignes?ligne=${encodeURIComponent(r.line)}`}
          aria-label={`Ouvrir ${lineLabel(r.line)} pour modifier ses gares`}
        >
          <Pencil />
        </Link>
      </Button>
      {r.manual ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Supprimer ${lineLabel(r.line)}`}
          onClick={() => setConfirm(r)}
        >
          <Trash2 className="text-danger" />
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
          data-testid="line-create"
        >
          <Plus /> Nouvelle ligne
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Aucune ligne" description="Rien ne correspond à cette recherche." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Ligne</Th>
                  <Th>Nom</Th>
                  <Th numeric>Gares</Th>
                  <Th>État</Th>
                  <Th className="w-1">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </THead>
              <tbody data-testid="lines-admin-table">
                {rows.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-mono font-semibold">{lineLabel(r.line)}</Td>
                    <Td>{r.name || "—"}</Td>
                    <Td numeric>{r.count}</Td>
                    <Td>{state(r)}</Td>
                    <Td>{actions(r)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="lines-admin-cards">
            {rows.map((r) => (
              <li key={r.id}>
                <ListCard
                  title={
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono">{lineLabel(r.line)}</span> {state(r)}
                    </span>
                  }
                  meta={`${r.name || "—"} · ${r.count} ${pl(r.count, "gare")}`}
                  aside={actions(r)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Nouvelle ligne"
          description="Pour une ligne absente de l'horaire (ex. L.26). Elle reste « manuelle » : l'import quotidien ne l'écrase ni ne la supprime."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <Field label="Numéro de ligne" required hint="26, 161A… (sans « L. »)">
              <Input
                value={line}
                onChange={(e) => setLine(e.target.value.toUpperCase())}
                maxLength={14}
                data-testid="line-number"
              />
            </Field>
            <Field label="Nom" hint="Facultatif : « première gare – dernière gare » par défaut.">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={300} />
            </Field>
            <Field label="Gares, dans l'ordre" required hint="Une gare par ligne, au moins deux.">
              <Textarea
                rows={6}
                value={stations}
                onChange={(e) => setStations(e.target.value)}
                data-testid="line-stations"
              />
            </Field>
            {error ? (
              <p role="alert" className="text-small text-danger" data-testid="line-error">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="primary" loading={pending} data-testid="line-save">
                Créer la ligne
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent
          title={`Supprimer ${confirm ? lineLabel(confirm.line) : ""} ?`}
          description="Seule une ligne créée ou corrigée à la main se supprime. Les bons qui l'ont utilisée gardent leurs arrêts."
        >
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Garder
            </Button>
            <Button variant="danger" loading={pending} onClick={() => confirm && remove(confirm)}>
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
