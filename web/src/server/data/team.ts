import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { anyDistrictFilter, parseDistricts } from "@/lib/district-param";

import { brusselsDay } from "@/lib/orders/time";
import { statusOf } from "@/lib/team";

import { pbForRequest } from "./orders";

// Équipe (décisions du 9 oct. 2026 : annuaire léger, profil, Nouveautés ; pas de planning, congés ni partie sociale ;
// « en ligne maintenant » ajouté le 11 oct. à la demande de l'utilisateur, voir server/presence.ts). Lecture côté serveur avec le jeton de l'agent. `users` étant lisible par tout agent actif, on ne
// demande QUE les champs affichés (`fields`) : rôle, droits, préférences ou dates de blocage ne quittent jamais le
// serveur pour l'annuaire (une règle PocketBase ne masque pas un champ).

const str = (v: unknown) => (typeof v === "string" ? v : "");

export type TeamMember = {
  id: string;
  name: string;
  username: string;
  fonction: string;
  district: string;
  /** Districts permanents (rôles v2), sinon le district unique. */
  districts: string[];
  role: string;
  avatar: string;
  workPhone: string;
  /** Statut du jour (vide sinon). */
  status: string;
};

const MEMBER_FIELDS =
  "id,name,username,fonction,district,districts,role,avatar,work_phone,status,status_day";

function member(r: RecordModel): TeamMember {
  return {
    id: r.id,
    name: str(r.name) || str(r.username) || "Agent",
    username: str(r.username),
    fonction: str(r.fonction),
    district: str(r.district),
    districts:
      Array.isArray(r.districts) && r.districts.length
        ? r.districts.map(String)
        : str(r.district)
          ? [str(r.district)]
          : [],
    role: str(r.role),
    avatar: str(r.avatar),
    workPhone: str(r.work_phone),
    status: statusOf(str(r.status), str(r.status_day), brusselsDay()),
  };
}

export const teamListSchema = z.object({
  q: z.string().trim().max(60).default(""),
  /** Un ou plusieurs districts (noms ou codes, paramètre répété) ; vide = tous. */
  district: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((d) => parseDistricts(d, ["Sud-Ouest", "Sud-Est", "Centre"]))
    .catch([]),
});

/** Annuaire de l'équipe : comptes actifs (hors compte de service du connecteur DICOS). */
export async function listTeam(input: z.input<typeof teamListSchema>): Promise<TeamMember[]> {
  const p = teamListSchema.parse(input);
  const pb = await pbForRequest();
  const parts = ['role != "disabled"', 'role != "connector"', 'role != "screen"'];
  if (p.district.length)
    parts.push(
      `(${anyDistrictFilter(pb, "district", p.district)} || ${anyDistrictFilter(pb, "districts", p.district, "~")})`,
    );
  if (p.q) parts.push(pb.filter("(name ~ {:q} || username ~ {:q} || fonction ~ {:q})", { q: p.q }));
  const rows = await pb.collection("users").getFullList({
    filter: parts.join(" && "),
    sort: "name,username",
    fields: MEMBER_FIELDS,
  });
  return rows.map(member);
}

export type OnlineMember = Pick<
  TeamMember,
  "id" | "name" | "district" | "avatar" | "status" | "fonction" | "role"
> & {
  /** Arrivée (ms depuis l'époque). */
  since: number;
};

/** Agents qui ont un onglet CSM ouvert (registre de présence du serveur), du plus ancien au plus récent. */
export async function listOnline(online: { id: string; since: number }[]): Promise<OnlineMember[]> {
  const ids = online
    .map((o) => o.id)
    // Identifiants PocketBase (15 caractères) ou UUID repris de BACO (36 caractères avec tirets).
    .filter((id) => /^[a-z0-9-]{15,36}$/.test(id))
    .slice(0, 200);
  if (!ids.length) return [];
  const pb = await pbForRequest();
  const rows = await pb.collection("users").getFullList({
    filter: pb.filter(
      `role != "disabled" && role != "connector" && role != "screen" && (${ids.map((_, i) => `id = {:i${i}}`).join(" || ")})`,
      Object.fromEntries(ids.map((id, i) => [`i${i}`, id])),
    ),
    fields: MEMBER_FIELDS,
  });
  const since = new Map(online.map((o) => [o.id, o.since]));
  return rows
    .map((r) => {
      const m = member(r);
      return {
        id: m.id,
        name: m.name,
        district: m.district,
        avatar: m.avatar,
        status: m.status,
        fonction: m.fonction,
        role: m.role,
        since: since.get(m.id) ?? Date.now(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
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

// ---------------------------------------------------------------------------------------------------
// Mon activité (profil enrichi, 10 oct. 2026) : compteurs des 30 derniers jours, lus avec le jeton de l'agent (une
// collection illisible pour lui donne « null », pas une erreur).

export type MyActivity = {
  journal: number | null;
  orders: number | null;
  alea: number | null;
};

export async function getMyActivity(id: string): Promise<MyActivity> {
  const pb = await pbForRequest();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().replace("T", " ");
  const count = (collection: string, field: string) =>
    pb
      .collection(collection)
      .getList(1, 1, {
        filter: pb.filter(`${field} = {:id} && created >= {:since}`, { id, since }),
        fields: "id",
        skipTotal: false,
      })
      .then((r) => r.totalItems)
      .catch(() => null);
  const [journal, bus, taxi, alea] = await Promise.all([
    count("ops_log", "author"),
    count("bus_orders", "created_by"),
    count("taxi_orders", "created_by"),
    count("alea_marks", "marked_by"),
  ]);
  return {
    journal,
    orders: bus === null && taxi === null ? null : (bus ?? 0) + (taxi ?? 0),
    alea,
  };
}
