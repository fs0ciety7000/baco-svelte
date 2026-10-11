"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { onlineAgents } from "@/app/(app)/equipe/actions";
import { Button } from "@/components/ui/button";
import { subscribeLive } from "@/lib/live";
import { safeCall } from "@/lib/orders/safe-call";
import { pl } from "@/lib/utils";
import type { OnlineMember } from "@/server/data/team";

import { Avatar } from "./avatar";

// « En ligne maintenant » (demande du 11 oct. 2026) : agents qui ont un onglet CSM ouvert, en direct (sujet SSE
// « presence » produit par le serveur Next, server/presence.ts). Pastille verte qui pulse ; liste au clic.

const TIME = new Intl.DateTimeFormat("fr-BE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});

function Pulse({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`relative inline-flex size-2.5 ${className ?? ""}`}>
      <span className="absolute inset-0 scale-[1.9] rounded-full bg-ok/35 animate-pulse-dot" />
      <span className="relative inline-flex size-2.5 rounded-full bg-ok" />
    </span>
  );
}

export function OnlinePresence() {
  const [agents, setAgents] = useState<OnlineMember[] | null>(null);
  const [me, setMe] = useState("");
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const r = await safeCall(onlineAgents());
    busy.current = false;
    if (r.ok) {
      setAgents(r.data.agents);
      setMe(r.data.me);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeLive(["presence"], () => void refresh());
  }, [refresh]);

  const count = agents?.length ?? 0;
  const label = agents ? `${count} ${pl(count, "agent")} en ligne` : "Agents en ligne";

  return (
    <Menu.Root onOpenChange={(open) => open && void refresh()}>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          aria-label={label}
          title={label}
          data-testid="online-presence"
          className="relative gap-2 px-2.5"
        >
          <Users className="size-5" aria-hidden />
          <Pulse className="absolute top-2 right-2 md:static" />
          <span className="hidden tabular text-small md:inline">{agents ? count : "…"}</span>
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(20rem,calc(100vw-1rem))] border border-border-strong bg-surface data-[state=open]:animate-fade-in"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Pulse />
            <span className="text-small font-medium">En ligne maintenant</span>
            <span className="ml-auto tabular text-small text-fg-muted">{count}</span>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1" data-testid="online-list">
            {!agents ? (
              <li className="px-3 py-2 text-small text-fg-muted">Chargement…</li>
            ) : agents.length === 0 ? (
              <li className="px-3 py-2 text-small text-fg-muted">Personne pour l&apos;instant.</li>
            ) : (
              agents.map((a) => (
                <li key={a.id} className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                  <span className="relative">
                    <Avatar name={a.name} email="" id={a.id} avatar={a.avatar} />
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-ok"
                    />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-small font-medium">
                      {a.name}
                      {a.id === me ? <span className="text-fg-muted"> (toi)</span> : null}
                    </span>
                    <span className="truncate text-hint text-fg-muted">
                      {[a.status, a.district, `depuis ${TIME.format(new Date(a.since))}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
          <Menu.Item asChild className="outline-none data-[highlighted]:bg-surface-2">
            <Link
              href="/equipe"
              className="flex h-control items-center border-t border-border px-3 text-small"
            >
              Voir l&apos;équipe
            </Link>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
