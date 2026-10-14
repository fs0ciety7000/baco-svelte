import { permanentRedirect } from "next/navigation";

import { CHANGELOG_LINK } from "@/navigation";

// Les Nouveautés ont quitté Équipe le 14 oct. 2026 : /changelog (CHANGELOG.md + annonces de l'équipe).
export default function Page() {
  permanentRedirect(CHANGELOG_LINK.href);
}
