import { ORDERS_PER_SEASON, PLAYER_KINGDOM_ID } from '../game/constants';
import { GAMEPLAY_MAP_CONFIG } from '../game/gameplayConfig';
import { generateKingHero, heroTemplates } from '../data/heroes';
import { kingdomTemplates } from '../data/kingdoms';
import { rollMuster } from '../data/wardrobe';
import { politicsCardTemplates } from '../data/politicsCards';
import { OPENING_BOONS } from '../data/ascentCards';
import { computeCentroid, computeNeighbors, generateHexMap, type MapGenConfig } from '../map/hexMapGenerator';
import { refreshAllLandOutputs } from '../systems/ResourceSystem';
import { refreshPlayerVisibility } from '../systems/LandSystem';
import { addCourtModifier, createInitialCourtState } from '../systems/CourtSystem';
import { recomputeOpinion } from '../systems/DiplomacySystem';
import { createInitialMandate } from '../systems/empire/MandateSystem';
import { initDirectives } from '../systems/empire/DirectiveSystem';
import { createAscentState, enqueueAscentPrompt } from '../systems/ascent/AscentState';
import { initializeHeroDepthRun } from '../systems/heroes/HeroService';
import { openingGoal } from '../systems/ascent/Goal';
import { carriesAnything, readCarriedOver } from '../systems/ascent/CarriedOver';
import { rulesOf } from '../game/ascentRuleset';
import { applyOpeningHand } from '../systems/ascent/PowerDraftSystem';
import { computeAscentPower, contestedDefencePower } from '../systems/ascent/PowerSystem';
import { projectedWaveThreat } from '../systems/ascent/WaveDirector';
import { getFounderPool } from './codex';
import { applyLegacyPerks, legacyStartRubbings } from './legacy';
import { addRubbings } from './cabinet';
import { founderOptionCount, hasTrait, isCrowned, noteTraitUse } from './dynasty';
import { initEmpireSim } from '../systems/empire/GreatPowersSystem';
import type { Army, CampaignConfig, GameState, Hero, Kingdom, Land, LandTemplate, ResourceBag, TerrainSummary } from './types';
import { landTypeLabel, t } from '../i18n';
import { shuffled } from '../utils/math';

const EMPTY_RESOURCE_BAG: ResourceBag = {
  food: 0,
  supplies: 0,
  gold: 0,
  humans: 0,
};

function createEmptyTerrainSummary(): TerrainSummary {
  return {
    plains: 0,
    fields: 0,
    riceFields: 0,
    forest: 0,
    mountains: 0,
    hills: 0,
    water: 0,
    fortress: 0,
    shrine: 0,
  };
}

function createInitialTrust(ownerId: string): Record<string, number> {
  const trust = Object.fromEntries(kingdomTemplates.map((kingdom) => [kingdom.id, 40])) as Record<string, number>;

  if (ownerId === PLAYER_KINGDOM_ID) {
    trust[PLAYER_KINGDOM_ID] = 82;
    trust['northern-rival'] = 18;
  } else if (ownerId === 'northern-rival') {
    trust[PLAYER_KINGDOM_ID] = 18;
    trust['northern-rival'] = 82;
  }

  return trust;
}

function createRandomMapConfig(): MapGenConfig {
  return {
    ...GAMEPLAY_MAP_CONFIG,
    seed: randomInt(1_000_000_000),
  };
}

const NAME_PREFIXES = [
  'An', 'Bạch', 'Bình', 'Cẩm', 'Cửu', 'Đại', 'Đông', 'Hà', 'Hải', 'Hoàng',
  'Hồng', 'Lam', 'Linh', 'Long', 'Nam', 'Ngọc', 'Phong', 'Phú', 'Quảng',
  'Sơn', 'Tân', 'Thanh', 'Thiên', 'Thủy', 'Trường', 'Vân', 'Việt', 'Xuân'
];

const NAME_CORES = [
  'Châu', 'Giang', 'Hải', 'Khê', 'Lâm', 'Lĩnh', 'Phong', 'Sơn', 'Thành',
  'Trấn', 'Viên', 'Xuyên', 'Động', 'Quan', 'Đô', 'Hương', 'Thôn', 'Ấp',
  'Bình', 'Cảng', 'Cốc', 'Đèo', 'Lộ', 'Phủ', 'Quận', 'Trại', 'Vực'
];

const NAME_SUFFIXES = [
  '', '', '',
  'Thượng',
  'Hạ',
  'Đông',
  'Tây',
  'Nam',
  'Bắc'
];

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)];
}

function createRandomLandName(index: number, used: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const prefix = pick(NAME_PREFIXES);
    const core = pick(NAME_CORES);
    const suffix = pick(NAME_SUFFIXES);

    const name = suffix
      ? `${prefix} ${core} ${suffix}`
      : `${prefix} ${core}`;

    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }

  const fallback = `Biên Trấn ${String(index + 1).padStart(2, '0')}`;
  used.add(fallback);
  return fallback;
}

