import { Phone } from "lucide-react";

import { dialable } from "@/lib/pmr/model";
import { e164 } from "@/lib/telephony";

/**
 * Téléphone cliquable : `tel:` (Genesys Cloud sur poste fixe, téléphone sur mobile) ; `etrali:` sur poste fixe si l'agent
 * a choisi Etrali dans « Affichage » (`html[data-telephony="etrali"]`, `globals.css`). Les deux liens sont rendus : aucun
 * écart d'hydratation, le CSS choisit.
 */
export function PhoneLink({ phone }: { phone: string }) {
  const n = dialable(phone);
  if (!n) return <span>{phone}</span>;
  const cls = "min-h-11 items-center gap-1.5 link md:min-h-0";
  return (
    <>
      <a href={`tel:${e164(phone)}`} className={`${cls} phone-tel inline-flex`}>
        <Phone aria-hidden className="size-3.5" /> {phone}
      </a>
      <a href={`etrali:${n}`} className={`${cls} phone-etrali hidden`}>
        <Phone aria-hidden className="size-3.5" /> {phone}
      </a>
    </>
  );
}
