// Analyse incrémentale d'un flux Server-Sent Events (format text/event-stream).
export type SseEvent = { event: string; data: string; id?: string };

export class SseParser {
  private buffer = "";

  /** Ajoute un morceau de texte et renvoie les événements complets qu'il termine. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const events: SseEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const event: SseEvent = { event: "message", data: "" };
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (!line || line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "event") event.event = value;
        else if (field === "data") data.push(value);
        else if (field === "id") event.id = value;
      }
      if (data.length === 0 && event.event === "message") continue;
      event.data = data.join("\n");
      events.push(event);
    }
    return events;
  }
}

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
