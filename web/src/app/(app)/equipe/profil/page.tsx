import type { Metadata } from "next";

import { ProfileForms } from "@/components/team/profile-forms";
import { brusselsDay } from "@/lib/orders/time";
import { homeOf } from "@/lib/home";
import { can } from "@/lib/permissions";
import { statusOf } from "@/lib/team";
import { requireRoute } from "@/server/auth";
import { getMyActivity, getMyProfile } from "@/server/data/team";
import { passkeysEnabled } from "@/server/passkeys";

export const metadata: Metadata = { title: "Mon profil · CSM" };

export default async function Page() {
  const user = await requireRoute("/equipe/profil");
  const [profile, activity] = await Promise.all([getMyProfile(user.id), getMyActivity(user.id)]);
  const duty = user.duty_day === brusselsDay() ? (user.duty_districts ?? []) : [];
  return (
    <ProfileForms
      profile={profile}
      activity={activity}
      duty={duty}
      canExtension={can(user, "deplacements:write")}
      passkeys={passkeysEnabled()}
      status={statusOf(user.status, user.status_day, brusselsDay())}
      home={homeOf(user.preferences)}
    />
  );
}
