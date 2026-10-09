import { redirect } from "next/navigation";

// Ancienne page « Nouvelle entrée » : la barre d'écriture du Journal la remplace (train et catégorie pré-remplis).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ train?: string; categorie?: string }>;
}) {
  const { train, categorie } = await searchParams;
  const sp = new URLSearchParams();
  if (typeof train === "string" && train) sp.set("train", train.slice(0, 20));
  if (typeof categorie === "string" && categorie) sp.set("categorie", categorie.slice(0, 20));
  redirect(sp.size ? `/operations/journal?${sp}` : "/operations/journal");
}
