import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TvBoard, type TvStationBoards } from "@/components/ops/tv-board";
import { brusselsDay, brusselsTime } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { buildHandover, handoverDistricts } from "@/server/data/handover";
import { board, stations } from "@/server/irail";

import { LiveRefresh } from "../(app)/commandes/live-refresh";

export const metadata: Metadata = { title: "Écran commun · CSM" };
export const dynamic = "force-dynamic";

/**
 * Écran commun du bureau (demande du 10 oct. 2026) : grand tableau de bord plein écran, sans menus, rafraîchi en direct.
 * Écran partagé : AUCUN nom de voyageur (même synthèse que la relève). `?district=DSO|DSE|DCE|tous`, `?gare=` (départs et
 * arrivées iRail, Mons par défaut), `?theme=foret|rail` (Forêt par défaut ; demande du 10 oct. 2026).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ district?: string; gare?: string; theme?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "journal:read")) notFound();
  const { district, gare, theme } = await searchParams;
  const codes = handoverDistricts(user, district);
  const [data, boards] = await Promise.all([
    buildHandover(user, codes),
    stationBoards((gare ?? "Mons").trim().slice(0, 60) || "Mons"),
  ]);
  return (
    <main
      className="min-h-dvh bg-bg p-4 text-fg md:p-6"
      data-testid="tv"
      data-theme={theme === "rail" ? "rail" : "foret"}
    >
      <TvBoard
        data={data}
        boards={boards}
        scope={codes.length ? codes.join(" · ") : "Tous districts"}
      />
      <div className="fixed right-4 bottom-3 opacity-70">
        <LiveRefresh
          topics={[
            "bus_orders",
            "taxi_orders",
            "pmr_assists",
            "group_missions",
            "ops_log",
            "mission_trains",
            "alea_marks",
          ]}
        />
      </div>
    </main>
  );
}

/** Départs et arrivées iRail de la gare (cache serveur partagé avec « Trains en direct ») ; jamais bloquant. */
async function stationBoards(name: string): Promise<TvStationBoards> {
  try {
    const key = name.toLowerCase();
    const st = (await stations()).find((x) => x.name.toLowerCase() === key);
    if (!st) return { station: name, departures: null, arrivals: null };
    const now = new Date();
    const at = { stationId: st.id, day: brusselsDay(now), time: brusselsTime(now) };
    const [dep, arr] = await Promise.all([
      board({ ...at, kind: "departure" }).catch(() => null),
      board({ ...at, kind: "arrival" }).catch(() => null),
    ]);
    return {
      station: st.name,
      departures: dep?.board.rows ?? null,
      arrivals: arr?.board.rows ?? null,
    };
  } catch {
    return { station: name, departures: null, arrivals: null };
  }
}
