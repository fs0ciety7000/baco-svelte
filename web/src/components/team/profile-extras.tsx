"use client";

import { Home, LogOut, MessageSquareQuote, MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  listMySessions,
  logoutOtherDevices,
  revokeMySession,
  setMyHome,
  setMyStatus,
  type MySession,
} from "@/app/(app)/equipe/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { HOME_CHOICES } from "@/lib/home";
import { pbDate, sinceLabel } from "@/lib/orders/time";
import { STATUS_PRESETS } from "@/lib/team";
import { cn } from "@/lib/utils";

/** Statut du jour (demande du 10 oct. 2026) : affiché à côté de ton nom dans le Journal et l'annuaire Équipe. */
export function StatusCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [custom, setCustom] = useState(
    initial && !(STATUS_PRESETS as readonly string[]).includes(initial) ? initial : "",
  );
  const [pending, start] = useTransition();
  const save = (next: string) =>
    start(async () => {
      const r = await setMyStatus(next);
      if (!r.ok) return void toast.error(r.error);
      setValue(next);
      toast.success(next ? `Statut « ${next} » pour aujourd'hui.` : "Statut retiré.");
      router.refresh();
    });
  return (
    <Card>
      <CardHeader eyebrow="// Aujourd'hui" title="Mon statut" />
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">
          Affiché à côté de ton nom dans le Journal et l&apos;annuaire, pour la journée.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Statut du jour">
          {STATUS_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={value === s}
              disabled={pending}
              onClick={() => save(value === s ? "" : s)}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center rounded-control border px-3 text-body transition-colors",
                value === s
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border-strong bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim()) save(custom.trim());
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-small text-fg-muted">Autre statut</span>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={40}
              placeholder="Ex. Renfort DSE"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!custom.trim() || pending}>
            <MessageSquareQuote aria-hidden /> Afficher
          </Button>
          {value ? (
            <Button type="button" variant="ghost" onClick={() => save("")} disabled={pending}>
              Retirer
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

/** Page d'accueil après la connexion ; « Accueil » mène toujours au tableau de bord. */
export function HomeCard({ initial }: { initial: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader eyebrow="// Préférences" title="Page d'accueil" />
      <CardContent className="flex flex-col gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-small text-fg-muted">Après la connexion, ouvrir :</span>
          <Select
            defaultValue={initial}
            disabled={pending}
            aria-label="Page d'accueil"
            onChange={(e) => {
              const v = e.target.value;
              start(async () => {
                const r = await setMyHome(v);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Page d'accueil enregistrée.");
                router.refresh();
              });
            }}
          >
            {HOME_CHOICES.map((c) => (
              <option key={c.href} value={c.href}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <p className="flex items-center gap-1.5 text-small text-fg-muted">
          <Home aria-hidden className="size-4" /> « Accueil » dans le menu reste le tableau de bord.
        </p>
      </CardContent>
    </Card>
  );
}

/** Sessions ouvertes : appareils connectés à ton compte, déconnexion à distance. */
export function SessionsCard() {
  const [items, setItems] = useState<MySession[] | null>(null);
  const [pending, start] = useTransition();
  const load = async () => {
    const r = await listMySessions();
    if (r.ok) setItems(r.data);
  };
  useEffect(() => {
    void load();
  }, []);
  const others = (items ?? []).filter((s) => !s.current).length;
  return (
    <Card>
      <CardHeader eyebrow="// Sécurité" title="Sessions ouvertes" />
      <CardContent className="flex flex-col gap-3">
        {items === null ? null : items.length === 0 ? (
          <p className="text-small text-fg-muted">
            Aucune session suivie (connexion antérieure au suivi des sessions).
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="session-list">
            {items.map((s) => {
              const seen = pbDate(s.lastSeen);
              return (
                <li key={s.id} className="flex items-center gap-3 border border-border px-3 py-2">
                  <MonitorSmartphone aria-hidden className="size-4 shrink-0 text-fg-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-body text-fg">
                      {s.device}
                      {s.current ? <Badge tone="ok">Cet appareil</Badge> : null}
                    </span>
                    <span className="text-small text-fg-muted">
                      {s.ip} · {s.method === "passkey" ? "passkey" : "mot de passe"}
                      {seen ? ` · actif ${sinceLabel(seen)}` : ""}
                    </span>
                  </span>
                  {!s.current ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await revokeMySession(s.id);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success("Appareil déconnecté.");
                          await load();
                        })
                      }
                    >
                      <LogOut aria-hidden /> Déconnecter
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div>
          <Button
            variant="secondary"
            loading={pending}
            data-testid="logout-others"
            onClick={() =>
              start(async () => {
                const r = await logoutOtherDevices();
                if (!r.ok) return void toast.error(r.error);
                toast.success("Tous tes autres appareils sont déconnectés.");
                await load();
              })
            }
          >
            <LogOut aria-hidden /> Déconnecter les autres appareils{others ? ` (${others})` : ""}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