function createGeneratedNeutralDistrict(index: number, usedNames: Set<string>): LandTemplate {
  const types: LandTemplate['type'][] = ['farm', 'iron', 'market', 'temple', 'farm', 'iron', 'market', 'wilderness', 'wilderness'];
  const type = pick(types);
  const name = createRandomLandName(index, usedNames);

  const isWilderness = type === 'wilderness';
  return {
    id: `district-${String(index + 1).padStart(2, '0')}`,
    name,
    type,
    ownerId: 'neutral',
    defense: isWilderness ? 3 + randomInt(6) : type === 'iron' ? 22 + randomInt(9) : type === 'market' ? 16 + randomInt(8) : type === 'temple' ? 15 + randomInt(6) : 10 + randomInt(8),
    loyalty: 55 + randomInt(23),
    buildings: [],
    special: isWilderness ? t('special.wilderness') : t('special.randomDistrict', { type: landTypeLabel(type) }),
  };
}

function createConfiguredLandTemplates(): LandTemplate[] {
  const usedNames = new Set<string>();
  const districtCount = GAMEPLAY_MAP_CONFIG.neutralDistrictTarget + 2;
  const templates: LandTemplate[] = [];

  for (let index = 0; index < districtCount; index += 1) {
    templates.push(createGeneratedNeutralDistrict(index, usedNames));
  }

  return templates;
}

function createLands(mapConfig: MapGenConfig): { lands: Land[]; hexTiles: GameState['hexTiles']; playerStartId: string; rivalStartId: string } {
  const templates = createConfiguredLandTemplates();
  const { tiles, landHexes } = generateHexMap(templates, mapConfig);
  const neighbors = computeNeighbors(tiles);

  const lands: Land[] = templates.map((template) => {
    const hexes = landHexes.get(template.id) ?? [];
    const centroid = hexes.length > 0 ? computeCentroid(hexes, mapConfig.hexSize) : { x: 0, y: 0 };
    const summary = createEmptyTerrainSummary();
    for (const tile of tiles) {
      if (tile.landId === template.id) {
        summary[tile.terrain] += 1;
      }
    }
    const nonWaterTiles = Math.max(1, hexes.length - summary.water);
    const buildingCapacity = Math.max(1, Math.floor(nonWaterTiles / 7));
    const isWilderness = template.type === 'wilderness';
    const hasVillage = !isWilderness && (summary.fortress > 0 || summary.shrine > 0 || buildingCapacity >= 2 || template.defense > 12);
    const grassTiles = summary.plains + summary.fields + summary.riceFields + summary.forest;
    const cityTiles = summary.fortress + summary.shrine;
    const population = isWilderness ? 0 : Math.max(0, grassTiles * 7 + cityTiles * 15 + randomInt(20) - 5);
    const localSoldiers = isWilderness ? 0 : Math.max(0, Math.floor(template.defense * 0.7) + randomInt(6));
    return {
      ...template,
      x: centroid.x,
      y: centroid.y,
      neighbors: Array.from(neighbors.get(template.id) ?? []).sort(),
      buildingCapacity,
      terrainSummary: summary,
      outputs: { ...EMPTY_RESOURCE_BAG },
      isVisible: false,
      isExplored: false,
      population,
      localSoldiers,
      hasVillage,
      trust: createInitialTrust(template.ownerId),
    };
  });

  const [playerStartId, rivalStartId] = pickFarthestStartPair(lands);
  const playerStart = lands.find((land) => land.id === playerStartId);
  const rivalStart = lands.find((land) => land.id === rivalStartId);

  if (playerStart) {
    playerStart.name = `${playerStart.name}`;
    playerStart.type = 'castle';
    playerStart.ownerId = PLAYER_KINGDOM_ID;
    playerStart.defense = Math.max(playerStart.defense, 48);
    playerStart.loyalty = 100;
    playerStart.buildings = [{ type: 'market', level: 1 }, { type: 'farm', level: 1 }];
    playerStart.special = t('special.playerCapital');
    playerStart.hasVillage = true;
    playerStart.population = 120 + randomInt(40);
    playerStart.localSoldiers = Math.floor(playerStart.defense * 0.7);
    playerStart.trust = createInitialTrust(playerStart.ownerId);
  }

  if (rivalStart) {
    rivalStart.name = `${rivalStart.name}`;
    rivalStart.type = 'enemyCastle';
    rivalStart.ownerId = 'northern-rival';
    rivalStart.defense = Math.max(rivalStart.defense, 50);
    rivalStart.loyalty = 94;
    rivalStart.buildings = [{ type: 'market', level: 1 }, { type: 'mine', level: 1 }];
    rivalStart.special = t('special.rivalCapital');
    rivalStart.hasVillage = true;
    rivalStart.population = 100 + randomInt(40);
    rivalStart.localSoldiers = Math.floor(rivalStart.defense * 0.7);
    rivalStart.trust = createInitialTrust(rivalStart.ownerId);
  }

  return { lands, hexTiles: tiles, playerStartId, rivalStartId };
}

function pickFarthestStartPair(lands: Land[]): [string, string] {
  const largest = findLargestConnectedComponent(lands);
  let best: [Land, Land] = [largest[0] ?? lands[0], largest[1] ?? lands[0]];
  let bestDistance = -1;

  for (let i = 0; i < largest.length; i += 1) {
    for (let j = i + 1; j < largest.length; j += 1) {
      const a = largest[i];
      const b = largest[j];
      const distance = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (distance > bestDistance) {
        best = [a, b];
        bestDistance = distance;
      }
    }
  }

  return [best[0].id, best[1].id];
}

