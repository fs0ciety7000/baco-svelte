"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { AtSign, Bell, CheckCheck, Construction, Train, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadNotifications, markNotifications } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { safeCall } from "@/lib/orders/safe-call";
import { pbDate, sinceLabel } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
import type { Notification } from "@/server/data/ops";

const ICON = {
  mention: AtSign,
  urgent: TriangleAlert,
  train: Train,
  systeme: Bell,
  perturbation: Construction,
} as const;

/** Cloche : notifications de l'agent (mentions, urgences, trains suivis), en direct par le relais SSE. */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await safeCall(loadNotifications());
    if (res.ok) {
      setItems(res.data.items);
      setUnread(res.data.unread);
    }
  }, []);

  useEffect(() => {
    void load();
    const source = new EventSource("/api/events?topics=notifications");
    source.addEventListener("change", () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), 400);
    });
    return () => {
      source.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const open = async (n: Notification) => {
    if (!n.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) =>
        list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)),
      );
      void safeCall(markNotifications({ ids: [n.id] }));
    }
    if (n.link) router.push(n.link);
  };

  return (
    <Menu.Root onOpenChange={(o) => o && void load()}>
      <Menu.Trigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={unread ? `Notifications : ${unread} non lue(s)` : "Notifications"}
          className="relative"
          data-testid="bell"
        >
          <Bell className="size-5" />
          {unread ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 grid h-4 min-w-4 place-items-center bg-danger px-1 font-mono text-[11px] leading-none text-bg"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 flex max-h-[min(70dvh,32rem)] w-[min(24rem,calc(100vw-1rem))] flex-col border border-border-strong bg-surface data-[state=open]:animate-fade-in"
          data-testid="bell-menu"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <span className="label-mono text-fg-muted">Notifications</span>
            {unread ? (
              <Menu.Item
                className="inline-flex min-h-9 cursor-pointer items-center gap-1 px-2 text-small text-accent outline-none data-[highlighted]:bg-surface-2"
                onSelect={(e) => {
                  e.preventDefault();
                  setUnread(0);
                  setItems((list) =>
                    list.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })),
                  );
                  void safeCall(markNotifications({ ids: "all" }));
                }}
              >
                <CheckCheck aria-hidden className="size-4" /> Tout marquer lu
              </Menu.Item>
            ) : null}
          </div>
          <div className="overflow-y-auto py-1" aria-live="polite">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-small text-fg-muted">Aucune notification.</p>
            ) : null}
            {items.map((n) => {
              const Icon = ICON[n.kind];
              const at = pbDate(n.created);
              return (
                <Menu.Item
                  key={n.id}
                  className={cn(
                    "flex cursor-pointer gap-3 px-3 py-2 outline-none data-[highlighted]:bg-surface-2",
                    !n.readAt && "bg-accent-faint",
                  )}
                  onSelect={() => void open(n)}
                >
                  <Icon
                    aria-hidden
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      n.kind === "urgent" ? "text-danger" : "text-fg-muted",
                    )}
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn("text-body", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body ? (
                      <span className="line-clamp-2 text-small text-fg-muted">{n.body}</span>
                    ) : null}
                    <span className="text-hint text-fg-muted">{at ? sinceLabel(at) : ""}</span>
                  </span>
                </Menu.Item>
              );
            })}
          </div>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
