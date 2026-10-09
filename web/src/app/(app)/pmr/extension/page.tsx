import { Download, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import { ExtensionConnect } from "@/components/pmr/extension-connect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { can } from "@/lib/permissions";
import { EXTENSION_NOTES } from "@/lib/pmr/extension-releases";
import { requirePermission } from "@/server/auth";
import { env } from "@/server/env";
import { listMyConnectorTokens, readExtensionRelease } from "@/server/extension";

export const metadata: Metadata = { title: "Extension DICOS · CSM" };

const BROWSER = {
  chrome: "Chrome / Edge",
  firefox: "Firefox (module temporaire)",
  "firefox-signed": "Firefox (signée, installation durable)",
} as const;

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
  const user = await requirePermission("deplacements:read");
  const [release, h, tokens] = await Promise.all([
    readExtensionRelease(),
    headers(),
    listMyConnectorTokens(user.id),
  ]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : "";
  const signed = release?.files.some((f) => f.browser === "firefox-signed") ?? false;

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
          {env.CSM_CHROME_STORE_URL ? (
            <div className="flex flex-col gap-2 rounded-box border border-border bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-body">
                <strong>Chrome / Edge : installe depuis le Chrome Web Store</strong>
                <span className="block text-small text-fg-muted">
                  Mises à jour automatiques. Remplace une version installée depuis un .zip (retire
                  l&apos;ancienne, puis reconnecte l&apos;extension à ton compte).
                </span>
              </p>
              <Button asChild>
                <a href={env.CSM_CHROME_STORE_URL} target="_blank" rel="noopener noreferrer">
                  <Download aria-hidden />
                  Chrome Web Store
                </a>
              </Button>
            </div>
          ) : null}
          {release ? (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {release.files.map((f) => (
                  <li
                    key={f.name}
                    className="flex min-w-0 flex-col gap-2 rounded-box border border-border p-3"
                  >
                    <p className="text-body font-semibold">{BROWSER[f.browser]}</p>
                    <Button
                      asChild
                      variant={
                        f.browser === "firefox" ||
                        (f.browser === "chrome" && env.CSM_CHROME_STORE_URL)
                          ? "secondary"
                          : "primary"
                      }
                    >
                      {f.browser === "firefox-signed" ? (
                        // Firefox propose l'installation en ouvrant le .xpi signé (pas de téléchargement).
                        <a href={`/api/pmr/extension/${encodeURIComponent(f.name)}`}>
                          <Download aria-hidden />
                          Installer dans Firefox ({Math.round(f.bytes / 1024)} Ko)
                        </a>
                      ) : (
                        <a
                          href={`/api/pmr/extension/${encodeURIComponent(f.name)}`}
                          download={f.name}
                        >
                          <Download aria-hidden />
                          Télécharger ({Math.round(f.bytes / 1024)} Ko)
                        </a>
                      )}
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
            <li>Un accès DICOS (et ATMS pour les temps d&apos;arrêt) dans ce même navigateur.</li>
            <li>Chrome ou Edge récent, ou Firefox 128 ou plus.</li>
            <li>
              Aucun code à demander : ton <strong>jeton de connecteur</strong> personnel se crée sur
              cette page, à l&apos;étape « Relier l&apos;extension à ton compte ».
            </li>
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
            {signed ? (
              <Steps>
                <li>
                  Ouvre cette page dans Firefox et clique <strong>Installer dans Firefox</strong>.
                </li>
                <li>
                  Autorise le site à proposer l&apos;installation, puis clique{" "}
                  <strong>Ajouter</strong>.
                </li>
                <li>L&apos;extension reste installée après un redémarrage.</li>
              </Steps>
            ) : (
              <>
                <Steps>
                  <li>Télécharge le paquet Firefox et dézippe-le.</li>
                  <li>
                    Ouvre <Code>about:debugging#/runtime/this-firefox</Code>.
                  </li>
                  <li>
                    Clique <strong>Charger un module complémentaire temporaire…</strong> et choisis
                    le fichier <Code>manifest.json</Code> du dossier dézippé.
                  </li>
                </Steps>
                <p className="text-small text-warn">
                  Firefox retire un module temporaire à chaque redémarrage : recommence l&apos;étape
                  3 après avoir relancé Firefox. Une version signée, installée durablement, arrivera
                  ici dès que la signature sur addons.mozilla.org sera configurée.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="Connexion (une fois par navigateur)"
          title="Relier l'extension à ton compte"
        />
        <CardContent className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">
            Chaque agent a son propre jeton, créé ici : rien à demander à un administrateur. Après
            l&apos;installation, recharge cette page puis clique « Connecter l&apos;extension à mon
            compte » : l&apos;extension reçoit l&apos;adresse de CSM et ton jeton. Il reste à ouvrir
            l&apos;extension et à cliquer « Autoriser CSM ».
          </p>
          <ExtensionConnect
            canConnect={can(user, "deplacements:write")}
            latest={release?.version ?? null}
            origin={origin}
            tokens={tokens}
          />
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
        Ton jeton de connecteur ne donne aucun accès à DICOS ni à ton compte CSM : il permet
        seulement d&apos;envoyer des missions. S&apos;il a fuité, révoque-le ci-dessus et reconnecte
        l&apos;extension.
      </p>
    </section>
  );
}

const TROUBLE: [string, string][] = [
  [
    "« Configure l'URL CSM et le jeton de connecteur »",
    "Fais l'étape « Relier l'extension à ton compte ».",
  ],
  [
    "« Jeton de connecteur refusé par CSM »",
    "Le jeton a été révoqué ou est faux : reconnecte l'extension depuis cette page.",
  ],
  ["« Envoi vers CSM pas encore autorisé »", "Ouvre l'extension et clique « Autoriser CSM »."],
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
