"use client";

import { Bus, Car, Copy, FileDown, Plus, Send, Train } from "lucide-react";
import { useRef, useState } from "react";

import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDisclosure, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox, SwitchField } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import {
  AutosaveIndicator,
  FormSection,
  Segmented,
  Timeline,
  ToggleChip,
} from "@/components/ui/form-kit";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState, Kbd, PageHeader, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Stat, StatCard, StatStrip } from "@/components/ui/stat-card";
import {
  Badge,
  ORDER_STATUS,
  StatusBadge,
  statusColor,
  type OrderStatus,
} from "@/components/ui/status-badge";
import { ScrollTable } from "@/components/ui/scroll-table";
import { ListCard, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { TrainChip } from "@/components/ui/train-chip";
import { SegmentedNav } from "@/components/ui/filters";
import { ListCount, ListStatus, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { OrderTicket } from "@/components/orders/order-ticket";
import { contrast } from "@/design/contrast";
import type { UiPreferences } from "@/design/preferences";
import {
  AUTO_THEMES,
  autoThemes,
  COLOR_TOKENS,
  isAutoChoice,
  THEMES,
  themeById,
} from "@/design/tokens";
import { useStaggerIn } from "@/lib/motion-core";
import { lineLabel } from "@/lib/lines";

import { PickersDemo } from "./pickers-demo";
import { SearchDemo } from "./search-demo";

// Données fictives uniquement (aucune donnée réelle sur cette page).
const ORDERS: {
  id: string;
  type: "bus" | "taxi";
  date: string;
  route: string;
  ref: string;
  status: OrderStatus;
  buses: number;
}[] = [
  {
    id: "C3-0412",
    type: "bus",
    date: "08/10 06:40",
    route: "Mons → La Louvière-Centre",
    ref: "TC_0000412",
    status: "brouillon",
    buses: 3,
  },
  {
    id: "C3-0411",
    type: "bus",
    date: "08/10 05:55",
    route: "Namur → Ciney",
    ref: "TC_0000411",
    status: "termine",
    buses: 2,
  },
  {
    id: "TX-0087",
    type: "taxi",
    date: "08/10 09:15",
    route: "Charleroi-Central → Couvin",
    ref: "Dossier 0087",
    status: "envoye",
    buses: 1,
  },
  {
    id: "C3-0410",
    type: "bus",
    date: "07/10 22:10",
    route: "Liège-Guillemins → Visé",
    ref: "TC_0000410",
    status: "termine",
    buses: 1,
  },
  {
    id: "C3-0409",
    type: "bus",
    date: "07/10 18:30",
    route: "Tournai → Mouscron",
    ref: "TC_0000409",
    status: "termine",
    buses: 2,
  },
  {
    id: "TX-0086",
    type: "taxi",
    date: "07/10 14:00",
    route: "Arlon → Libramont",
    ref: "Dossier 0086",
    status: "annule",
    buses: 1,
  },
  {
    id: "C3-0413",
    type: "bus",
    date: "08/10 —",
    route: "Ottignies → Wavre",
    ref: "—",
    status: "brouillon",
    buses: 1,
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-stagger aria-labelledby={`${id}-titre`} className="flex flex-col gap-4">
      <h2 id={`${id}-titre`} className="display border-b border-border pb-2 text-h3 text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Swatches({ themeId }: { themeId: (typeof THEMES)[number]["id"] }) {
  const t = themeById(themeId);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {COLOR_TOKENS.map((k) => {
        // Contraste affiché : sur le fond, sauf accent-fg (mesuré sur l'accent, là où il est utilisé).
        const against = k === "accent-fg" ? t.colors.accent : t.colors.bg;
        const onBg =
          k === "bg" || k.startsWith("surface") || k.startsWith("border")
            ? null
            : contrast(t.colors[k], against);
        return (
          <div key={k} className="flex flex-col gap-1">
            <div className="h-10 border border-border" style={{ background: t.colors[k] }} />
            <span className="font-mono text-small text-fg">{k}</span>
            <span className="font-mono text-small text-fg-muted tabular">
              {t.colors[k]}
              {onBg ? ` · ${onBg.toFixed(1)}:1` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Échantillon compact rendu dans un thème donné (data-theme local). */
function ThemeSample({ themeId }: { themeId: (typeof THEMES)[number]["id"] }) {
  const t = themeById(themeId);
  return (
    <div
      data-theme={t.id}
      data-scheme={t.scheme}
      className="flex flex-col gap-3 border border-border bg-bg p-4 text-fg"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-fg-muted">{t.label}</span>
        <span className="font-mono text-small text-fg-muted">
          {t.scheme === "dark" ? "sombre" : "clair"}
        </span>
      </div>
      <p className="display text-h3">Commandes</p>
      <p className="text-body text-fg-muted">Texte secondaire lisible à 14 px.</p>
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="brouillon" />
        <StatusBadge status="termine" />
        <StatusBadge status="annule" />
      </div>
      <Input placeholder="Gare d'origine" aria-label={`Exemple de champ, thème ${t.label}`} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm">
          Envoyer
        </Button>
        <Button size="sm">Dupliquer</Button>
      </div>
    </div>
  );
}

export function DesignShowcase({ initial }: { initial: UiPreferences }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ui, setUi] = useState(initial);
  const [filter, setFilter] = useState<"all" | "today" | "toConfirm">("all");
  const [counts, setCounts] = useState({ active: 12, toConfirm: 4, today: 9, late: 1 });
  const [sheetOpen, setSheetOpen] = useState(false);
  useStaggerIn(ref);

  const current = isAutoChoice(ui.theme) ? autoThemes(ui.theme).dark : ui.theme;

  return (
    <div
      ref={ref}
      className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-6 md:px-6 md:py-8"
    >
      <PageHeader
        eyebrow={`Design system · ${THEMES.length} thèmes · AA vérifié`}
        title="Bibliothèque CSM"
        description="Chaque composant de web/src/components/ui, dans le thème choisi. Données fictives."
        actions={
          <>
            <Button
              onClick={() =>
                toast("Lien copié", { description: "Adresse de la page dans le presse-papiers." })
              }
            >
              <Copy /> Copier le lien
            </Button>
            <Button variant="primary">
              <Plus /> Nouveau BC
            </Button>
          </>
        }
      />

      <Section id="themes" title="Thème et densité">
        <ThemeSwitcher value={ui} onChange={setUi} />
        <p className="text-body text-fg-muted">
          « Automatique » suit le système : le thème Nuit de la direction en sombre, son thème Jour
          en clair (défaut : {themeById(AUTO_THEMES.dark).label} /{" "}
          {themeById(AUTO_THEMES.light).label}). La densité compacte réduit contrôles et lignes à 32
          px (44 px restent garantis sur écran tactile).
        </p>
        <Swatches themeId={current} />
        {/* Profondeur (v4) : la page, la carte, la zone, le survol ; ombre de repos et ombre flottante. */}
        <div data-testid="depth" className="grid gap-3 rounded-box bg-bg p-3 sm:grid-cols-4">
          {(
            [
              ["bg-surface shadow-rest", "Carte · surface + ombre de repos"],
              ["bg-surface-2", "Zone · surface-2"],
              ["bg-surface-3", "Survol, actif · surface-3"],
              ["bg-surface shadow-float", "Flottant · ombre flottante"],
            ] as const
          ).map(([cls, label]) => (
            <div key={label} className={`flex h-20 items-end rounded-box p-3 text-small ${cls}`}>
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section id="comparatif" title={`Les ${THEMES.length} thèmes côte à côte`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {THEMES.map((t) => (
            <ThemeSample key={t.id} themeId={t.id} />
          ))}
        </div>
      </Section>

      <Section id="typo" title="Typographie">
        <div className="flex flex-col gap-3">
          <p className="label-mono text-fg-muted">Libellé 12 · // Commandes · 12 actives</p>
          <p className="display text-h1">
            Titre de page (H1 : 24 dans Signal, Quai, Cabine ; 40 ailleurs)
          </p>
          <p className="display text-h2">Titre H2 display 28</p>
          <p className="display text-h3">Titre H3 display 20</p>
          <p className="text-panel font-semibold">Titre de panneau 17 / 24</p>
          <p className="flex items-baseline gap-3">
            <span className="figures text-kpi">1 234</span>
            <span className="text-small text-fg-muted">
              Compteur 30 / 36 en chiffres tabulaires (police du texte dans les directions v4)
            </span>
          </p>
          <p className="text-body-lg">
            Texte courant large 16/24 — Geist, pour les paragraphes importants.
          </p>
          <p className="text-body">
            Texte courant 14/20 — taille minimale du contenu. Chiffres tabulaires :{" "}
            <span className="tabular font-mono">06:40 · 1 234 · TC_0000412</span>
          </p>
          <p className="text-small text-fg-muted">Petit 12/16 — métadonnées, aides de saisie.</p>
        </div>
      </Section>

      <Section id="indicateurs" title="Bande de compteurs et indicateurs">
        <StatStrip data-testid="design-stat-strip">
          <Stat label="Bons à envoyer" value={counts.toConfirm} tone="warn" hint="depuis 30 min" />
          <Stat label="Bons en cours" value={counts.active} />
          <Stat label="Missions PMR du jour" value={counts.today} hint="12 IN · 9 OUT" />
          <Stat label="Groupes du jour" value={0} />
          <Stat label="Impactées (retard)" value={counts.late} tone="danger" />
          <Stat
            label="Filtre « aujourd'hui »"
            value={counts.today}
            active={filter === "today"}
            onClick={() => setFilter(filter === "today" ? "all" : "today")}
          />
        </StatStrip>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          <StatCard
            className="min-w-44 snap-start"
            label="Actives"
            value={counts.active}
            tone="accent"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <StatCard
            className="min-w-44 snap-start"
            label="À envoyer"
            value={counts.toConfirm}
            tone="warn"
            hint="depuis 30 min"
            active={filter === "toConfirm"}
            onClick={() => setFilter("toConfirm")}
          />
          <StatCard
            className="min-w-44 snap-start"
            label="Aujourd'hui"
            value={counts.today}
            tone="info"
            delta={{ value: "+3", good: true }}
            active={filter === "today"}
            onClick={() => setFilter("today")}
          />
          <StatCard
            className="min-w-44 snap-start"
            label="En retard"
            value={counts.late}
            tone="danger"
          />
        </div>
        <div>
          <Button
            size="sm"
            onClick={() => setCounts((c) => ({ ...c, active: c.active + 1, today: c.today + 2 }))}
          >
            Simuler une arrivée de données
          </Button>
        </div>
      </Section>

      <Section id="boutons" title="Boutons">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">
            <Send /> Envoyer le BC
          </Button>
          <Button>
            <Copy /> Dupliquer
          </Button>
          <Button variant="ghost">Annuler</Button>
          <Button variant="danger">Annuler la commande</Button>
          <Button variant="link">Voir l&apos;historique</Button>
          <Button variant="primary" loading>
            Génération du PDF
          </Button>
          <Button disabled>Désactivé</Button>
          <Tooltip content="Télécharger le PDF">
            <Button size="icon" aria-label="Télécharger le PDF">
              <FileDown />
            </Button>
          </Tooltip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Petit</Button>
          <Button>Moyen</Button>
          <Button size="lg" variant="primary">
            Grand
          </Button>
          <span className="flex items-center gap-1 text-small text-fg-muted">
            Raccourci <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </Section>

      <Section id="formulaires" title="Formulaires">
        <Card>
          <CardHeader eyebrow="Bon de commande bus" title="Trajet" />
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Gare d'origine" required hint="Pré-remplie selon ton district.">
              <Input defaultValue="Mons" />
            </Field>
            <Field label="Gare de destination" required error="Choisis une gare de destination.">
              <Input placeholder="Ex. La Louvière-Centre" />
            </Field>
            <Field label="Motif">
              <Select
                defaultValue="travaux"
                options={[
                  { value: "travaux", label: "Travaux" },
                  { value: "incident", label: "Incident" },
                  { value: "greve", label: "Grève" },
                ]}
              />
            </Field>
            <Field label="Nombre de bus">
              <Input type="number" min={1} defaultValue={2} inputMode="numeric" />
            </Field>
            <Field label="Remarques" className="md:col-span-2">
              <Textarea placeholder="Informations utiles au transporteur" />
            </Field>
            <div className="flex min-h-11 items-center gap-3 md:min-h-0">
              <Checkbox id="ar" defaultChecked />
              <Label htmlFor="ar">Aller-retour</Label>
            </div>
            <SwitchField label="Voyageurs PMR à bord" />
          </CardContent>
          <CardFooter className="flex-wrap justify-end">
            <span className="w-full text-small text-fg-muted sm:mr-auto sm:w-auto">
              Brouillon enregistré · 06:41
            </span>
            <Button variant="ghost">Annuler</Button>
            <Button variant="primary">Générer le brouillon</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section id="listes-dates" title="Listes, dates et heures">
        <PickersDemo />
      </Section>

      <Section id="recherche-multi" title="Recherche et choix multiples">
        <SearchDemo />
      </Section>

      <Section id="saisie" title="Saisie des commandes">
        <FormKitDemo />
      </Section>

      <Section id="statuts" title="Statuts et badges">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Live</Badge>
          <Badge tone="info">Bus</Badge>
          <Badge tone="neutral">Taxi</Badge>
          <Badge tone="warn" className="font-mono tabular">
            +6
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-testid="design-train-chips">
          <TrainChip train="2167" />
          <TrainChip train="IC 9632" />
          <TrainChip train="" />
          <TrainChip train="Taxi" taxi />
          <span className="flex items-center gap-1.5 text-small text-fg-muted">
            dans une ligne de texte <TrainChip train="2167" size="sm" /> à 06:42
          </span>
        </div>
      </Section>

      <Section id="onglets" title="Onglets">
        <Tabs defaultValue="bus">
          <TabsList aria-label="Commandes">
            <TabsTrigger value="bus" count={5}>
              <Bus className="size-4" aria-hidden /> Bus
            </TabsTrigger>
            <TabsTrigger value="taxi" count={2}>
              <Car className="size-4" aria-hidden /> Taxi
            </TabsTrigger>
            <TabsTrigger value="suivi">Suivi</TabsTrigger>
            <TabsTrigger value="b201">Remise B201</TabsTrigger>
          </TabsList>
          <TabsContent value="bus">
            <p className="text-body text-fg-muted">
              Le trait ambre glisse vers l&apos;onglet actif (GSAP, 300 ms).
            </p>
          </TabsContent>
          <TabsContent value="taxi">
            <p className="text-body text-fg-muted">Deux commandes taxi en cours.</p>
          </TabsContent>
          <TabsContent value="suivi">
            <p className="text-body text-fg-muted">Suivi commun bus et taxi.</p>
          </TabsContent>
          <TabsContent value="b201">
            <p className="text-body text-fg-muted">
              Remise générée depuis les commandes du service.
            </p>
          </TabsContent>
        </Tabs>
      </Section>

      <Section id="listes" title="Tableau dense et cartes mobiles">
        {/* v4 lot 6 : barre d'outils de liste sur une ligne (vues avec compteurs, recherche) et ligne d'état. */}
        <div className={TOOLBAR}>
          <SegmentedNav
            label="Vue"
            scroll
            items={[
              { label: "À envoyer", href: "/design#listes", current: true, count: 2 },
              { label: "Aujourd'hui", href: "/design?v=j#listes", current: false, count: 5 },
              { label: "Toutes", href: "/design?v=t#listes", current: false },
            ]}
          />
          <ToolbarSearch name="demo-q" placeholder="Gare, relation, n°…" />
          <Button variant="primary" size="sm" className="ml-auto">
            <Plus /> Nouveau bon
          </Button>
        </div>
        <ListStatus count={<ListCount n={ORDERS.length} label="commandes" />} />
        <div className="hidden md:block">
          {/* ScrollTable (15 oct. 2026) : défilement horizontal dans le cadre, première colonne collante, ombres. */}
          <ScrollTable label="Bons de commande" stickyFirst tableClassName="min-w-[56rem]">
            <THead>
              <tr>
                <Th>N° BC</Th>
                <Th>Départ</Th>
                <Th>Trajet</Th>
                <Th>Référence</Th>
                <Th numeric>Véhicules</Th>
                <Th>Statut</Th>
              </tr>
            </THead>
            <tbody>
              {ORDERS.map((o) => (
                <Tr
                  key={o.id}
                  statusColor={statusColor(o.status)}
                  selected={o.id === "C3-0411"}
                  onClick={() => setSheetOpen(true)}
                  className="cursor-pointer"
                >
                  <Td className="font-mono">{o.id}</Td>
                  <Td className="font-mono tabular">{o.date}</Td>
                  <Td>{o.route}</Td>
                  <Td className="text-fg-muted">{o.ref}</Td>
                  <Td numeric>{o.buses}</Td>
                  <Td>
                    <StatusBadge status={o.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </ScrollTable>
        </div>
        <div className="flex flex-col gap-2 md:hidden">
          {ORDERS.slice(0, 4).map((o) => (
            <ListCard
              key={o.id}
              statusColor={statusColor(o.status)}
              title={
                <span className="flex items-center gap-2">
                  <span className="font-mono">{o.id}</span>
                  <span className="truncate">{o.route}</span>
                </span>
              }
              meta={`${o.date} · ${o.ref}`}
              aside={<StatusBadge status={o.status} />}
              onClick={() => setSheetOpen(true)}
            />
          ))}
        </div>
      </Section>

      <Section id="panneaux" title="Dialogues, panneaux et notifications">
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Ouvrir un dialogue</Button>
            </DialogTrigger>
            <DialogContent
              eyebrow="Confirmation"
              title="Marquer comme envoyé ?"
              description="Le brouillon .eml a été ouvert. Confirme que tu l'as envoyé depuis la boîte fonctionnelle."
            >
              <p className="text-body text-fg-muted">
                L&apos;heure et ton nom seront enregistrés dans l&apos;historique.
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Pas encore</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="primary"
                    onClick={() => toast.success("BC envoyé", { description: "C3-0413 · 06:42" })}
                  >
                    Oui, c&apos;est envoyé
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button onClick={() => setSheetOpen(true)}>Ouvrir le détail</Button>
          <Button
            onClick={() =>
              toast.error("Envoi impossible", {
                description: "Le transporteur n'a pas d'adresse e-mail.",
              })
            }
          >
            Toast erreur
          </Button>
          <Button
            onClick={() =>
              toast("Commande annulée", {
                action: { label: "Annuler", onClick: () => toast.info("Annulation défaite") },
              })
            }
          >
            Toast avec action
          </Button>
        </div>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          eyebrow="C3-0411 · Bus"
          title="Namur → Ciney"
          description="2 bus · départ 05:55"
          footer={
            <>
              <Button className="flex-1" onClick={() => setSheetOpen(false)}>
                Fermer
              </Button>
              <Button variant="primary" className="flex-1">
                Valider l&apos;envoi
              </Button>
            </>
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-fg-muted">Statut</dt>
            <dd>
              <StatusBadge status="termine" />
            </dd>
            <dt className="text-fg-muted">Transporteur</dt>
            <dd>Société fictive</dd>
            <dt className="text-fg-muted">Référence</dt>
            <dd className="font-mono">TC_0000411</dd>
          </dl>
        </Sheet>
      </Section>

      <Section id="etats" title="États vides et chargement">
        {/* v4 lot 4 : ligne vide dans le cadre de la liste, période en contrôle segmenté de navigation. */}
        <SegmentedNav
          label="Période"
          items={[
            { label: "Aujourd'hui", href: "/design#etats", current: true },
            { label: "Demain", href: "/design?p=demain#etats", current: false },
            { label: "7 jours", href: "/design?p=7j#etats", current: false },
          ]}
        />
        <EmptyState
          framed
          title="Aucune mission"
          description="Aucune mission PMR pour ces filtres."
        />
        <div className="max-w-sm">
          <OrderTicket
            eyebrow="Aperçu du bon · C3 n° 529"
            route="Quiévrain → Mons"
            when="jeudi 15 octobre 2026 · départ 15:30"
            rows={[
              { label: "Type", value: "Remplacement" },
              { label: "Société", value: "à choisir", tone: "danger" },
            ]}
            stops={["Quiévrain", "Thulin", "Boussu", "Mons"]}
            pdfHref=""
          />
        </div>
        <CardDisclosure title="Passages à niveau" count={2} defaultOpen>
          <p className="text-small text-fg-muted">
            Carte repliable (fiche d&apos;une ligne) : en-tête compact, compteur neutre, chevron.
          </p>
        </CardDisclosure>
        <Card>
          <CardHeader title="Missions impactées" count={0} />
          <CardContent>
            <EmptyState
              title="Aucune mission impactée"
              description="Les retards des trains de mission s'affichent ici."
            />
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState
            variant="first"
            title="Aucune commande"
            description="Rien à envoyer pour l'instant. Les nouvelles commandes apparaîtront ici en direct."
            action={
              <Button variant="primary" size="sm">
                <Plus /> Nouveau BC
              </Button>
            }
          />
          <Card>
            <CardHeader eyebrow="Chargement" title="Commandes du jour" />
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-row" />
              <Skeleton className="h-row" />
              <Skeleton className="h-row w-2/3" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="palette" title="Palette de commandes">
        <Card className="max-w-xl">
          <Command label="Palette de démonstration">
            <CommandInput placeholder="Aller à, créer, rechercher un BC ou une gare…" />
            <CommandList>
              <CommandEmpty>Aucun résultat</CommandEmpty>
              <CommandGroup heading="Créer">
                <CommandItem>
                  <Bus /> Nouveau BC bus
                </CommandItem>
                <CommandItem>
                  <Car /> Nouveau BC taxi
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Aller à">
                <CommandItem>
                  <Train /> Trains en direct
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Card>
      </Section>

      <Card tone="live">
        <CardHeader
          eyebrow={
            <span className="flex items-center gap-2">
              <span className="size-1.5 animate-pulse-dot bg-accent" aria-hidden /> En direct
            </span>
          }
          title="Panneau « live »"
        />
        <CardContent>
          <p className="text-body text-fg-muted">Liseré accent réservé aux zones temps réel.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Briques du formulaire de commande : contrôle segmenté, section repliable, puces, enregistrement, historique. */
function FormKitDemo() {
  const [type, setType] = useState<"2" | "1" | "3">("2");
  const [lines, setLines] = useState(["96"]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FormSection index={1} title="Incident" summary="Remplacement · 08/10" state="complete">
        <Segmented
          label="Type C3"
          value={type}
          onChange={setType}
          options={[
            { value: "2", label: "Remplacement" },
            { value: "1", label: "Évacuation" },
            { value: "3", label: "Modif. service planifié" },
          ]}
        />
        {/* Colonne étroite (≈ mobile) : une option ne tient pas → grille de 2 colonnes, libellés sur deux lignes. */}
        <div className="max-w-72" data-testid="segmented-narrow">
          <Segmented
            label="Type C3 (colonne étroite)"
            value={type}
            onChange={setType}
            options={[
              { value: "2", label: "Remplacement" },
              { value: "1", label: "Évacuation" },
              { value: "3", label: "Modif. service planifié" },
            ]}
          />
        </div>
        <SwitchField
          reverse
          label="Trajet spécifique"
          hint="Tout le libellé est cliquable (44 px au moins)."
          defaultChecked
        />
        <div className="flex flex-wrap gap-2">
          {["96", "97", "118"].map((l) => (
            <ToggleChip
              key={l}
              pressed={lines.includes(l)}
              onPressedChange={(on) => setLines((x) => (on ? [...x, l] : x.filter((y) => y !== l)))}
            >
              {lineLabel(l)}
            </ToggleChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          <AutosaveIndicator state="saving" />
          <AutosaveIndicator state="saved" savedAt={new Date()} />
          <AutosaveIndicator state="error" onRetry={() => toast("Nouvel essai")} />
        </div>
      </FormSection>
      <FormSection index={2} title="Historique" state="error" summary="3 événements">
        <Timeline
          items={[
            {
              id: "1",
              title: "Création · Brouillon",
              meta: "Agent A · 08/10/2026 09:12",
              color: statusColor("brouillon"),
            },
            {
              id: "2",
              title: "Brouillon → Envoyé",
              meta: "Agent A · 09:20",
              color: statusColor("envoye"),
            },
            {
              id: "3",
              title: "Envoyé → Annulé",
              meta: "Coordinateur · 10:02",
              note: "Trafic rétabli",
              color: statusColor("annule"),
            },
          ]}
        />
      </FormSection>
    </div>
  );
}
