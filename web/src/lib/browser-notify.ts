"use client";

// Notifications du navigateur (demande du 10 oct. 2026) : urgences, mentions et retards de train quand l'onglet CSM est
// en arrière-plan. Réglage par navigateur (la permission l'est aussi), dans « Affichage ». Le contenu d'une mention ou
// d'une urgence n'est jamais affiché sur l'écran du système (il peut citer un voyageur) : titre seul.

export const BROWSER_NOTIFY_KEY = "csm-notifications-navigateur";
export const BROWSER_NOTIFY_KINDS = ["urgent", "mention", "train"] as const;

type Item = { id: string; kind: string; title: string; body: string; link: string };

export function browserNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserNotifyEnabled(): boolean {
  if (!browserNotifySupported() || Notification.permission !== "granted") return false;
  try {
    return window.localStorage.getItem(BROWSER_NOTIFY_KEY) === "on";
  } catch {
    return false;
  }
}

export function setBrowserNotify(on: boolean) {
  try {
    window.localStorage.setItem(BROWSER_NOTIFY_KEY, on ? "on" : "off");
  } catch {}
}

/** Un seul onglet affiche une notification donnée (les autres voient la marque posée dans le stockage partagé). */
function claim(id: string): boolean {
  try {
    const k = `csm-notif-vue:${id}`;
    if (window.localStorage.getItem(k)) return false;
    window.localStorage.setItem(k, String(Date.now()));
    // Ménage : marques de plus de 2 jours.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("csm-notif-vue:")) continue;
      if (Date.now() - Number(window.localStorage.getItem(key)) > 2 * 86_400_000)
        window.localStorage.removeItem(key);
    }
    return true;
  } catch {
    return true;
  }
}

/** Corps affiché : retards de train seulement (gares, minutes) ; jamais le texte d'une mention ou d'une urgence. */
export function notificationBody(item: Pick<Item, "kind" | "body">): string {
  if (item.kind === "train") return item.body.slice(0, 160);
  return item.kind === "urgent" ? "Urgence au Journal" : "Mention au Journal";
}

export function shouldNotify(item: Pick<Item, "kind">, hidden: boolean, enabled: boolean): boolean {
  return enabled && hidden && (BROWSER_NOTIFY_KINDS as readonly string[]).includes(item.kind);
}

/** Affiche la notification (service worker de la PWA s'il existe — obligatoire sur Android —, sinon `Notification`). */
export async function showBrowserNotification(item: Item, onOpen: () => void) {
  if (!claim(item.id)) return;
  const options: NotificationOptions = {
    body: notificationBody(item),
    tag: item.id,
    icon: "/icons/icon-192.png",
    data: { link: item.link },
  };
  try {
    const n = new Notification(item.title, options);
    n.onclick = () => {
      window.focus();
      onOpen();
      n.close();
    };
  } catch {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.showNotification(item.title, options);
    } catch {}
  }
}
