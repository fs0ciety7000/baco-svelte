import { NextRequest } from "next/server";

import { env } from "@/server/env";
import { readSessionToken } from "@/server/session";
import { sessionAlive } from "@/server/sessions";
import { formatSse, SseParser } from "@/server/sse";
import { isExpired } from "@/server/token";

// Relais temps réel : le navigateur ouvre un EventSource sur le domaine CSM ; le serveur Next s'abonne au
// temps réel PocketBase (SSE) avec le jeton de l'agent et ne renvoie que { collection, action, id }.
// Les règles de lecture PocketBase filtrent les événements. Pas de WebSocket (pare-feu de l'entreprise).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOPICS = new Set([
  "bus_orders",
  "taxi_orders",
  "bus_companies",
  "b201_reports",
  "pmr_assists",
  "group_missions",
  "dicos_syncs",
  "mission_trains",
  "alea_marks",
  "pmr_equipment",
  "pmr_clients",
  "ops_log",
  "ops_log_reads",
  "notifications",
  "level_crossings",
]);
const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const token = await readSessionToken();
  if (!token || isExpired(token)) return new Response("Non connecté", { status: 401 });
  // Session révoquée (appareil déconnecté depuis le profil) : plus de flux (revue sécurité du 10 oct. 2026).
  if (!(await sessionAlive(token))) return new Response("Session fermée", { status: 401 });

  const requested = (request.nextUrl.searchParams.get("topics") ?? "bus_orders").split(",");
  const topics = requested.filter((t) => TOPICS.has(t));
  if (topics.length === 0) return new Response("Sujet inconnu", { status: 400 });

  const upstreamAbort = new AbortController();
  request.signal.addEventListener("abort", () => upstreamAbort.abort());

  let upstream: Response;
  try {
    upstream = await fetch(`${env.PB_URL}/api/realtime`, { signal: upstreamAbort.signal });
  } catch {
    return new Response("Temps réel indisponible", { status: 502 });
  }
  if (!upstream.ok || !upstream.body)
    return new Response("Temps réel indisponible", { status: 502 });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          upstreamAbort.abort();
        }
      };
      // Reconnexion automatique du navigateur après 3 s si le flux se coupe.
      send("retry: 3000\n\n");
      let beats = 0;
      const heartbeat = setInterval(() => {
        send(": ping\n\n");
        // Toutes les ~2 min : la session est-elle toujours ouverte ? Sinon, le flux est coupé.
        if (++beats % 5 === 0)
          void sessionAlive(token).then((alive) => {
            if (!alive) upstreamAbort.abort();
          });
      }, HEARTBEAT_MS);

      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const event of parser.push(decoder.decode(value, { stream: true }))) {
            if (event.event === "PB_CONNECT") {
              const { clientId } = JSON.parse(event.data) as { clientId: string };
              const res = await fetch(`${env.PB_URL}/api/realtime`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: token },
                body: JSON.stringify({ clientId, subscriptions: topics.map((t) => `${t}/*`) }),
                signal: upstreamAbort.signal,
              });
              if (!res.ok) throw new Error(`abonnement refusé (${res.status})`);
              send(formatSse("ready", { topics }));
              continue;
            }
            const collection = event.event.split("/")[0] ?? "";
            if (!TOPICS.has(collection)) continue;
            const payload = JSON.parse(event.data) as { action?: string; record?: { id?: string } };
            send(
              formatSse("change", { collection, action: payload.action, id: payload.record?.id }),
            );
          }
        }
      } catch {
        // Flux coupé (navigateur parti, PocketBase redémarré) : le navigateur se reconnectera.
      } finally {
        clearInterval(heartbeat);
        upstreamAbort.abort();
        try {
          controller.close();
        } catch {
          // Déjà fermé.
        }
      }
    },
    cancel() {
      upstreamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Désactive la mise en tampon des proxys (Traefik/nginx de Coolify).
      "x-accel-buffering": "no",
    },
  });
}
