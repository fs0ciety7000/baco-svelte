import type { Metadata } from "next";

import { JournalScreen, type JournalSearch } from "./journal-screen";

export const metadata: Metadata = { title: "Infos · Journal · CSM" };

/** Journal › Infos : messages des agents (4 nov. 2026). */
export default function Page({ searchParams }: { searchParams: Promise<JournalSearch> }) {
  return <JournalScreen view="infos" searchParams={searchParams} />;
}
