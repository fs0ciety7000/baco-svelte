"use client";

import { useEffect } from "react";

import { applyTelephony } from "@/lib/telephony";

/** Applique le choix de téléphonie du navigateur (Genesys Cloud / Etrali) aux liens téléphone. */
export function TelephonyInit() {
  useEffect(() => applyTelephony(), []);
  return null;
}
