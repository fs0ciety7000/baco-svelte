import { Phone } from "lucide-react";

import { dialable } from "@/lib/pmr/model";

/** Téléphone : softphone `etrali:` sur poste fixe (comme la v1), `tel:` sur mobile (décision du 8 octobre 2026). */
export function PhoneLink({ phone }: { phone: string }) {
  const n = dialable(phone);
  if (!n) return <span>{phone}</span>;
  const cls = "min-h-11 items-center gap-1.5 link md:min-h-0";
  return (
    <>
      <a href={`etrali:${n}`} className={`${cls} hidden md:inline-flex`}>
        <Phone aria-hidden className="size-3.5" /> {phone}
      </a>
      <a href={`tel:${n}`} className={`${cls} inline-flex md:hidden`}>
        <Phone aria-hidden className="size-3.5" /> {phone}
      </a>
    </>
  );
}
