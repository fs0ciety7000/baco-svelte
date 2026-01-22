/**
 * Constantes pour le module Déplacements PMR
 */

export const PRESET_STATIONS_FMS = [
    'FMS', 'FSG', 'FGH', 'FJR', 'LVRS', 'ATH', 'FBC', 'FLZ', 'FNG'
];

export const PRESET_STATIONS_FTY = [
    'FTY', 'ATH', 'FMC', 'FNG', 'FLZ', 'FLN'
];

export const ASSIGNEES = [
    "ACP TEMP (Blaise)",
    "CPI BUFFER FTY",
    "CPI BUFFER FMS",
    "CPI FMS",
    "CPI FBC",
    "CPI FTY",
    "OPI 1",
    "OPI 2",
    "SPI FTY",
    "SPI FMS",
    "SPI Buffer FMS",
    "SPI Buffer FTY",
    "Team Leader",
    "MPI",
    "PA",
    "OPI 5-13",
    "OPI 13-21",
    "PA 10-18",
    "CPI 10-18",
    "SPI 10-18"
];

export const COLORS = {
    sncb: [0, 105, 180],
    sncbHex: '#0069B4',
    mons: [0, 32, 80],
    monsHex: '#002050',
    tournai: [168, 111, 168],
    tournaiHex: '#a86fa8',
    zeroRed: '#be4366',
    zeroRedRGB: [190, 67, 102],
    morningBg: '#d1b4d4',
    morningBgRGB: [209, 180, 212],
    afternoonBg: '#ADBC16',
    afternoonBgRGB: [173, 188, 22],
    presenceBadgeBg: '#e5e7eb',
    presenceBadgeBgRGB: [229, 231, 235]
};

export const EMAIL_CONFIG = {
    to: "cedric.thiels@belgiantrain.be;luc.deconinck@belgiantrain.be;b4u.mons@belgiantrain.be;paco.mons@belgiantrain.be;785um.OUMonsPermanence@belgiantrain.be;gare.mons.quai@belgiantrain.be;785ut.OUTournaiPermanence@belgiantrain.be;gare.tournai.quai@belgiantrain.be;gare.braine.le.comte.quai@belgiantrain.be",
    cc: "mathieu.debaisieux@belgiantrain.be"
};

export const ROLES_KEYWORDS = [
    "ACP", "CPI", "OPI", "SPI", "PA", "Team Leader", "MPI", "10-18"
];

export const DEFAULT_PRESENCE = {
    spi: 0,
    opi: 0,
    cpi: 0,
    pa: 0,
    shift_10_18: 0
};

export const PERIODS = {
    MORNING: 'morning',
    AFTERNOON: 'afternoon'
};
