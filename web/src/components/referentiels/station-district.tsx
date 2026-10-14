"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setStationDistrict } from "@/app/(app)/referentiels/gares/actions";
import { Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";

/** Choix du district d'une gare (droit `ptcar:update`) ; « Automatique » rend la proposition de l'import. */
export function StationDistrict({
  id,
  name,
  district,
  manual,
}: {
  id: string;
  name: string;
  district: string;
  manual: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label={`District de ${name}`}
      value={manual ? district || "hors" : "auto"}
      disabled={pending}
      className="min-w-36"
      data-testid="station-district"
      onChange={(e) => {
        const v = e.target.value;
        start(async () => {
          const res = await setStationDistrict({
            id,
            district: v === "auto" ? "auto" : v === "hors" ? "" : v,
          }).catch(() => null);
          if (!res) return void toast.error("Serveur injoignable : réessaie.");
          if (!res.ok) return void toast.error(res.error);
          toast.success(`${name} : district enregistré.`);
          router.refresh();
        });
      }}
    >
      <option value="auto">
        Automatique{!manual && district ? ` (${district})` : !manual ? " (aucun)" : ""}
      </option>
      <option value="DSO">DSO · Sud-Ouest</option>
      <option value="DSE">DSE · Sud-Est</option>
      <option value="DCE">DCE · Centre</option>
      <option value="DNO">DNO · Nord-Ouest</option>
      <option value="DNE">DNE · Nord-Est</option>
      <option value="hors">Sans district</option>
    </Select>
  );
}
