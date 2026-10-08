"use client";

import { useRouter } from "next/navigation";

import { LogComposer, type ComposerPreset } from "@/components/ops/log-composer";
import type { Agent, LinkedObject } from "@/server/data/ops";

/** Page dédiée (mobile) : après publication, retour au fil sur l'entrée publiée. */
export function NewEntryForm(props: {
  agents: Agent[];
  linkKinds: LinkedObject["kind"][];
  preset: ComposerPreset;
}) {
  const router = useRouter();
  return (
    <LogComposer
      {...props}
      autoFocus
      onDone={(id) => router.push(`/operations/main-courante?entree=${id}`)}
    />
  );
}
