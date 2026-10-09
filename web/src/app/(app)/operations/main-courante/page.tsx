import { redirect } from "next/navigation";

// « Main courante » renommée « Journal » (9 oct. 2026) : les anciens liens (notifications, favoris) suivent.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    if (typeof v === "string" && /^[a-z]{1,20}$/.test(k)) sp.set(k, v.slice(0, 100));
  redirect(sp.size ? `/operations/journal?${sp}` : "/operations/journal");
}
