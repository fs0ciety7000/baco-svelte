"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Agent, LinkedObject } from "@/server/data/ops";

import { LogComposer } from "./log-composer";

/** « Nouvelle entrée » : compositeur dépliable en desktop (N), page dédiée en mobile. */
export function ComposerToggle({
  agents,
  linkKinds,
}: {
  agents: Agent[];
  linkKinds: LinkedObject["kind"][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="primary" className="md:hidden">
          <Link href="/operations/main-courante/nouveau">
            <Plus aria-hidden /> Nouvelle entrée
          </Link>
        </Button>
        <Button
          variant={open ? "secondary" : "primary"}
          className="hidden md:inline-flex"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          data-testid="log-new"
        >
          <Plus aria-hidden /> {open ? "Fermer" : "Nouvelle entrée"}
        </Button>
      </div>
      {open ? (
        <div className="hidden border border-border bg-surface p-4 md:block">
          <LogComposer
            agents={agents}
            linkKinds={linkKinds}
            autoFocus
            onDone={() => setOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}
