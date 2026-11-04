import { describe, expect, it } from "vitest";
import {
  archiveReference,
  isOrderRef,
  ORDER_REF_ALPHABET,
  orderDeleteLabel,
  orderRefLabel,
  orderRefQuery,
} from "./order-ref";

describe("n° de commande", () => {
  it("reconnaît le format CMD-XXXXXX", () => {
    expect(isOrderRef("CMD-7K4P2M")).toBe(true);
    expect(isOrderRef("CMD-7K4P2")).toBe(false);
    expect(isOrderRef("CMD-7K4P2O")).toBe(false); // O exclu
    expect(isOrderRef("CMD-1K4P2M")).toBe(false); // 1 exclu
    expect(isOrderRef("TC_123456")).toBe(false);
  });
  it("alphabet sans caractères ambigus", () => {
    for (const c of "01ILOU") expect(ORDER_REF_ALPHABET).not.toContain(c);
    expect(ORDER_REF_ALPHABET).toHaveLength(30);
  });
  it("lit une saisie de recherche", () => {
    expect(orderRefQuery("cmd-7k4p")).toBe("CMD-7K4P");
    expect(orderRefQuery("CMD 7K4P2M")).toBe("CMD-7K4P2M");
    expect(orderRefQuery("CMD7K4P2M")).toBe("CMD-7K4P2M");
    expect(orderRefQuery("7k4p2m")).toBe("7K4P2M");
    expect(orderRefQuery("cmd")).toBe("CMD-");
  });
  it("ignore ce qui n'est pas un n° de commande", () => {
    expect(orderRefQuery("1234")).toBeNull();
    expect(orderRefQuery("Mons")).toBeNull();
    expect(orderRefQuery("TC_12345")).toBeNull();
    expect(orderRefQuery("BRUXEL")).toBeNull(); // 6 lettres sans chiffre : un nom de gare
    expect(orderRefQuery("123456")).toBeNull(); // n° TC / de train
    expect(orderRefQuery("CMD-OOOO")).toBeNull();
  });
});

describe("désignation affichée", () => {
  it("n° de commande à la place du n° séquentiel", () => {
    expect(orderRefLabel("CMD-7K4P2M", 328)).toBe("CMD-7K4P2M");
    expect(orderRefLabel("", 328)).toBe("n° 328");
    expect(orderRefLabel(null, 0)).toBe("—");
  });
  it("confirmation de suppression : n° TC entre parenthèses", () => {
    expect(orderDeleteLabel("bus", "CMD-7K4P2M", 328, " TC_123 ")).toBe("bus CMD-7K4P2M (TC_123)");
    expect(orderDeleteLabel("bus", "CMD-7K4P2M", 328, "R-1")).toBe("bus CMD-7K4P2M");
    expect(orderDeleteLabel("taxi", "CMD-3QX9WB", 4, "TC_9")).toBe("taxi CMD-3QX9WB");
  });
  it("référence d'une archive ancienne", () => {
    expect(archiveReference("Bon bus n° 328", "bus", "CMD-7K4P2M")).toBe("Bon bus CMD-7K4P2M");
    expect(archiveReference("TC_123", "bus", "CMD-7K4P2M")).toBe("Bon bus CMD-7K4P2M · TC_123");
    expect(archiveReference("Taxi n° 4", "taxi", "CMD-3QX9WB")).toBe("Taxi CMD-3QX9WB");
    expect(archiveReference("Bon bus CMD-7K4P2M · TC_1", "bus", "CMD-7K4P2M")).toBe(
      "Bon bus CMD-7K4P2M · TC_1",
    );
    expect(archiveReference("Taxi n° 4", "taxi", "")).toBe("Taxi n° 4");
  });
});