function findLargestConnectedComponent(lands: Land[]): Land[] {
  const byId = new Map(lands.map((land) => [land.id, land]));
  const visited = new Set<string>();
  let largest: Land[] = [];

  for (const land of lands) {
    if (visited.has(land.id)) {
      continue;
    }
    const component: Land[] = [];
    const queue = [land.id];
    visited.add(land.id);
    while (queue.length > 0) {
      const current = byId.get(queue.shift() as string);
      if (!current) {
        continue;
      }
      component.push(current);
      for (const neighborId of current.neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }
    if (component.length > largest.length) {
      largest = component;
    }
  }

  return largest.length > 1 ? largest : lands;
}

const RIVAL_KINGDOM_IDS_FOR_CAMPAIGN = ['northern-rival', 'southern-rival', 'eastern-rival'];

const ROYAL_NAMES = [
  // The neighbours' rulers, never the player's own history: reported as *those enemies must not
  // be Vietnamese kingdoms*. Northern courts, Chăm kings, Khmer and Lao and Tai rulers.
  'Lưu Cung', 'Triệu Quang Nghĩa', 'Thoát Hoan', 'Trương Phụ', 'Tôn Sĩ Nghị', 'Liễu Thăng',
  'Chế Bồng Nga', 'Chế Mân', 'Chế Củ', 'Harivarman', 'Indravarman',
  'Jayavarman', 'Suryavarman', 'Fa Ngum', 'Phra Naret', 'Setthathirath',
];

function pickRoyalName(): string {
  return ROYAL_NAMES[randomInt(ROYAL_NAMES.length)];
}

function createCampaignMapConfig(config: CampaignConfig): MapGenConfig {
  return {
    ...GAMEPLAY_MAP_CONFIG,
    seed: randomInt(1_000_000_000),
    seaBorderSides: config.seaSides,
  };
}

function createCampaignLands(
  mapConfig: MapGenConfig,
  rivalKingdomIds: string[],
): { lands: Land[]; hexTiles: GameState['hexTiles']; playerStartId: string; rivalStartIds: string[] } {
  const templates = createConfiguredLandTemplates();
  const { tiles, landHexes } = generateHexMap(templates, mapConfig);
  const neighbors = computeNeighbors(tiles);

  const lands: Land[] = templates.map((template) => {
    const hexes = landHexes.get(template.id) ?? [];
    const centroid = hexes.length > 0 ? computeCentroid(hexes, mapConfig.hexSize) : { x: 0, y: 0 };
    const summary = createEmptyTerrainSummary();
    for (const tile of tiles) {
      if (tile.landId === template.id) {
        summary[tile.terrain] += 1;
      }
    }
    const nonWaterTiles = Math.max(1, hexes.length - summary.water);
    const buildingCapacity = Math.max(1, Math.floor(nonWaterTiles / 7));
    const isWilderness = template.type === 'wilderness';
    const hasVillage = !isWilderness && (summary.fortress > 0 || summary.shrine > 0 || buildingCapacity >= 2 || template.defense > 12);
    const grassTiles = summary.plains + summary.fields + summary.riceFields + summary.forest;
    const cityTiles = summary.fortress + summary.shrine;
    const population = isWilderness ? 0 : Math.max(0, grassTiles * 7 + cityTiles * 15 + randomInt(20) - 5);
    const localSoldiers = isWilderness ? 0 : Math.max(0, Math.floor(template.defense * 0.7) + randomInt(6));
    return {
      ...template,
      x: centroid.x,
      y: centroid.y,
      neighbors: Array.from(neighbors.get(template.id) ?? []).sort(),
      buildingCapacity,
      terrainSummary: summary,
      outputs: { ...EMPTY_RESOURCE_BAG },
      isVisible: false,
      isExplored: false,
      population,
      localSoldiers,
      hasVillage,
      trust: createInitialTrust(template.ownerId),
    };
  });

  const largest = findLargestConnectedComponent(lands);
  const playerStartId = pickCenterLand(largest).id;
  const rivalStartIds = pickPeripheryLands(largest, playerStartId, rivalKingdomIds.length).map((l) => l.id);

  const playerStart = lands.find((l) => l.id === playerStartId);
  if (playerStart) {
    playerStart.type = 'castle';
    playerStart.ownerId = PLAYER_KINGDOM_ID;
    playerStart.defense = Math.max(playerStart.defense, 52);
    playerStart.loyalty = 100;
    playerStart.buildings = [{ type: 'market', level: 1 }, { type: 'farm', level: 1 }];
    playerStart.special = t('special.playerCapital');
    playerStart.hasVillage = true;
    playerStart.population = 130 + randomInt(40);
    playerStart.localSoldiers = Math.floor(playerStart.defense * 0.7);
    playerStart.trust = createInitialTrust(PLAYER_KINGDOM_ID);
  }

  for (let i = 0; i < rivalStartIds.length; i += 1) {
    const rivalLand = lands.find((l) => l.id === rivalStartIds[i]);
    const kingdomId = rivalKingdomIds[i];
    if (rivalLand && kingdomId) {
      rivalLand.type = 'enemyCastle';
      rivalLand.ownerId = kingdomId;
      rivalLand.defense = Math.max(rivalLand.defense, 46);
      rivalLand.loyalty = 90 + randomInt(8);
      rivalLand.buildings = [{ type: 'market', level: 1 }, { type: 'mine', level: 1 }];
      rivalLand.special = t('special.rivalCapital');
      rivalLand.hasVillage = true;
      rivalLand.population = 100 + randomInt(40);
      rivalLand.localSoldiers = Math.floor(rivalLand.defense * 0.7);
      rivalLand.trust = createInitialTrust(rivalLand.ownerId);
    }
  }

  return { lands, hexTiles: tiles, playerStartId, rivalStartIds };
}

function pickCenterLand(lands: Land[]): Land {
  const avgX = lands.reduce((sum, l) => sum + l.x, 0) / lands.length;
  const avgY = lands.reduce((sum, l) => sum + l.y, 0) / lands.length;
  let best = lands[0];
  let bestDist = Infinity;
  for (const land of lands) {
    const d = (land.x - avgX) ** 2 + (land.y - avgY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = land;
    }
  }
  return best;
}

function pickPeripheryLands(lands: Land[], excludeId: string, count: number): Land[] {
  const candidates = lands.filter((l) => l.id !== excludeId);
  const chosen: Land[] = [];
  const usedIds = new Set<string>([excludeId]);

  for (let pick = 0; pick < count; pick += 1) {
    let bestLand: Land | undefined;
    let bestMinDist = -1;

    for (const land of candidates) {
      if (usedIds.has(land.id)) {
        continue;
      }
      let minDist = Infinity;
      for (const used of [...usedIds].map((id) => lands.find((l) => l.id === id)!).filter(Boolean)) {
        const d = (land.x - used.x) ** 2 + (land.y - used.y) ** 2;
        if (d < minDist) {
          minDist = d;
        }
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestLand = land;
      }
    }

    if (!bestLand) {
      break;
    }
    chosen.push(bestLand);
    usedIds.add(bestLand.id);
  }

  return chosen;
}

function getDifficultyArmyScale(difficulty: CampaignConfig['difficulty']): number {
  if (difficulty === 'easy') return 0.70;
  if (difficulty === 'hard') return 1.35;
  if (difficulty === 'ironman') return 1.65;
  return 1.0;
}

export function createCampaignGameState(config: CampaignConfig): GameState {
  const mapConfig = createCampaignMapConfig(config);
  const { lands, hexTiles, rivalStartIds } = createCampaignLands(mapConfig, RIVAL_KINGDOM_IDS_FOR_CAMPAIGN);

  const allKingdoms: Kingdom[] = structuredClone(
    kingdomTemplates.filter((k) => k.id === PLAYER_KINGDOM_ID || RIVAL_KINGDOM_IDS_FOR_CAMPAIGN.includes(k.id)),
  );

  for (const kingdom of allKingdoms) {
    if (kingdom.id !== PLAYER_KINGDOM_ID) {
      kingdom.king = {
        name: pickRoyalName(),
        personality: kingdom.personality,
        age: randomInt(12),
      };
      kingdom.relations = 50;
      kingdom.opinionModifiers = [];
      kingdom.giftFatigue = 0;
      recomputeOpinion(kingdom);
    }
  }

  const armyScale = getDifficultyArmyScale(config.difficulty);
  const armies: Army[] = [];
  for (let i = 0; i < RIVAL_KINGDOM_IDS_FOR_CAMPAIGN.length; i += 1) {
    const kingdomId = RIVAL_KINGDOM_IDS_FOR_CAMPAIGN[i];
    const landId = rivalStartIds[i];
    if (!landId) {
      continue;
    }
    const kingdom = allKingdoms.find((k) => k.id === kingdomId);
    armies.push({
      id: `${kingdomId}-host`,
      kingdomId,
      name: `${kingdom?.name ?? 'Rival'} Army`,
      landId,
      units: {
        spearmen: Math.floor(800 * armyScale),
        archers: Math.floor(350 * armyScale),
        heavyInfantry: Math.floor(80 * armyScale),
      },
      morale: 70,
      supply: 80,
      rations: 250,
      provisions: 150,
      level: 1,
      experience: 0,
      experienceToNextLevel: 100,
    });
  }

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: { food: 140, supplies: 65, gold: 100, humans: 580 },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: allKingdoms,
    armies,
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.campaignStart'),
    victory: false,
    gameMode: 'campaign',
    campaignConfig: config,
    dynastyStatus: { farmerUnrest: 15, nobleRelations: 60, consecutiveLowStability: 0 },
    campaignScore: { turnsAlive: 0, armiesDefeated: 0, largestArmyDefeated: 0, peakLandsHeld: 1 },
    spyReports: [],
    scheduledCampaignEvents: [],
    eventLog: [],
    isDefeated: false,
    defeatReason: undefined,
  };

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  // What this run's armies look like. Seeded off the map, so the same seed opens on the same
  // war; see `rollMuster`.
  rollMuster(state);
  return state;
}

