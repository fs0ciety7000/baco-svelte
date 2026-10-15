// Planificateur de tâches PMR — moteur pur (sans réseau, sans horloge cachée), partagé serveur / navigateur.

export * from "./types";
export {
  taskWindow,
  linkConnections,
  pmrCategory,
  isPmr,
  isCancelled,
  stationKey,
  LIGHT_TYPES,
  WHEELCHAIR_TYPES,
  PMR_TYPES,
} from "./window";
export type { PmrCategory } from "./window";
export { travelMinutes, coverage, baseByCode, isBaseStation } from "./travel";
export type { Coverage } from "./travel";
export { agentTimeline } from "./timeline";
export type { AgentTimeline, TimelineItem } from "./timeline";
export { checkAssign, suggestAgents, autoAssign, bcsLoad } from "./assign";
export type { AgentSuggestion, AutoProposal, AutoResult } from "./assign";
export { parseTaskLines } from "./parse-task";
export type { ParsedTask, ParseIssue, ParseOptions, ParseResult } from "./parse-task";
export { hhmm, isWeekendOrHoliday } from "./time";
