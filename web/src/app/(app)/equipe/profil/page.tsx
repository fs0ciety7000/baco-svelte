import type { Metadata } from "next";

import { ProfileForms } from "@/components/team/profile-forms";
import { requireRoute } from "@/server/auth";
import { getMyProfile } from "@/server/data/team";

export const metadata: Metadata = { title: "Mon profil · CSM" };

export default async function Page() {
  const user = await requireRoute("/equipe/profil");
  const profile = await getMyProfile(user.id);
  return <ProfileForms profile={profile} />;
}
