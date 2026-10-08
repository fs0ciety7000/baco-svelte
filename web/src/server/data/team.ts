import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { pbForRequest } from "./orders";

// Équipe (décisions du 9 oct. 2026 : annuaire léger, profil, Nouveautés ; pas de planning, congés, « présents » ni
// partie sociale). Lecture côté serveur avec le jeton de l'agent. `users` étant lisible par tout agent actif, on ne
// demande QUE les champs affichés (`fields`) : rôle, droits, préférences ou dates de blocage ne quittent jamais le
// serveur pour l'annuaire (une règle PocketBase ne masque pas un champ).

const str = (v: unknown) => (typeof v === "string" ? v : "");

export type TeamMember = {
  id: string;
  name: string;
  username: string;
  fonction: string;
  district: string;
  role: string;
};

const MEMBER_FIELDS = "id,name,username,fonction,district,role";

function member(r: RecordModel): TeamMember {
  return {
    id: r.id,
    name: str(r.name) || str(r.username) || "Agent",
    username: str(r.username),
    fonction: str(r.fonction),
    district: str(r.district),
    role: str(r.role),
  };
}

export const teamListSchema = z.object({
  q: z.string().trim().max(60).default(""),
  district: z.enum(["Sud-Ouest", "Sud-Est", "Centre"]).optional().catch(undefined),
});

/** Annuaire de l'équipe : comptes actifs (hors compte de service du connecteur DICOS). */
export async function listTeam(input: z.input<typeof teamListSchema>): Promise<TeamMember[]> {
  const p = teamListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = ['role != "disabled"', 'role != "connector"'];
  if (p.district) parts.push(pb.filter("district = {:d}", { d: p.district }));
  if (p.q) parts.push(pb.filter("(name ~ {:q} || username ~ {:q} || fonction ~ {:q})", { q: p.q }));
  const rows = await pb.collection("users").getFullList({
    filter: parts.join(" && "),
    sort: "name,username",
    fields: MEMBER_FIELDS,
  });
  return rows.map(member);
}

export type MyProfile = TeamMember & { email: string };

export async function getMyProfile(id: string): Promise<MyProfile> {
  const pb = await pbForRequest();
  const r = await pb.collection("users").getOne(id, { fields: `${MEMBER_FIELDS},email` });
  return { ...member(r), email: str(r.email) };
}

// ---------------------------------------------------------------------------------------------------
// Nouveautés (changelog)

export const CHANGELOG_TYPES = {
  nouveau: { label: "Nouveau", tone: "ok" },
  ameliore: { label: "Amélioré", tone: "info" },
  corrige: { label: "Corrigé", tone: "warn" },
} as const;
export type ChangelogType = keyof typeof CHANGELOG_TYPES;

export type ChangelogEntry = {
  id: string;
  title: string;
  type: ChangelogType;
  content: string;
  author: string;
  created: string;
};

export async function listChangelog(page = 1) {
  const pb = await pbForRequest();
  const res = await pb.collection("changelog").getList(Math.max(1, Math.min(200, page)), 20, {
    sort: "-created",
    expand: "author",
    fields: "id,title,type,content,created,expand.author.name,expand.author.username",
  });
  return {
    page: res.page,
    totalPages: res.totalPages,
    items: res.items.map((r): ChangelogEntry => ({
      id: r.id,
      title: str(r.title),
      type: (str(r.type) in CHANGELOG_TYPES ? r.type : "nouveau") as ChangelogType,
      content: str(r.content),
      author: str(r.expand?.author?.name) || str(r.expand?.author?.username),
      created: str(r.created),
    })),
  };
}
