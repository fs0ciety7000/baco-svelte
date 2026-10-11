import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const load = async () => {
  vi.resetModules();
  return import("./presence");
};

afterEach(() => vi.useRealTimers());

describe("présence en direct", () => {
  it("compte un agent une seule fois avec plusieurs onglets", async () => {
    const p = await load();
    const a = p.joinPresence("aaaaaaaaaaaaaaa");
    const b = p.joinPresence("aaaaaaaaaaaaaaa");
    expect(p.onlineUsers()).toHaveLength(1);
    a();
    b();
  });

  it("garde l'agent pendant le délai de grâce (changement de page) puis le retire", async () => {
    vi.useFakeTimers();
    const p = await load();
    const changes = vi.fn();
    p.onPresenceChange(changes);
    const leave = p.joinPresence("bbbbbbbbbbbbbbb");
    expect(changes).toHaveBeenCalledTimes(1);
    leave();
    vi.advanceTimersByTime(5_000);
    expect(p.onlineUsers()).toHaveLength(1);
    // Nouvel onglet avant la fin du délai : pas de départ, pas d'arrivée annoncés.
    const again = p.joinPresence("bbbbbbbbbbbbbbb");
    expect(changes).toHaveBeenCalledTimes(1);
    again();
    vi.advanceTimersByTime(21_000);
    expect(p.onlineUsers()).toHaveLength(0);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it("ignore une double fermeture du même onglet", async () => {
    const p = await load();
    const a = p.joinPresence("ccccccccccccccc");
    p.joinPresence("ccccccccccccccc");
    a();
    a();
    expect(p.onlineUsers()).toHaveLength(1);
  });
});
