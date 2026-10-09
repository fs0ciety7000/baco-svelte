import { redirect } from "next/navigation";

// Ancienne adresse de l'onglet Groupes (renommée /groupes le 9 oct. 2026) : les liens et favoris suivent.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    if (typeof v === "string" && /^[a-z]{1,20}$/.test(k)) sp.set(k, v.slice(0, 100));
  redirect(sp.size ? `/groupes?${sp}` : "/groupes");
}
