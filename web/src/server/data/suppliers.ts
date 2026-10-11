import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { parseEmails } from "@/lib/orders/schemas";
import { foldStation } from "@/lib/stations/search";

import { pbForRequest } from "./orders";

// Fournisseurs (Commandes › Fournisseurs, 11 oct. 2026) : sociétés de bus (chauffeurs, contacts, lignes desservies) et
// de taxi, lues avec le jeton de l'agent (règles PocketBase : `otto:read` / `generate_taxi:read`).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown) =>
  (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && !!x.trim());

export type SupplierKind = "bus" | "taxi";

export type SupplierRow = {
  kind: SupplierKind;
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  /** Adresse (bus) ou lieux desservis (taxi), pour la liste. */
  where: string;
};

export type Person = { id: string; name: string; phone: string };

export type BusSupplier = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  drivers: Person[];
  contacts: Person[];
  lines: { id: string; line: string }[];
  /** Bons qui citent la société (suppression impossible s'il y en a). */
  orders: number;
};

export type TaxiSupplier = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  addresses: string[];
  places: string[];
  notes: string[];
  orders: number;
};

function busRow(r: RecordModel): SupplierRow {
  return {
    kind: "bus",
    id: r.id,
    name: str(r.name),
    emails: parseEmails(str(r.email)),
    phones: str(r.phone) ? [str(r.phone)] : [],
    where: str(r.address),
  };
}

function taxiRow(r: RecordModel): SupplierRow {
  return {
    kind: "taxi",
    id: r.id,
    name: str(r.name),
    emails: parseEmails(strings(r.emails)),
    phones: strings(r.phones),
    where: strings(r.places).join(", "),
  };
}

/** Liste filtrée (nom, e-mail, téléphone, adresse ou lieux ; accents et casse ignorés), triée par nom. */
export async function listSuppliers(kind: SupplierKind, q = ""): Promise<SupplierRow[]> {
  const pb = await pbForRequest();
  const rows =
    kind === "bus"
      ? (await pb.collection("bus_companies").getFullList({ sort: "name", batch: 500 })).map(busRow)
      : (await pb.collection("taxi_companies").getFullList({ sort: "name", batch: 500 })).map(
          taxiRow,
        );
  const needle = foldStation(q);
  if (!needle) return rows;
  return rows.filter((r) =>
    foldStation([r.name, r.where, ...r.emails, ...r.phones].join(" ")).includes(needle),
  );
}

const idSchema = z.string().regex(/^[a-z0-9-]{15,36}$/);

async function countOrders(collection: string, field: string, id: string): Promise<number> {
  const pb = await pbForRequest();
  return pb
    .collection(collection)
    .getList(1, 1, { filter: pb.filter(`${field} = {:id}`, { id }), fields: "id" })
    .then((r) => r.totalItems)
    .catch(() => 0);
}

export async function getBusSupplier(id: string): Promise<BusSupplier> {
  const cid = idSchema.parse(id);
  const pb = await pbForRequest();
  const byCompany = { filter: pb.filter("company = {:c}", { c: cid }), batch: 500 };
  const [c, drivers, contacts, lines, orders] = await Promise.all([
    pb.collection("bus_companies").getOne(cid),
    pb.collection("bus_drivers").getFullList({ ...byCompany, sort: "name" }),
    pb.collection("bus_contacts").getFullList({ ...byCompany, sort: "name" }),
    pb.collection("bus_company_lines").getFullList({ ...byCompany, sort: "line" }),
    countOrders("bus_orders", "company", cid),
  ]);
  const person = (r: RecordModel): Person => ({
    id: r.id,
    name: str(r.name),
    phone: str(r.phone),
  });
  return {
    id: c.id,
    name: str(c.name),
    email: str(c.email),
    phone: str(c.phone),
    address: str(c.address),
    notes: str(c.notes),
    drivers: drivers.map(person),
    contacts: contacts.map(person),
    lines: lines
      .map((l) => ({ id: l.id, line: str(l.line) }))
      .sort((a, b) => a.line.localeCompare(b.line, "fr", { numeric: true })),
    orders,
  };
}

export async function getTaxiSupplier(id: string): Promise<TaxiSupplier> {
  const cid = idSchema.parse(id);
  const pb = await pbForRequest();
  const [c, orders] = await Promise.all([
    pb.collection("taxi_companies").getOne(cid),
    countOrders("taxi_orders", "taxi_company", cid),
  ]);
  return {
    id: c.id,
    name: str(c.name),
    emails: strings(c.emails),
    phones: strings(c.phones),
    addresses: strings(c.addresses),
    places: strings(c.places),
    notes: strings(c.notes),
    orders,
  };
}
