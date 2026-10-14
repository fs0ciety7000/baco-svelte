"use client";

import { useState, useTransition } from "react";

import { setHiddenNotifications } from "@/app/team-actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/notification-prefs";
import { DUTY_CHANGED } from "@/lib/team";

/**
 * Notifications affichées dans la cloche, par catégorie (14 oct. 2026). Les alertes de district (urgences, iRail, retards,
 * DICOS, mentions @district) suivent en plus tes districts du jour.
 */
export function NotificationPrefsCard({ initial }: { initial: NotificationCategory[] }) {
  const [hidden, setHidden] = useState<NotificationCategory[]>(initial);
  const [pending, start] = useTransition();
  const toggle = (id: NotificationCategory, show: boolean) => {
    const next = show ? hidden.filter((x) => x !== id) : [...hidden, id];
    const before = hidden;
    setHidden(next);
    start(async () => {
      const r = await setHiddenNotifications(next);
      if (!r.ok) {
        setHidden(before);
        return void toast.error(r.error);
      }
      // La cloche se recharge (même signal qu'un changement de districts, sans réalerter).
      window.dispatchEvent(new Event(DUTY_CHANGED));
    });
  };
  return (
    <Card data-testid="notification-prefs">
      <CardHeader eyebrow="Préférences" title="Notifications" />
      <CardContent className="flex flex-col gap-1">
        <p className="pb-1 text-small text-fg-muted">
          Ce que la cloche te montre. Les alertes liées à un district ne s&apos;affichent que pour
          tes districts du jour.
        </p>
        {NOTIFICATION_CATEGORIES.map((c) => {
          const on = !hidden.includes(c.id);
          const id = `notif-${c.id}`;
          return (
            <label
              key={c.id}
              htmlFor={id}
              className="flex min-h-11 cursor-pointer items-center gap-3 py-1"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body text-fg">{c.label}</span>
                <span className="text-small text-fg-muted">{c.hint}</span>
              </span>
              <Switch
                id={id}
                checked={on}
                disabled={pending}
                onCheckedChange={(v) => toggle(c.id, v)}
                data-testid={id}
              />
            </label>
          );
        })}
      </CardContent>
    </Card>
  );
}
