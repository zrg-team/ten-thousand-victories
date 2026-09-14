import type { CourtPositionId, HeroStats } from '../../state/types';

export type ProfessionalStat = 'martial' | 'logistics' | 'administration' | 'diplomacy';
export type HeroCapability = 'growth' | 'specializations' | 'travel' | 'recovery' | 'residency' | 'cards' | 'lethal';
export interface HeroRulesSnapshot {
  version: 1 | 2;
  capabilities: Record<HeroCapability, boolean>;
  thresholds: number[];
  serviceCap: number;
  deedCap: number;
  trainingPerLevel?: 0 | 2;
}
export type HeroAssignment =
  | { kind: 'home' }
  | { kind: 'court'; seat: CourtPositionId }
  | { kind: 'province'; landId: string }
  | { kind: 'host'; armyId: string }
  | { kind: 'embassy'; kingdomId: string }
  | { kind: 'claim'; landId: string }
  | { kind: 'muster'; orderId: string };
export type HeroLife =
  | { kind: 'active'; locationId: string; assignment: HeroAssignment; sheltering?: string }
  | { kind: 'transit'; originId: string; locationId: string; destinationId: string; path: string[];
      arrivalTurn: number; startedTurn: number; intendedPost: HeroAssignment; protected?: boolean; recovery?: number; audience?: number; blocked?: boolean }
  | { kind: 'recovering'; locationId: string; readyTurn: number; treatmentUsed?: boolean; respec?: boolean }
  | { kind: 'captive'; captorId: string; detentionId: string; capturedTurn: number; exposureId?: string }
  | { kind: 'dead'; memorialId: string };
export type HeroDiscipline = 'stewardship' | 'command' | 'logistics' | 'statecraft';
export type HeroPerkId = 'granary' | 'works' | 'continuity' | 'relief'
  | 'rearguard' | 'prepared-line' | 'orderly-retreat' | 'relief-column'
  | 'quartermaster' | 'provincial-depot' | 'efficient-march' | 'relief-stores'
  | 'resident-broker' | 'court-secretary' | 'patient-audience' | 'custodian';
export type HeroPolicyId = 'hero-apprenticeship' | 'hero-frontier-commission' | 'hero-safe-passage'
  | 'hero-letters-of-credence' | 'hero-field-infirmary' | 'hero-acting-council';
