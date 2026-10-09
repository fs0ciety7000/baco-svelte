import { Download, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { CopyButton } from "@/components/pmr/copy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { EXTENSION_NOTES } from "@/lib/pmr/extension-releases";
import { requirePermission } from "@/server/auth";
import { readExtensionRelease } from "@/server/extension";

export const metadata: Metadata = { title: "Extension DICOS · CSM" };

const BROWSER = { chrome: "Chrome / Edge", firefox: "Firefox (≥ 128)" } as const;

const dateFmt = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Brussels",
});

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-2 pl-5 text-body">{children}</ol>;
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-control bg-surface-2 px-1.5 py-0.5 font-mono text-small break-all">
      {children}
    </code>
  );
}

export default async function Page() {
  await requirePermission("deplacements:read");
  const [release, h] = await Promise.all([readExtensionRelease(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";

  return (
    <section className="flex max-w-4xl flex-col gap-4" aria-label="Extension DICOS">
      <Card>
        <CardHeader
          eyebrow="Connecteur DICOS"
          title={release ? `Version ${release.version}` : "Paquets indisponibles"}
        />
        <CardContent className="flex flex-col gap-4">
          <p className="text-body text-fg-muted">
            L&apos;extension lit les missions PMR et les groupes dans ton onglet DICOS connecté,
            puis les envoie à CSM. Elle lit aussi les temps d&apos;arrêt dans ATMS pour
            l&apos;export ALEA. Elle ne stocke aucun mot de passe SNCB.
          </p>
          {release ? (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {release.files.map((f) => (
                  <li
                    key={f.name}
                    className="flex min-w-0 flex-col gap-2 rounded-box border border-border p-3"
                  >
                    <p className="text-body font-semibold">{BROWSER[f.browser]}</p>
                    <Button asChild variant={f.browser === "chrome" ? "primary" : "secondary"}>
                      <a
                        href={`/api/pmr/extension/${encodeURIComponent(f.name)}`}
                        download={f.name}
                      >
                        <Download aria-hidden />
                        Télécharger ({Math.round(f.bytes / 1024)} Ko)
                      </a>
                    </Button>
                    <p className="truncate font-mono text-small text-fg-subtle" title={f.name}>
                      {f.name}
                    </p>
                    <details className="text-small text-fg-muted">
                      <summary className="cursor-pointer">Empreinte SHA-256</summary>
                      <p className="mt-1 font-mono break-all">{f.sha256}</p>
                    </details>
                  </li>
                ))}
              </ul>
              <p className="text-small text-fg-muted">
                Paquets construits le {dateFmt.format(new Date(release.builtAt))}.
              </p>
            </>
          ) : (
            <EmptyState
              title="Aucun paquet sur ce serveur"
              description="Les paquets sont construits par extension/build-zips.sh. Préviens un administrateur."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Avant de commencer" title="Ce qu'il te faut" />
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-body">
            <li>
              Le <strong>jeton de connecteur</strong>, fourni par un administrateur CSM. C&apos;est
              le seul code à saisir : jamais ton mot de passe ni un jeton DICOS.
            </li>
            <li>Un accès DICOS (et ATMS pour les temps d&apos;arrêt) dans ce même navigateur.</li>
            <li>Chrome ou Edge récent, ou Firefox 128 ou plus.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Installation" title="Chrome / Edge" />
          <CardContent>
            <Steps>
              <li>
                Télécharge le paquet Chrome / Edge et dézippe-le dans un dossier que tu gardes (ex.
                Documents).
              </li>
              <li>
                Ouvre <Code>chrome://extensions</Code> (ou <Code>edge://extensions</Code>) et active
                le <strong>mode développeur</strong>.
              </li>
              <li>
                Clique <strong>Charger l&apos;extension non empaquetée</strong> et choisis le
                dossier dézippé.
              </li>
              <li>Épingle l&apos;icône « CSM — Connecteur DICOS » dans la barre du navigateur.</li>
            </Steps>
          </CardContent>
        </Card>
        <Card>
          <CardHeader eyebrow="Installation" title="Firefox" />
          <CardContent className="flex flex-col gap-3">
            <Steps>
              <li>Télécharge le paquet Firefox et dézippe-le.</li>
              <li>
                Ouvre <Code>about:debugging#/runtime/this-firefox</Code>.
              </li>
              <li>
                Clique <strong>Charger un module complémentaire temporaire…</strong> et choisis le
                fichier <Code>manifest.json</Code> du dossier dézippé.
              </li>
            </Steps>
            <p className="text-small text-warn">
              Firefox retire un module temporaire à chaque redémarrage : recommence l&apos;étape 3
              après avoir relancé Firefox.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow="Configuration (une fois)" title="Relier l'extension à CSM" />
        <CardContent>
          <Steps>
            <li>
              Clique l&apos;icône de l&apos;extension. Dans <strong>URL CSM</strong>, colle
              l&apos;adresse de CSM :
              {origin ? (
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <Code>{origin}</Code>
                  <CopyButton text={origin} label="Copier" />
                </span>
              ) : null}
            </li>
            <li>
              Dans <strong>Jeton de connecteur</strong>, colle le jeton reçu de
              l&apos;administrateur.
            </li>
            <li>
              Clique <strong>Enregistrer les réglages</strong> et accepte l&apos;autorisation
              demandée pour le site CSM.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Chaque jour" title="Synchroniser" />
        <CardContent>
          <Steps>
            <li>Ouvre DICOS, connecte-toi et affiche une fois la liste des missions.</li>
            <li>
              Pour les temps d&apos;arrêt de l&apos;ALEA, garde aussi un onglet{" "}
              <strong>ATMS</strong> ouvert et connecté (sinon CSM utilise l&apos;horaire iRail).
            </li>
            <li>
              Dans l&apos;extension, choisis le jour et le nombre de jours puis clique{" "}
              <strong>Synchroniser ce jour</strong>, ou coche{" "}
              <strong>Synchroniser automatiquement</strong>.
            </li>
            <li>
              Vérifie dans Missions PMR la mention « Synchronisé avec DICOS il y a … » : au-delà
              d&apos;une heure, elle passe en orange.
            </li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Mise à jour" title="Passer à une nouvelle version" />
        <CardContent>
          <Steps>
            <li>
              Télécharge le nouveau paquet et dézippe-le à la place de l&apos;ancien dossier
              (remplace les fichiers).
            </li>
            <li>
              Chrome / Edge : dans <Code>chrome://extensions</Code>, clique la flèche{" "}
              <strong>Recharger</strong> de l&apos;extension. Firefox : <strong>Recharger</strong>{" "}
              dans <Code>about:debugging</Code>.
            </li>
            <li>
              <strong>Recharge les onglets DICOS et ATMS</strong> (F5) : sans cela, l&apos;ancien
              script reste actif.
            </li>
            <li>Tes réglages (URL, jeton) sont conservés.</li>
          </Steps>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Dépannage" title="Messages de l'extension" />
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-body sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {TROUBLE.map(([msg, fix]) => (
              <div key={msg} className="contents">
                <dt className="font-medium">{msg}</dt>
                <dd className="text-fg-muted">{fix}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Nouveautés" title="Dernières versions" />
        <CardContent>
          <ol className="flex flex-col gap-4">
            {EXTENSION_NOTES.map((n) => (
              <li key={n.version} className="flex flex-col gap-1">
                <p className="text-body font-semibold">
                  {n.version}{" "}
                  <span className="font-normal text-fg-muted">
                    · {dateFmt.format(new Date(n.date))}
                  </span>
                </p>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-fg-muted">
                  {n.notes.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <p className="flex items-center gap-2 text-small text-fg-muted">
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        Le jeton de connecteur ne donne aucun accès à DICOS. S&apos;il a fuité, demande à un
        administrateur de le changer.
      </p>
    </section>
  );
}

const TROUBLE: [string, string][] = [
  [
    "« Configure l'URL CSM et le jeton de connecteur »",
    "Fais l'étape « Relier l'extension à CSM ».",
  ],
  [
    "« Jeton de connecteur refusé par CSM »",
    "Le jeton est faux ou a été changé : redemande-le à un administrateur.",
  ],
  [
    "« Ingestion DICOS désactivée côté CSM »",
    "Le connecteur n'est pas configuré sur le serveur : préviens un administrateur.",
  ],
  ["« CSM injoignable »", "Vérifie l'URL CSM et ta connexion, puis réessaie."],
  [
    "« Session DICOS non détectée » ou « expirée »",
    "Recharge l'onglet DICOS, reconnecte-toi si besoin et affiche la liste des missions.",
  ],
  ["« Périmètre de gares inconnu »", "Affiche une fois la liste des missions dans DICOS."],
  [
    "« Service de l'extension injoignable » ou « Receiving end does not exist »",
    "Recharge l'extension (page des extensions) puis les onglets DICOS et ATMS.",
  ],
  [
    "Temps d'arrêt ATMS : 0 train",
    "Ouvre ATMS dans un onglet, connecte-toi, puis relance la synchro. L'ALEA utilise iRail en attendant.",
  ],
];
