import type { TranslationKey } from '../i18n';
import type { CardIconId } from '../ui/CardIcons';

/** The two connected layers of play, in the order a new ruler meets them. */
export type GuideTab = 'conquest' | 'battle';

export const GUIDE_TABS: readonly GuideTab[] = ['conquest', 'battle'];

/** Captured gameplay assets, with one matching image per guide entry. */
export type GuideImageId =
  | 'conquest-map'
  | 'conquest-decision'
  | 'conquest-army'
  | 'conquest-build'
  | 'conquest-relations'
  | 'conquest-heroes'
  | 'conquest-court'
  | 'battle-overview'
  | 'battle-orders'
  | 'battle-result';

export interface GuideEntry {
  id: GuideImageId;
  tab: GuideTab;
  image: GuideImageId;
  icon: CardIconId;
  heading: TranslationKey;
  body: TranslationKey;
  /** Ordered instructions below the capture; these are not image callout coordinates. */
  points: readonly [TranslationKey, TranslationKey, TranslationKey];
  sections: readonly GuideSection[];
}

export interface GuideSection {
  heading: TranslationKey;
  body: TranslationKey;
  counterTable?: boolean;
}

type GuideDetailId = 'opening' | 'resources' | 'hud' | 'map' | 'clock' | 'draft' | 'heroes' | 'court' | 'expansion' | 'ambition' | 'recruit' | 'orders' | 'sieges' | 'cycle' | 'legacy' | 'setup' | 'phases' | 'morale' | 'terrain' | 'posture' | 'formations' | 'stamina' | 'commit' | 'example' | 'exits' | 'report' | 'recovery' | 'practice'
  | 'food' | 'supplies' | 'gold' | 'people' | 'ledger' | 'buildSteps' | 'buildTypes' | 'focus' | 'construction' | 'provinceRecovery'
  | 'armyUpgrades' | 'armyBaggage' | 'armyRecovery' | 'relations' | 'envoys' | 'treaties' | 'diplomaticWar'
  | 'heroStats' | 'heroPosting' | 'heroPayroll' | 'courtSeats' | 'taxes' | 'laws' | 'courtMeters';
const section = (id: GuideDetailId): GuideSection => ({
  heading: `guide.detail.${id}.h`, body: `guide.detail.${id}.b`, counterTable: id === 'formations',
});
const sections = (...ids: GuideDetailId[]): GuideSection[] => ids.map(section);

/** Structure here, localized instructions in the guide catalog, layout in GuideScene. */
export const GUIDE_ENTRIES: readonly GuideEntry[] = [
  {
    id: 'conquest-map', tab: 'conquest', image: 'conquest-map', icon: 'banner',
    heading: 'guide.conquest.map.h', body: 'guide.conquest.map.b',
    points: ['guide.conquest.map.p1', 'guide.conquest.map.p2', 'guide.conquest.map.p3'],
    sections: sections('resources', 'food', 'supplies', 'gold', 'people', 'ledger', 'hud', 'clock'),
  },
  {
    id: 'conquest-build', tab: 'conquest', image: 'conquest-build', icon: 'hammer',
    heading: 'guide.conquest.build.h', body: 'guide.conquest.build.b',
    points: ['guide.conquest.build.p1', 'guide.conquest.build.p2', 'guide.conquest.build.p3'],
    sections: sections('map', 'buildSteps', 'buildTypes', 'focus', 'construction', 'provinceRecovery'),
  },
  {
    id: 'conquest-army', tab: 'conquest', image: 'conquest-army', icon: 'shield',
    heading: 'guide.conquest.army.h', body: 'guide.conquest.army.b',
    points: ['guide.conquest.army.p1', 'guide.conquest.army.p2', 'guide.conquest.army.p3'],
    sections: sections('recruit', 'armyUpgrades', 'armyBaggage', 'orders', 'sieges', 'armyRecovery'),
  },
  {
    id: 'conquest-relations', tab: 'conquest', image: 'conquest-relations', icon: 'scales',
    heading: 'guide.conquest.relations.h', body: 'guide.conquest.relations.b',
    points: ['guide.conquest.relations.p1', 'guide.conquest.relations.p2', 'guide.conquest.relations.p3'],
    sections: sections('relations', 'envoys', 'treaties', 'diplomaticWar'),
  },
  {
    id: 'conquest-heroes', tab: 'conquest', image: 'conquest-heroes', icon: 'person',
    heading: 'guide.conquest.heroes.h', body: 'guide.conquest.heroes.b',
    points: ['guide.conquest.heroes.p1', 'guide.conquest.heroes.p2', 'guide.conquest.heroes.p3'],
    sections: sections('heroes', 'heroStats', 'heroPosting', 'heroPayroll'),
  },
  {
    id: 'conquest-court', tab: 'conquest', image: 'conquest-court', icon: 'crown',
    heading: 'guide.conquest.court.h', body: 'guide.conquest.court.b',
    points: ['guide.conquest.court.p1', 'guide.conquest.court.p2', 'guide.conquest.court.p3'],
    sections: sections('court', 'courtSeats', 'courtMeters', 'taxes', 'laws'),
  },
  {
    id: 'conquest-decision', tab: 'conquest', image: 'conquest-decision', icon: 'branch',
    heading: 'guide.conquest.decision.h', body: 'guide.conquest.decision.b',
    points: ['guide.conquest.decision.p1', 'guide.conquest.decision.p2', 'guide.conquest.decision.p3'],
    sections: sections('opening', 'draft', 'expansion', 'ambition', 'cycle', 'legacy'),
  },
  {
    id: 'battle-overview', tab: 'battle', image: 'battle-overview', icon: 'blade',
    heading: 'guide.battle.overview.h', body: 'guide.battle.overview.b',
    points: ['guide.battle.overview.p1', 'guide.battle.overview.p2', 'guide.battle.overview.p3'],
    sections: sections('setup', 'phases', 'morale', 'terrain'),
  },
  {
    id: 'battle-orders', tab: 'battle', image: 'battle-orders', icon: 'ladder',
    heading: 'guide.battle.orders.h', body: 'guide.battle.orders.b',
    points: ['guide.battle.orders.p1', 'guide.battle.orders.p2', 'guide.battle.orders.p3'],
    sections: sections('posture', 'formations', 'stamina', 'commit', 'example', 'exits'),
  },
  {
    id: 'battle-result', tab: 'battle', image: 'battle-result', icon: 'scroll',
    heading: 'guide.battle.result.h', body: 'guide.battle.result.b',
    points: ['guide.battle.result.p1', 'guide.battle.result.p2', 'guide.battle.result.p3'],
    sections: sections('report', 'recovery', 'practice'),
  },
];
