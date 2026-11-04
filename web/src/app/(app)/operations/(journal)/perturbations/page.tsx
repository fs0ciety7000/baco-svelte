import type { Metadata } from "next";

import { JournalScreen, type JournalSearch } from "../journal/journal-screen";

export const metadata: Metadata = { title: "Perturbations · Journal · CSM" };

/** Journal › Perturbations : perturbations et travaux annoncés par iRail (4 nov. 2026). */
export default function Page({ searchParams }: { searchParams: Promise<JournalSearch> }) {
  return <JournalScreen view="perturbations" searchParams={searchParams} />;
}