const EMPIRE_KINGDOM_IDS = ['northern-rival', 'southern-rival', 'eastern-rival', 'western-rival'];

/**
 * "Throne of Empires" mode. The player holds the centre of the map among neutral
 * districts to expand into; the rival kingdoms are off-map "Empires" that own no
 * territory and never appear on the board — they pressure the realm only through
 * court cards, foreign affairs, and invasions (see InvasionSystem). Endless: there
 * is no elimination victory, only survival and the high-score screen on defeat.
 */
/** Run-creation options that are not part of the saved campaign. */
export interface RunCreationOptions {
  /**
   * A sandbox run (the Skirmish): built like a real reign so the fight reads real court and hero
   * data, but it writes nothing to the house — no founding draws banked, no trait uses counted.
   * Before this, every Skirmish fight paid the Legacy perk's founding draws, so the practice yard
   * was a draw farm.
   */
  sandbox?: boolean;
}

export function createEmpireGameState(config: CampaignConfig, options: RunCreationOptions = {}): GameState {
  const mapConfig = createCampaignMapConfig(config);
  // Empty rival list → player castle + neutral districts only, no enemy castles.
  const { lands, hexTiles } = createCampaignLands(mapConfig, []);

  const allKingdoms: Kingdom[] = structuredClone(
    kingdomTemplates.filter((k) => k.id === PLAYER_KINGDOM_ID || EMPIRE_KINGDOM_IDS.includes(k.id)),
  );

  for (const kingdom of allKingdoms) {
    if (kingdom.id !== PLAYER_KINGDOM_ID) {
      kingdom.king = {
        name: pickRoyalName(),
        personality: kingdom.personality,
        age: randomInt(12),
      };
      kingdom.relations = 50;
      kingdom.opinionModifiers = [];
      kingdom.giftFatigue = 0;
      recomputeOpinion(kingdom);
      initEmpireSim(kingdom);
    }
  }

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: { food: 150, supplies: 70, gold: 110, humans: 600 },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: allKingdoms,
    armies: [],
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.campaignStart'),
    victory: false,
    gameMode: 'empire',
    campaignConfig: config,
    dynastyStatus: { farmerUnrest: 15, nobleRelations: 60, consecutiveLowStability: 0 },
    campaignScore: { turnsAlive: 0, armiesDefeated: 0, largestArmyDefeated: 0, peakLandsHeld: 1 },
    spyReports: [],
    scheduledCampaignEvents: [],
    eventLog: [],
    invasions: [],
    toasts: [],
    mandate: createInitialMandate(),
    greatInvasionEras: [],
    threatBudget: 0,
    invasionsRepelled: 0,
    wondersBuilt: 0,
    isDefeated: false,
    defeatReason: undefined,
  };

  applyFounder(state, config.founderId);
  applyLegacyPerks(state);
  if (!options.sandbox) addRubbings(legacyStartRubbings());
  initDirectives(state);
  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  // What this run's armies look like. Seeded off the map, so the same seed opens on the same
  // war; see `rollMuster`.
  rollMuster(state);
  return state;
}

