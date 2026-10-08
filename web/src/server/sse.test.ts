import { describe, expect, it } from "vitest";

import { formatSse, SseParser } from "./sse";

describe("SseParser", () => {
  it("découpe les événements, même coupés entre deux morceaux", () => {
    const p = new SseParser();
    expect(p.push('id:abc\nevent:PB_CONNECT\ndata:{"clientId":"abc"}\n')).toEqual([]);
    expect(p.push('\nevent: bus_orders/*\ndata: {"action":"update"}\n\n')).toEqual([
      { id: "abc", event: "PB_CONNECT", data: '{"clientId":"abc"}' },
      { event: "bus_orders/*", data: '{"action":"update"}' },
    ]);
  });

  it("ignore les commentaires et gère les fins de ligne CRLF et les données sur plusieurs lignes", () => {
    const p = new SseParser();
    expect(p.push(": ping\r\n\r\ndata: a\r\ndata: b\r\n\r\n")).toEqual([
      { event: "message", data: "a\nb" },
    ]);
  });

  it("formate un événement", () => {
    expect(formatSse("change", { id: "x" })).toBe('event: change\ndata: {"id":"x"}\n\n');
  });
});