export type HeroDeedKind = 'service' | 'battle' | 'withdrawal' | 'supply' | 'agreement' | 'stabilized' | 'level' | 'rescued' | 'wounded' | 'captured' | 'returned';
export interface HeroDeed { kind: HeroDeedKind; wave: number; turn: number; target?: string; amount?: number }
export interface HeroGrowth {
  version: 1;
  instanceId: string;
  serial: number;
  xp: number;
  firstWindow: number;
  training: Record<ProfessionalStat, number>;
  contributions: Record<ProfessionalStat, number>;
  lastTrained: ProfessionalStat;
  perks: HeroPerkId[];
  discipline?: HeroDiscipline;
  respecUsed: boolean;
  windows: Record<string, { service: number; deed: number; events: string[] }>;
  deeds: HeroDeed[];
  activityTurn?: number;
  assignmentRevision?: number;
  lastPosting?: { assignment: HeroAssignment; placeName?: string };
  uses: Record<string, number>;
  withdrawal?: { destination: string; assignment: HeroAssignment };
}
export interface HeroMemorial {
  id: string; heroId: string; name: string; highestLevel: number; deeds: HeroDeed[];
  fate: 'dead' | 'dismissed' | 'survived'; turn: number; wave: number; encounterId?: string;
  formerAssignment?: HeroAssignment;
  formerPlaceName?: string;
  acceptedRisk?: { exposureId: string; revision: number; consentRevision?: number; trapped: boolean; held: boolean };
}
export interface HeroExposure {
  id: string; heroId: string; instanceId: string; landId: string; captorId?: string;
  window: number; warnedTurn: number; revision: number; trapped: boolean;
  hold?: boolean; deadlyConsentRevision?: number; resolved?: 'safe' | 'wounded' | 'captured' | 'dead';
  acknowledged?: boolean;
  pauseIssued?: boolean;
  /** The revision the player opened Heroes over from the paused badge. Seen is not decided. */
  seenRevision?: number;
  forecast?: HeroRiskForecast;
}
export interface HeroRiskForecast {
  signature: string; lossIn?: number; lossPct?: number; source: 'invasion' | 'field' | 'capture' | 'unknown';
  arrivalTurn?: number; destinationId?: string; route: string[]; enemyIds: string[];
  observedTurn: number; ratio?: number;
}
export interface HeroReleaseQuote {
  heroId: string; instanceId: string; revision: string; method: 'gold' | 'concession'; cost: number;
}
export interface HeroMetricEvent {
  id: string; type: string; runId: string; rulesVersion: number; instanceId: string; role: string;
  turn: number; window: number; before?: number | string; after?: number | string; choice?: string;
}
export interface HeroMeasurements {
  sequence: number; events: HeroMetricEvent[]; counts: Record<string, number>;
  seasons: Record<string, { available: number; productive: number }>;
  lastSeason: Record<string, number>;
  milestones: Record<string, { level: number; turn: number; window: number; recruitedTurn: number; role: string }[]>;
  recruitedAt: Record<string, number>; offers: Record<string, number>; choices: Record<string, number>;
}
export interface HeroEncounter {
  id: string; landId: string; window: number; startedTurn: number;
  participants: Array<{ heroId: string; instanceId: string; role: ProfessionalStat }>;
  resolved?: boolean;
  captorId?: string;
}
export interface HeroResidentAction {
  id: string; kind: 'supplies' | 'intelligence' | 'release'; heroId: string; kingdomId: string;
  instanceId?: string; targetRevision?: string;
  targetId?: string; dueTurn: number; startedTurn: number; window: number; influence: number;
}
export interface HeroDepthState {
  rules: HeroRulesSnapshot;
  runId: string;
  sequence: number;
  eventSequence: number;
  encounters: Record<string, HeroEncounter>;
  exposures: Record<string, HeroExposure>;
  memorials: HeroMemorial[];
  notices: Array<{ heroId: string; kind: 'level' | 'wounded' | 'captured' | 'dead' | 'arrived' | 'recovered'; level?: number }>;
  policies: HeroPolicyId[];
  policyUses: Record<string, number>;
  residentActions: HeroResidentAction[];
  effects: Array<{ id: string; kind: 'supply' | 'continuity' | 'commission' | 'mentoring' | 'acting';
    heroId: string; targetId: string; untilTurn: number; value?: number; otherId?: string; restore?: HeroAssignment;
    mentorInstance?: string; studentInstance?: string; mentorRevision?: number; studentRevision?: number; productionUntilTurn?: number }>;
  concessions: Array<{ kingdomId: string; expiresWindow: number }>;
  intel: Array<{ wave: number; kingdomId: string; composition: string; mix?: { spearmen: number; archers: number; heavy: number } }>;
  processingTurn?: number;
  chroniclePending?: boolean;
  measurements?: HeroMeasurements;
}
export interface HeroSeasonSnapshot {
  turn: number; window: number;
  service: Array<{ heroId: string; instanceId: string; assignment: string; assignmentRevision: number; stat: ProfessionalStat; loyalty?: number }>;
}
export interface HeroCommandResult { ok: boolean; reason?: string; cost?: number }
export interface HeroTransferPreview {
  ok: boolean; reason?: string; heroId: string; instanceId: string; from: string; destination: string;
  path: string[]; turns: number; assignment: HeroAssignment; revision: string; supplies: number;
  lostStats?: HeroStats;
  /** The hero sitting in the post now, who is relieved when this one arrives. */
  displaces?: string;
}
