"use client";

import { useEffect } from "react";

/** Enregistre le service worker de la PWA (production seulement : en développement, il gênerait le rechargement). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
