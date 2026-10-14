"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChipRow, FilterChip } from "@/components/ui/filters";

/** Écrans d'Administration › Référentiels (navigation v3) : tableau de bord puis un écran par référentiel. */
export const REF_ADMIN_SCREENS = [
  { href: "/admin/referentiels", label: "Tableau de bord" },
  { href: "/admin/referentiels/gares", label: "Gares et districts" },
  { href: "/admin/referentiels/lignes", label: "Lignes" },
  { href: "/admin/referentiels/ptcar", label: "PtCar" },
  { href: "/admin/referentiels/ebp", label: "EBP" },
  { href: "/admin/referentiels/zones-spi", label: "Zones SPI" },
  { href: "/admin/referentiels/spi", label: "Points SPI" },
  { href: "/admin/referentiels/pn", label: "Passages à niveau" },
  { href: "/admin/referentiels/imports", label: "Imports" },
] as const;

export function RefAdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Référentiels" data-testid="ref-admin-nav">
      <ChipRow>
        {REF_ADMIN_SCREENS.map((s) => {
          const on = pathname === s.href;
          return (
            <FilterChip key={s.href} asChild pressed={on}>
              <Link href={s.href} aria-current={on ? "page" : undefined}>
                {s.label}
              </Link>
            </FilterChip>
          );
        })}
      </ChipRow>
    </nav>
  );
}
