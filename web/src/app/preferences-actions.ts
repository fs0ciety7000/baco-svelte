"use server";

import { cookies } from "next/headers";

import { UI_COOKIE, uiPreferencesSchema, type UiPreferences } from "@/design/preferences";
import { env } from "@/server/env";

export async function saveUiPreferences(input: UiPreferences): Promise<void> {
  const prefs = uiPreferencesSchema.parse(input);
  (await cookies()).set(UI_COOKIE, JSON.stringify(prefs), {
    httpOnly: true,
    secure: env.CSM_COOKIE_SECURE,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
}
