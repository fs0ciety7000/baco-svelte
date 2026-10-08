import type { Metadata } from "next";
import { cookies } from "next/headers";

import { parseUiCookie, UI_COOKIE } from "@/design/preferences";

import { DesignShowcase } from "./showcase";

export const metadata: Metadata = { title: "Design system · CSM" };

// Page interne : chaque composant de web/src/components/ui dans chaque thème (données fictives).
export default async function DesignPage() {
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
  return <DesignShowcase initial={ui} />;
}
