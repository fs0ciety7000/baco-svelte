#!/usr/bin/env node
// Services externes simulés pour les E2E et les captures (données fictives, déterministes) :
// - iRail : /v1/stations, /v1/liveboard, /v1/vehicle, /v1/composition, /v1/disturbances ;
// - tuiles raster : /tiles/{z}/{x}/{y}.png (PNG uni, couleur selon la parité de la tuile).
//   node e2e/mock-services.mjs [port]   puis IRAIL_URL=http://127.0.0.1:8094/v1 TILES_URL=http://127.0.0.1:8094/tiles/{z}/{x}/{y}.png
import { createServer } from "node:http";
import { deflateSync } from "node:zlib";

const port = Number(process.argv[2] ?? 8094);

const STATIONS = [
  ["008881000", "Mons", 3.942542, 50.453854],
  ["008883006", "Braine-le-Comte", 4.137662, 50.605079],
  ["008882107", "Saint-Ghislain", 3.818822, 50.442986],
  ["008885001", "Tournai", 3.396944, 50.613056],
  ["008814001", "Bruxelles-Midi", 4.336531, 50.835707],
  ["008883212", "Soignies", 4.069281, 50.573464],
  ["008881190", "Jurbise", 3.910286, 50.530327],
];
const st = (id) => STATIONS.find((s) => s[0] === id) ?? STATIONS[0];
const info = (s) => ({
  id: `BE.NMBS.${s[0]}`,
  name: s[1],
  standardname: s[1],
  locationX: String(s[2]),
  locationY: String(s[3]),
  "@id": `http://irail.be/stations/NMBS/${s[0]}`,
});

// Tableau fictif : départs toutes les 7 min à partir de l'heure demandée, quelques retards, une suppression.
function board(stationId, arrdep, time) {
  const base = new Date();
  // Heure demandée ignorée (le serveur envoie l'heure de Bruxelles) : départs à partir de maintenant.
  void time;
  const others = STATIONS.filter((s) => `BE.NMBS.${s[0]}` !== stationId);
  const rows = Array.from({ length: 12 }, (_, i) => {
    const t = Math.floor(base.getTime() / 1000) + 180 + i * 420;
    const type = ["IC", "L", "P", "S"][i % 4];
    const number = String(2100 + i * 13);
    const delay = i === 1 ? 420 : i === 4 ? 1080 : i === 6 ? 120 : 0;
    return {
      id: String(i),
      station: others[i % others.length][1],
      stationinfo: info(others[i % others.length]),
      time: String(t),
      delay: String(delay),
      canceled: i === 7 ? "1" : "0",
      left: "0",
      isExtra: "0",
      vehicle: `BE.NMBS.${type}${number}`,
      vehicleinfo: {
        name: `BE.NMBS.${type}${number}`,
        shortname: `${type} ${number}`,
        number,
        type,
      },
      platform: String((i % 6) + 1),
      platforminfo: { name: String((i % 6) + 1), normal: i === 3 ? "0" : "1" },
      occupancy: { name: "unknown" },
    };
  });
  const key = arrdep === "arrival" ? "arrivals" : "departures";
  return {
    version: "1.3",
    timestamp: String(Math.floor(Date.now() / 1000)),
    station: st(stationId.replace("BE.NMBS.", ""))[1],
    stationinfo: info(st(stationId.replace("BE.NMBS.", ""))),
    [key]: { number: String(rows.length), [arrdep === "arrival" ? "arrival" : "departure"]: rows },
  };
}

function vehicle(id) {
  const short = id.replace("BE.NMBS.", "");
  const m = /^([A-Z]*)(\d+)$/.exec(short) ?? ["", "IC", "2100"];
  const now = Math.floor(Date.now() / 1000);
  const path = [
    STATIONS[4],
    STATIONS[1],
    STATIONS[5],
    STATIONS[6],
    STATIONS[0],
    STATIONS[2],
    STATIONS[3],
  ];
  const stops = path.map((s, i) => {
    const t = now - 1800 + i * 600;
    return {
      id: String(i),
      station: s[1],
      stationinfo: info(s),
      time: String(t),
      scheduledDepartureTime: String(t),
      scheduledArrivalTime: String(t - 60),
      delay: String(i >= 3 ? 300 : 60),
      canceled: i === 6 && m[2].endsWith("1") ? "1" : "0",
      left: t < now ? "1" : "0",
      arrived: t < now ? "1" : "0",
      isExtraStop: "0",
      platform: String((i % 4) + 1),
      platforminfo: { name: String((i % 4) + 1), normal: "1" },
    };
  });
  return {
    version: "1.3",
    timestamp: String(now),
    vehicle: `BE.NMBS.${short}`,
    vehicleinfo: {
      name: `BE.NMBS.${short}`,
      shortname: `${m[1]} ${m[2]}`,
      number: m[2],
      type: m[1],
    },
    stops: { number: String(stops.length), stop: stops },
  };
}

