import { redirect } from "next/navigation";

// Le tableau de bord arrive à l'étape 3.
export default function Home() {
  redirect("/commandes");
}
