import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Hors requête : cookies() échoue, comme pendant le rendu d'une page (le refus doit tenir quand même).
vi.mock("next/headers", () => ({
  cookies: async () => {
    throw new Error("hors requête");
  },
}));

import { createPb, markReadOnlyToken } from "./pocketbase";

const future = Math.floor(Date.now() / 1000) + 600;

describe("client PocketBase « Voir en tant que »", () => {
  it("refuse toute écriture avec un jeton en lecture seule, avant tout appel réseau", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    markReadOnlyToken("jeton-cible", future, "Ana");
    const pb = createPb("jeton-cible");
    await expect(pb.collection("bus_orders").create({ status: "brouillon" })).rejects.toMatchObject(
      {
        status: 403,
        message: "Lecture seule : tu vois CSM en tant que Ana.",
      },
    );
    await expect(pb.collection("users").update("x", { name: "y" })).rejects.toMatchObject({
      status: 403,
    });
    await expect(pb.collection("users").delete("x")).rejects.toMatchObject({ status: 403 });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("laisse passer les lectures et le jeton de fichier", async () => {
    markReadOnlyToken("jeton-cible-2", future);
    const pb = createPb("jeton-cible-2");
    const get = await pb.beforeSend!("http://pb/api/collections/users/records", { method: "GET" });
    expect(get).toMatchObject({ url: "http://pb/api/collections/users/records" });
    const file = await pb.beforeSend!("http://pb/api/files/token", { method: "POST" });
    expect(file).toMatchObject({ url: "http://pb/api/files/token" });
  });

  it("ne touche pas aux autres jetons", () => {
    expect(createPb("jeton-agent").beforeSend).toBeUndefined();
    expect(createPb().beforeSend).toBeUndefined();
  });
});