const composition = {
  version: "1.3",
  composition: {
    segments: {
      number: "1",
      segment: [
        {
          id: "0",
          origin: info(STATIONS[4]),
          destination: info(STATIONS[3]),
          composition: {
            source: "mock",
            units: {
              number: "3",
              unit: [
                {
                  id: "0",
                  materialType: { parent_type: "M7", sub_type: "BMX" },
                  hasPrmSection: "0",
                  hasBikeSection: "0",
                  hasToilets: "1",
                  hasAirco: "1",
                  seatsFirstClass: "0",
                  seatsSecondClass: "120",
                },
                {
                  id: "1",
                  materialType: { parent_type: "M7", sub_type: "BDXH" },
                  hasPrmSection: "1",
                  hasBikeSection: "1",
                  hasToilets: "1",
                  hasAirco: "1",
                  seatsFirstClass: "0",
                  seatsSecondClass: "100",
                },
                {
                  id: "2",
                  materialType: { parent_type: "M7", sub_type: "BMX" },
                  hasPrmSection: "0",
                  hasBikeSection: "0",
                  hasToilets: "0",
                  hasAirco: "1",
                  seatsFirstClass: "60",
                  seatsSecondClass: "40",
                },
              ],
            },
          },
        },
      ],
    },
  },
};

const disturbances = {
  version: "1.3",
  disturbance: [
    {
      id: "0",
      title: "Mons - Saint-Ghislain : Perturbations",
      description: "Dérangement de signalisation (fictif). Retards jusqu'à 15 minutes.",
      type: "disturbance",
      timestamp: String(Math.floor(Date.now() / 1000) - 900),
    },
    {
      id: "1",
      title: "Gand - Courtrai : Situation rétablie",
      description: "Données fictives de test.",
      type: "disturbance",
      timestamp: String(Math.floor(Date.now() / 1000) - 3600),
    },
    {
      id: "2",
      title: "Tournai : travaux le week-end",
      description: "Bus de remplacement entre Tournai et Ath (fictif).",
      type: "planned",
      timestamp: String(Math.floor(Date.now() / 1000) - 86400),
    },
  ],
};

// PNG 256×256 uni (pour les tuiles simulées).
function crcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(r, g, b) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(256 * (1 + 256 * 3));
  for (let y = 0; y < 256; y++) {
    raw[y * (1 + 768)] = 0;
    for (let x = 0; x < 256; x++) {
      const o = y * 769 + 1 + x * 3;
      const line = x % 64 === 0 || y % 64 === 0;
      raw[o] = line ? r - 12 : r;
      raw[o + 1] = line ? g - 12 : g;
      raw[o + 2] = line ? b - 12 : b;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const TILES = [png(236, 232, 222), png(228, 233, 224)];

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const send = (body) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const p = url.pathname.replace(/\/$/, "");
  if (p === "/v1/stations") return send({ version: "1.3", station: STATIONS.map(info) });
  if (p === "/v1/liveboard")
    return send(
      board(
        url.searchParams.get("id") ?? "BE.NMBS.008881000",
        url.searchParams.get("arrdep") ?? "departure",
        url.searchParams.get("time"),
      ),
    );
  if (p === "/v1/vehicle") return send(vehicle(url.searchParams.get("id") ?? "IC2100"));
  if (p === "/v1/composition") return send(composition);
  if (p === "/v1/disturbances") return send(disturbances);
  const t = /^\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(p);
  if (t) {
    res.writeHead(200, { "content-type": "image/png" });
    return res.end(TILES[(Number(t[2]) + Number(t[3])) % 2]);
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log(`services simulés sur http://127.0.0.1:${port}`));