/**
 * "Dragon Ascent" mode. Same off-map-empires board as Throne of Empires — the player holds
 * the centre among neutral districts, the rivals pressure from off the map — but the run
 * plays itself: an autopilot files the build/recruit/march orders and the player's whole
 * input is the pausing card prompts (see systems/ascent/). Endless with no win condition;
 * the run ends when the capital falls and the score banks into Legacy.
 *
 * Directives are deliberately omitted: this mode's goals are the wave counter and the
 * power curve, not an objectives board.
 */
/**
 * Pairs the courts off into hereditary feuds, two and two.
 *
 * This is the whole of *"cannot have good relation with all kingdoms"*, and it is deliberately a
 * property of the world rather than a rule the player is told. Warming one court cools its partner
 * by half as much (see `applyEnvy`), so a player who simply gifts everyone finds the board
 * refusing to move and works out why from the numbers — which is a better lesson than a tooltip.
 *
 * Fixed at worldgen and symmetric, so the map is learnable within a run: the pairing never shifts
 * under the player, and a run's shape can be planned around it from the first envoy card.
 *
 * Shuffled, so *which* courts hate each other is this run's question rather than a memorised fact.
 * With four rivals this is two pairs; an odd count leaves the last court unfeuding, which is
 * correct — someone has to be the one everybody can afford to like.
 */
function pairFeuds(state: GameState): void {
  const courts = shuffled(
    state.kingdoms.filter((kingdom) => kingdom.id !== PLAYER_KINGDOM_ID && !kingdom.isDefeated),
  );
  for (let i = 0; i + 1 < courts.length; i += 2) {
    courts[i].feudWith = courts[i + 1].id;
    courts[i + 1].feudWith = courts[i].id;
  }
}

export function createAscentGameState(config: CampaignConfig, options: RunCreationOptions = {}): GameState {
  const state = createEmpireGameState(config, options);
  state.gameMode = 'ascent';
  state.ascent = createAscentState();
  // Beta: the reign's goal. Nothing on a stable reign — `openingGoal` reads the ruleset off the
  // config, which is already on the state by now.
  const goal = openingGoal(state);
  if (goal) state.ascent.goal = goal;
  pairFeuds(state);
  state.directives = undefined;
  state.directiveDeckCursor = undefined;

  seedAscentOpening(state, options);
  if (!options.sandbox) initializeHeroDepthRun(state);
  // The Cabinet's opening hand, before the mandate card: the seals the house slotted arrive at
  // one stack each and pre-pay the mode's own threat counter (+2 ambition per slot).
  applyOpeningHand(state, !options.sandbox);
  // Before everything, and once in a lifetime: the rite that makes the king. Gated on the
  // dynasty store — `isCrowned` — rather than on a scene flag or a run field, because both of
  // those come back on an HMR reload and a coronation that re-raises itself is the opposite of
  // the thing it exists to be.
  if (!isCrowned()) enqueueAscentPrompt(state, { kind: 'coronation' });
  // What the house already owns, said out loud before the throne is handed anything new.
  //
  // Raised *after* the two calls above have run, not before: `seedAscentOpening` has already spent
  // Old Roads and `applyOpeningHand` has already dealt the seals and charged their ambition, so
  // the screen reports a state the run is actually in rather than one it is about to enter. It is
  // deliberately raised on the first reign too, when it has almost nothing to report — the empty
  // slot and the "none yet" trait row are the only place the mode ever explains what the runs
  // ahead will fill, and the same argument the next-reign card was built on.
  //
  // Beta (B05): a house with nothing in force and nothing waiting on the menu goes straight to the
  // first real choice. A first-ever reign learns what later reigns carry from the in-run chip and
  // the ceremony's next-reign page, not from a full screen of empty rows. Stable keeps the card.
  if (!rulesOf(state).inheritanceGate || carriesAnything(readCarriedOver())) {
    enqueueAscentPrompt(state, { kind: 'inheritance' });
  }
  offerMandateChoice(state);
  offerFounderChoice(state, options);

  state.message = t('ascent.msg.runStart');
  // What this run's armies look like. Seeded off the map, so the same seed opens on the same
  // war; see `rollMuster`.
  rollMuster(state);
  return state;
}

