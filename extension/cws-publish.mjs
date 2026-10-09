#!/usr/bin/env node
// Publication du Connecteur DICOS sur le Chrome Web Store (fiche non répertoriée), API v2 :
//   node extension/cws-publish.mjs <zip Chrome>
// Variables : CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN (OAuth, portée chromewebstore), CWS_PUBLISHER_ID,
// CWS_ITEM_ID. Ne publie que si la version du manifest n'est ni publiée ni déjà soumise. N'affiche jamais un secret.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const zip = process.argv[2];
if (!zip) throw new Error("usage : cws-publish.mjs <zip>");
const version = JSON.parse(readFileSync(join(here, "dicos-connector/manifest.json"), "utf8")).version;
const env = (k) => {
  const v = String(process.env[k] || "").trim();
  if (!v) throw new Error(`variable ${k} absente`);
  return v;
};
const API = "https://chromewebstore.googleapis.com";
const name = `publishers/${encodeURIComponent(env("CWS_PUBLISHER_ID"))}/items/${encodeURIComponent(env("CWS_ITEM_ID"))}`;

async function call(url, init, what) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error_description || body?.error || body?.raw || "";
    throw new Error(`${what} : HTTP ${res.status} ${String(msg).slice(0, 300)}`);
  }
  return body;
}

const token = (
  await call(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("CWS_CLIENT_ID"),
        client_secret: env("CWS_CLIENT_SECRET"),
        refresh_token: env("CWS_REFRESH_TOKEN"),
        grant_type: "refresh_token",
      }),
    },
    "jeton OAuth",
  )
).access_token;
const auth = { authorization: `Bearer ${token}` };

const status = () => call(`${API}/v2/${name}:fetchStatus`, { headers: auth }, "état de la fiche");
const versions = (rev) => (rev?.distributionChannels || []).map((c) => c.crxVersion).filter(Boolean);

const before = await status();
const published = versions(before.publishedItemRevisionStatus);
const submitted = versions(before.submittedItemRevisionStatus);
console.log(
  `Fiche : publiée ${published.join(", ") || "—"} (${before.publishedItemRevisionStatus?.state || "—"}), ` +
    `soumise ${submitted.join(", ") || "—"} (${before.submittedItemRevisionStatus?.state || "—"}) ; manifest v${version}.`,
);
if (published.includes(version) || submitted.includes(version)) {
  console.log(`v${version} déjà publiée ou en cours d'examen : rien à faire.`);
  process.exit(0);
}

const up = await call(
  `${API}/upload/v2/${name}:upload?uploadType=media`,
  { method: "POST", headers: { ...auth, "content-type": "application/zip" }, body: readFileSync(zip) },
  "envoi du paquet",
);
let state = up.uploadState;
for (let i = 0; state === "IN_PROGRESS" && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  state = (await status()).lastAsyncUploadState;
}
if (state !== "SUCCEEDED") throw new Error(`envoi du paquet : état ${state}`);
console.log(`Paquet v${up.crxVersion || version} envoyé.`);

const pub = await call(
  `${API}/v2/${name}:publish`,
  {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
  },
  "publication",
);
console.log(`Publication demandée : ${pub.state} (examen Google, puis mise à jour automatique des navigateurs).`);
