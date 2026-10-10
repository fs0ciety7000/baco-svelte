"use server";

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";
import {
  internal,
  passkeysEnabled,
  relyingParty,
  storeChallenge,
  takeChallenge,
} from "@/server/passkeys";
import { allow } from "@/server/rate-limit";
import { writeSessionToken } from "@/server/session";
import { startSession } from "@/server/sessions";
import { homeOf } from "@/lib/home";
import { createPb } from "@/server/pocketbase";
import { tokenPayload } from "@/server/token";

// Passkeys (décision du 10 oct. 2026) : enregistrement depuis le profil (agent connecté), connexion depuis /connexion.

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown, msg = "Opération refusée."): { ok: false; error: string } => {
  unstable_rethrow(e);
  return {
    ok: false,
    error: e instanceof Error && e.message.startsWith("DROIT:") ? e.message.slice(6) : msg,
  };
};
const PK_COOKIE = "csm_pk";

export type MyPasskey = {
  id: string;
  name: string;
  created: string;
  lastUsed: string;
  synced: boolean;
};

export async function listMyPasskeys(): Promise<Result<MyPasskey[]>> {
  try {
    const user = await requireUser();
    const pb = await pbForRequest();
    const rows = await pb.collection("passkeys").getFullList({
      filter: pb.filter("user = {:u}", { u: user.id }),
      sort: "-created",
      fields: "id,name,created,last_used,backed_up",
    });
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: String(r.name ?? "") || "Passkey",
        created: String(r.created ?? ""),
        lastUsed: String(r.last_used ?? ""),
        synced: r.backed_up === true,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function passkeyRegistrationOptions(): Promise<
  Result<PublicKeyCredentialCreationOptionsJSON>
> {
  try {
    if (!passkeysEnabled()) throw new Error("DROIT:Passkeys non activées sur ce serveur.");
    const user = await requireUser();
    const pb = await pbForRequest();
    const existing = await pb.collection("passkeys").getFullList({
      filter: pb.filter("user = {:u}", { u: user.id }),
      fields: "credential_id,transports",
    });
    if (existing.length >= 10) throw new Error("DROIT:10 passkeys au plus : supprimes-en une.");
    const { rpID } = await relyingParty();
    const options = await generateRegistrationOptions({
      rpName: "CSM · Client Solutions",
      rpID,
      userName: user.email || user.username,
      userDisplayName: user.name || user.username || user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: String(c.credential_id),
        transports: Array.isArray(c.transports) ? c.transports : undefined,
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    storeChallenge(`reg:${user.id}`, options.challenge);
    return { ok: true, data: options };
  } catch (e) {
    return fail(e);
  }
}

export async function registerPasskey(
  response: RegistrationResponseJSON,
  name: string,
): Promise<Result> {
  try {
    const user = await requireUser();
    const expectedChallenge = takeChallenge(`reg:${user.id}`);
    if (!expectedChallenge) throw new Error("DROIT:Délai dépassé : recommence.");
    const { rpID, origin } = await relyingParty();
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!v.verified || !v.registrationInfo) throw new Error("DROIT:Passkey non vérifiée.");
    const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
    // Enregistrement par la route interne seulement (la règle PocketBase refuse toute création directe).
    const saved = await internal<{ message?: string }>("register", {
      user: user.id,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: z.string().trim().max(80).catch("").parse(name) || "Passkey",
    });
    if (saved.status !== 200)
      throw new Error(`DROIT:${saved.data.message ?? "Enregistrement refusé."}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e, "Enregistrement de la passkey refusé.");
  }
}

export async function deleteMyPasskey(id: string): Promise<Result> {
  try {
    await requireUser();
    const pb = await pbForRequest();
    await pb.collection("passkeys").delete(
      z
        .string()
        .regex(/^[a-z0-9]{15}$/)
        .parse(id),
    );
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Connexion

export async function passkeyLoginOptions(): Promise<
  Result<PublicKeyCredentialRequestOptionsJSON>
> {
  try {
    if (!passkeysEnabled()) throw new Error("DROIT:Passkeys non activées sur ce serveur.");
    const { rpID } = await relyingParty();
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    const key = crypto.randomUUID();
    storeChallenge(`auth:${key}`, options.challenge);
    (await cookies()).set(PK_COOKIE, key, {
      httpOnly: true,
      secure: env.CSM_COOKIE_SECURE,
      sameSite: "strict",
      path: "/",
      maxAge: 300,
    });
    return { ok: true, data: options };
  } catch (e) {
    return fail(e);
  }
}

export async function passkeyLogin(response: AuthenticationResponseJSON): Promise<Result<string>> {
  const refused = { ok: false as const, error: "Passkey refusée ou inconnue." };
  try {
    const h = await headers();
    const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
    if (!allow(`passkey:${ip}`, 20, 15 * 60_000))
      return { ok: false, error: "Trop d'essais : réessaie dans un quart d'heure." };
    const jar = await cookies();
    const key = jar.get(PK_COOKIE)?.value ?? "";
    jar.delete(PK_COOKIE);
    const expectedChallenge = key ? takeChallenge(`auth:${key}`) : null;
    if (!expectedChallenge) return { ok: false, error: "Délai dépassé : recommence." };
    const found = await internal<{ publicKey?: string; counter?: number; transports?: string[] }>(
      "lookup",
      { credentialId: response.id },
    );
    if (found.status !== 200 || !found.data.publicKey) return refused;
    const { rpID, origin } = await relyingParty();
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: response.id,
        publicKey: isoBase64URL.toBuffer(found.data.publicKey),
        counter: found.data.counter ?? 0,
        transports: found.data.transports as never,
      },
    });
    if (!v.verified) return refused;
    const t = await internal<{ token?: string }>("token", {
      credentialId: response.id,
      counter: v.authenticationInfo.newCounter,
    });
    if (t.status !== 200 || !t.data.token) return refused;
    await writeSessionToken(t.data.token);
    await startSession(t.data.token, "passkey");
    // Page d'accueil choisie par l'agent (préférences lues avec son propre jeton).
    const id = tokenPayload(t.data.token)?.id ?? "";
    const me = id
      ? await createPb(t.data.token)
          .collection("users")
          .getOne(id, { fields: "preferences" })
          .catch(() => null)
      : null;
    return { ok: true, data: homeOf(me?.preferences) };
  } catch (e) {
    unstable_rethrow(e);
    return refused;
  }
}