/** Advantages offered on the card before the founding. */
const MANDATE_OPTION_COUNT = 3;

/**
 * The reign's opening advantage — the run's first card, ahead of the founding.
 *
 * This is what the throne's six "temperaments" should always have been. Those were written onto
 * the king as a *string* and never read by anything, so the opening advertised an effect it did
 * not grant; these are ordinary Power cards, applied by the ordinary pipeline, and they happen.
 */
function offerMandateChoice(state: GameState): void {
  const options = shuffled([...OPENING_BOONS]).slice(0, MANDATE_OPTION_COUNT).map((card) => card.id);
  if (options.length === 0) return;
  enqueueAscentPrompt(state, { kind: 'mandate', options });
}

/**
 * How many of the three champions may come out of the Codex.
 *
 * One, not three. Offering every recorded champion first sounds like the right reward, but it
 * means the opening card stops changing the moment a player has collected three — the run that
 * is supposed to open on a decision opens on the decision it opened on last time. Leading with
 * one recorded name keeps the collection's promise and leaves two slots for the other hundred
 * champions to walk through.
 */
const FOUNDER_RECORDED_CAP = 1;

/**
 * Takes the founding champions off an already-ordered candidate list.
 *
 * Two passes with a widening filter. The first insists on a champion who is both a new *role*
 * and a new *rank* — that is the card at its best, three genuinely different bets — and the
 * second drops the rank condition, because with a hundred-odd champions in the deck the roles
 * are what the player is actually choosing between. Thirty-two of them are generals, so an
 * unfiltered draw serves three interchangeable ones often enough to matter.
 */
function pickFounderOptions(candidates: Hero[], wanted: number): string[] {
  const picked: Hero[] = [];
  const roles = new Set<Hero['type']>();
  const ranks = new Set<Hero['rarity']>();

  const take = (hero: Hero): void => {
    picked.push(hero);
    roles.add(hero.type);
    ranks.add(hero.rarity);
  };
  for (const hero of candidates) {
    if (picked.length >= wanted) break;
    if (roles.has(hero.type) || ranks.has(hero.rarity)) continue;
    take(hero);
  }
  for (const hero of candidates) {
    if (picked.length >= wanted) break;
    if (picked.includes(hero) || roles.has(hero.type)) continue;
    take(hero);
  }
  for (const hero of candidates) {
    if (picked.length >= wanted) break;
    if (!picked.includes(hero)) take(hero);
  }

  return picked.map((hero) => hero.id);
}

/**
 * The run's opening decision: which champion founds the dynasty *you* rule.
 *
 * One champion recorded in the Codex from previous runs leads the card — that is what the
 * collection is *for* — and the rest is drawn from the whole deck, so a very first run still
 * gets a real choice and a hundredth run still gets a new face.
 *
 * Every pool here is shuffled. Walking the deck in template order instead meant every run
 * opened on the same three champions in the same three slots, so the card that is meant to
 * shape the whole run read as a fixed script.
 */
function offerFounderChoice(state: GameState, options: RunCreationOptions = {}): void {
  const recorded = new Set(getFounderPool());
  // Rulers are not founders. They carry an `arrival` — a host, a province, a crown bending the
  // knee — and handing one of those out on turn one would decide the run before it started.
  // Promoting twenty-four of them took the deck to 35 Legendaries in 127, so without this filter
  // roughly a third of every founding card would have been one.
  const pool = state.heroDeck.filter((hero) => !hero.arrival);
  const known = shuffled(pool.filter((hero) => recorded.has(hero.id)));
  const fresh = pool.filter((hero) => !recorded.has(hero.id));
  const candidates = fresh.length > 0
    ? [...known.slice(0, FOUNDER_RECORDED_CAP), ...shuffled([...known.slice(FOUNDER_RECORDED_CAP), ...fresh])]
    : known;
  // Three, or five when the house has learned Second Founder (`dynastyTraits`). Read off the
  // dynasty store rather than off `GameState`, because a trait chosen in the ceremony has to be
  // true for the very run the ceremony is about to start.
  const founders = pickFounderOptions(candidates, founderOptionCount());
  if (founders.length > 3 && !options.sandbox) noteTraitUse('second-founder');

  if (founders.length > 0) {
    enqueueAscentPrompt(state, { kind: 'founder', options: founders });
    state.isPaused = true;
    state.pendingAscentPrompt = state.ascent?.promptQueue.shift();
    // Promoted by hand rather than through `drainAscentPrompts`, so stamp the turn here too
    // or the decision director treats the opening tick as having shown nothing and fires a
    // second card immediately behind the founder pick.
    if (state.ascent) state.ascent.lastPromptTurn = state.turn;
  }
}

