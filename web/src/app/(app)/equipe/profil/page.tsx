import type { Metadata } from "next";

import { ProfileForms } from "@/components/team/profile-forms";
import { brusselsDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { getMyActivity, getMyProfile } from "@/server/data/team";

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
    />
  );
}
