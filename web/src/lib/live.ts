"use client";

// Relais temps réel partagé (SSE /api/events) : UNE seule connexion par onglet, quel que soit le nombre de composants
// abonnés. Chaque `EventSource` garde une connexion HTTP ouverte ; en HTTP/1.1 le navigateur n'en autorise que 6 par
// domaine : au-delà (accueil avec plusieurs widgets en direct + cloche), la navigation se bloquait (10 oct. 2026).
// Le flux est rouvert avec l'union des sujets quand les abonnements changent.

export type LiveState = "connexion" | "direct" | "coupé";
type Sub = {
  topics: string[];
  onChange: (collection: string) => void;
  onState: (s: LiveState) => void;
};

const subs = new Map<number, Sub>();
let seq = 0;
let source: EventSource | null = null;
let key = "";
let state: LiveState = "connexion";
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(s: LiveState) {
  state = s;
  for (const sub of subs.values()) sub.onState(s);
}

function rebuild() {
  rebuildTimer = null;
  const topics = [...new Set([...subs.values()].flatMap((s) => s.topics))].sort();
  const next = topics.join(",");
  if (next === key && source) return;
  source?.close();
  source = null;
  key = next;
  if (!topics.length) return;
  broadcast("connexion");
  const es = new EventSource(`/api/events?topics=${encodeURIComponent(next)}`);
  source = es;
  es.addEventListener("ready", () => broadcast("direct"));
  es.addEventListener("change", (ev) => {
    let collection = "";
    try {
      collection = String(
        (JSON.parse((ev as MessageEvent).data) as { collection?: string }).collection ?? "",
      );
    } catch {}
    for (const sub of subs.values())
      if (!collection || sub.topics.includes(collection)) sub.onChange(collection);
  });
  es.onerror = () => broadcast("coupé");
}

function schedule() {
  // Regroupe les abonnements d'un même rendu (plusieurs widgets montés ensemble) : un seul flux ouvert.
  if (!rebuildTimer) rebuildTimer = setTimeout(rebuild, 0);
}

/** S'abonne aux sujets (collections) ; renvoie la fonction de désabonnement. */
export function subscribeLive(
  topics: string[],
  onChange: (collection: string) => void,
  onState: (s: LiveState) => void = () => {},
): () => void {
  const id = ++seq;
  subs.set(id, { topics, onChange, onState });
  onState(source && topics.every((t) => key.split(",").includes(t)) ? state : "connexion");
  schedule();
  return () => {
    subs.delete(id);
    schedule();
  };
}