/**
 * What the founding champion brings with them.
 *
 * The opening used to hand every run the same second district. That is a constant dressed as a
 * gift: it never varies, so it never reads as anything, and the one decision the player had just
 * made — which champion founds the dynasty — changed nothing about the board in front of them.
 *
 * Each office now brings what that office would actually bring. A governor arrives already
 * administering a district; a general arrives with the men who follow him; a minister arrives
 * with the treasury he has been keeping; an envoy arrives knowing the country and owed favours
 * by it. All four are worth roughly the same at turn zero and compound differently, which is
 * what makes the founding a decision rather than a flavour.
 *
 * Called from the resolver, not from `seedAscentOpening` — at world-creation time nobody has
 * chosen a founder yet.
 */
export function applyFoundingGift(state: GameState, hero: Hero): void {
  const capital = state.lands.find((land) => land.id === state.ascent?.capitalLandId)
    ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (!capital) return;

  switch (hero.type) {
    case 'governor': {
      // The district he already administers. Prefers unsettled ground, and falls back to the
      // least-defended neighbour — on maps where every neighbour is settled, refusing to fall
      // back would silently make this the one gift that gives nothing.
      const neighbour = capital.neighbors
        .map((id) => state.lands.find((land) => land.id === id))
        .filter((land): land is Land => land !== undefined && land.ownerId !== PLAYER_KINGDOM_ID)
        .sort((a, b) => {
          const settled = Number(a.hasVillage) - Number(b.hasVillage);
          return settled !== 0 ? settled : a.defense + a.localSoldiers - (b.defense + b.localSoldiers);
        })[0];
      if (neighbour) neighbour.ownerId = PLAYER_KINGDOM_ID;
      break;
    }
    case 'general': {
      // The men who follow him. Half again the royal host, and a capital already walled.
      const host = state.armies.find((army) => army.id === 'ascent-royal-host');
      if (host) {
        for (const key of Object.keys(host.units) as Array<keyof typeof host.units>) {
          host.units[key] = Math.round((host.units[key] ?? 0) * 1.55);
        }
        host.morale = Math.min(100, host.morale + 5);
      }
      capital.defense += 10;
      capital.localSoldiers += 40;
      break;
    }
    case 'minister': {
      // The treasury he has been keeping, and the stores that go with it.
      state.resources.gold += 420;
      state.resources.supplies += 90;
      state.resources.food += 120;
      break;
    }
    default: {
      // The envoy: the country's goodwill, and the people who follow a name they trust.
      state.court.influence = Math.min(100, state.court.influence + 32);
      state.resources.humans += 260;
      state.resources.gold += 140;
      break;
    }
  }

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
}

/**
 * Gives the run something to compound from.
 *
 * A lone capital cannot raise a host big enough to take even a neighbouring village — its
 * manpower income is too small — so the realm sits at one province forever and the whole
 * power curve has nothing to act on. Opening with a second district and a standing royal
 * host puts the loop in motion from the first tick, the same way the games this borrows
 * from hand you a weapon before the first wave.
 */
function seedAscentOpening(state: GameState, options: RunCreationOptions = {}): void {
  const capital = state.lands.find(
    (land) => land.ownerId === PLAYER_KINGDOM_ID && land.type === 'castle',
  ) ?? state.lands.find((land) => land.ownerId === PLAYER_KINGDOM_ID);
  if (!capital) return;

  // The realm opens on its capital and nothing else. A second district used to be handed over
  // here unconditionally, because a lone capital cannot fund a host big enough to take even a
  // neighbouring village and the run dead-ends before it starts — but a gift every run receives
  // is not an opening, it is a constant. It is now one of four things the *founding champion*
  // brings, in `applyFoundingGift`, so what the dynasty starts with varies with who founded it.

  if (state.ascent) {
    state.ascent.capitalLandId = capital.id;
  }
  // The seat of the dynasty starts genuinely fortified. Losing it is the run's ending, and
  // an unwalled capital falls to an early conquest host before the power curve can answer.
  capital.defense += 14;
  capital.localSoldiers += 60;
  // And it has to be worth a realm, because it is now the whole realm. Measured against the
  // committed build, the capital-plus-claimed-neighbour opening carried ~300 people and nine
  // building slots between them and ran at +5..+9 gold a tick; the capital alone at its own
  // figures ran −2 and could never fund a host, which is exactly what the neighbour was there
  // to prevent. This is that province's economy folded into the seat rather than handed out
  // as a free district — the district is now one of four things a founder may bring.
  capital.population = Math.max(capital.population, 300);
  capital.buildingCapacity = Math.max(capital.buildingCapacity, 9);
  // A market and a farm at level one are what one *district* gets. A dynastic seat that is the
  // whole realm carries the works the lost neighbour used to supply, and the raised levels are
  // where its +5..+9 gold a tick comes back from — population alone did not move the figure at
  // all, because output is a function of what is built, not of who lives there.
  capital.buildings = [
    { type: 'market', level: 2 },
    { type: 'farm', level: 2 },
  ];

  /**
   * Old Roads (`dynastyTraits`): the realm opens holding the trade two more districts would have
   * brought.
   *
   * Expressed as a market-output modifier through the ordinary court pipeline rather than as a
   * pile of starting gold, because a lump sum is spent in the first two seasons and then the trait
   * is over. +12% of the *market's* gold is roughly two more districts' counting houses against
   * the seat's own two levels — measured against the opening's stated +5..+9 a tick, it is worth
   * about a gold a season at the founding and scales with what the player actually builds.
   *
   * Inside the trait budget: this is the only compounding term in the table, it touches gold and
   * nothing that fights, and `EARLY_WAVE_FIELD_SHARE` caps what waves 1-5 may field against the
   * head start it buys.
   */
  if (hasTrait('old-roads')) {
    if (!options.sandbox) noteTraitUse('old-roads');
    addCourtModifier(state, {
      id: 'dynasty-old-roads',
      label: t('dynasty.trait.old-roads'),
      marketGoldOutputModifier: 0.12,
    });
  }

  const king = state.heroes[0];
  const soldiers = 460;
  state.armies.push({
    id: 'ascent-royal-host',
    kingdomId: PLAYER_KINGDOM_ID,
    name: t('ascent.army.royalHost'),
    landId: capital.id,
    units: {
      spearmen: Math.round(soldiers * 0.6),
      archers: Math.round(soldiers * 0.28),
      heavyInfantry: Math.round(soldiers * 0.12),
    },
    generalHeroId: king?.id,
    // Told to hold, rather than left on `auto`.
    //
    // A host with no standing order falls to the autopilot, which may march it, commit it, or
    // dissolve it as a remnant — and `StandingOrders` exists because "why did my army move" was the
    // most common question this mode raised. Every OTHER host can be left to the realm; this one is
    // the king's, it is the first thing a player ever sees move, and it should not walk off the
    // capital before they have learned that hosts take orders at all. Handing it back to the
    // autopilot is one tap in the army sheet.
    orders: { kind: 'defend', landId: capital.id },
    morale: 92,
    supply: 95,
    rations: 120,
    provisions: 80,
    level: 1,
    experience: 0,
    experienceToNextLevel: 100,
    autoDefend: true,
  });
  if (king) {
    king.assignedTo = 'ascent-royal-host';
  }

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);

  // Prime the HUD figures so the founder prompt opens over real numbers instead of a
  // POWER of 0 and a THREAT bar that reads as "losing" before the run has even started.
  if (state.ascent) {
    state.ascent.power = computeAscentPower(state);
    state.ascent.powerPrev = state.ascent.power;
    state.ascent.peakPower = state.ascent.power;
    state.ascent.defensePower = contestedDefencePower(state);
    state.ascent.threat = projectedWaveThreat(state, 1);
  }
}

/** Move the chosen dynasty founder from the draft deck into the starting roster (empire mode). */
function applyFounder(state: GameState, founderId: string | undefined): void {
  if (!founderId) return;
  const founder = state.heroDeck.find((hero) => hero.id === founderId);
  if (!founder) return;
  state.heroDeck = state.heroDeck.filter((hero) => hero.id !== founderId);
  state.heroes.push(founder);
}

export function createInitialGameState(): GameState {
  const mapConfig = createRandomMapConfig();
  const { lands, hexTiles, rivalStartId } = createLands(mapConfig);

  const state: GameState = {
    year: 1,
    season: 'Spring',
    turn: 1,
    realtimeSeconds: 0,
    ordersRemaining: ORDERS_PER_SEASON,
    resources: {
      food: 120,
      supplies: 55,
      gold: 90,
      humans: 540,
    },
    resourceRates: { ...EMPTY_RESOURCE_BAG },
    mapRenderMode: 'terrain',
    mapSettings: { ...GAMEPLAY_MAP_CONFIG, seed: mapConfig.seed },
    hexTiles,
    mapConfig,
    lands,
    kingdoms: structuredClone(kingdomTemplates),
    armies: [
      {
        id: 'rival-host',
        kingdomId: 'northern-rival',
        name: 'Rival Host',
        landId: rivalStartId,
        units: {
          spearmen: 1050,
          archers: 520,
          heavyInfantry: 120,
        },
        morale: 73,
        supply: 84,
        rations: 300,
        provisions: 200,
        level: 1,
        experience: 0,
        experienceToNextLevel: 100,
      },
    ],
    heroes: [generateKingHero()],
    heroDeck: structuredClone(heroTemplates),
    politicsDeck: structuredClone(politicsCardTemplates),
    activeCourtModifiers: [],
    court: createInitialCourtState(),
    activeHeroDraft: undefined,
    activePoliticsCard: undefined,
    pendingCourtRequest: undefined,
    isPaused: false,
    isStrategyPause: false,
    selectedLandId: undefined,
    selectedArmyId: undefined,
    latestBattlePreview: undefined,
    latestBattleResult: undefined,
    acquisitionOrders: [],
    buildOrders: [],
    movementOrders: [],
    siegeOrders: [],
    recruitmentOrders: [],
    message: t('msg.initial'),
    victory: false,
    gameMode: 'rival',
    campaignConfig: undefined,
    dynastyStatus: undefined,
    campaignScore: undefined,
    spyReports: [],
    scheduledCampaignEvents: [],
    eventLog: [],
    isDefeated: false,
    defeatReason: undefined,
  };

  refreshAllLandOutputs(state);
  refreshPlayerVisibility(state);
  // What this run's armies look like. Seeded off the map, so the same seed opens on the same
  // war; see `rollMuster`.
  rollMuster(state);
  return state;
}
