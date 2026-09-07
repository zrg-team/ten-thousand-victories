import Phaser from 'phaser';
import type { BattlePreview, BattleStance, GameState } from '../state/types';
import { SHEET_BOTTOM, SHEET_TOP } from './BottomSheet';
import { InkUI, INK_UI } from './InkUI';
import { UI_FONT } from './fonts';
import { t } from '../i18n';

export class BattlePreviewPanel {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly state: GameState,
    private readonly stance: BattleStance,
    private readonly onStance: (stance: BattleStance) => void,
    private readonly onAttack: (armyId: string, landId: string, stance: BattleStance) => void,
  ) {}

  render(preview: BattlePreview): Phaser.GameObjects.GameObject[] {
    const ui = new InkUI(this.scene);
    const land = this.state.lands.find((candidate) => candidate.id === preview.targetLandId);
    const army = this.state.armies.find((candidate) => candidate.id === preview.attackerArmyId);
    const defArmy = this.state.armies.find((a) => land && a.kingdomId === land.ownerId && a.landId === land.id);

    const items: Phaser.GameObjects.GameObject[] = [
      ui.card({ x: 18, y: SHEET_TOP + 14, width: 354, height: 58 }, {
        title: t('battle.preview.title'),
        subtitle: t('battle.preview.subtitle', { army: army?.name ?? t('battle.preview.army'), land: land?.name ?? t('battle.preview.target') }),
        status: `${preview.winChance}%`,
        border: preview.winChance >= 55 ? INK_UI.gold : INK_UI.cinnabar,
      }),
      ui.card({ x: 18, y: SHEET_TOP + 78, width: 354, height: 76 }, {
        rows: [
          { label: t('battle.yourPower'), value: `${preview.attackerPower}` },
          { label: t('battle.enemyPower'), value: `${preview.defenderPower}` },
        ],
      }),
    ];

    // Scouting: show the enemy field host's composition so the player can counter it.
    if (defArmy) {
      const u = defArmy.units;
      const tot = Math.max(1, u.spearmen + u.archers + u.heavyInfantry);
      items.push(
        this.scene.add.text(28, SHEET_TOP + 158, t('scout.enemyComp', {
          spears: Math.round((u.spearmen / tot) * 100),
          archers: Math.round((u.archers / tot) * 100),
          heavy: Math.round((u.heavyInfantry / tot) * 100),
        }), { color: '#6f6250', fontFamily: UI_FONT, fontSize: '11px' }),
      );
    }

    // Stance selector (Assault / Measured / Cautious).
    const stances: Array<{ id: BattleStance; label: string }> = [
      { id: 'assault', label: t('battle.stance.assault') },
      { id: 'balanced', label: t('battle.stance.balanced') },
      { id: 'cautious', label: t('battle.stance.cautious') },
    ];
    const sY = SHEET_TOP + 182;
    const sW = 116;
    stances.forEach((s, i) => {
      const selected = this.stance === s.id;
      items.push(ui.button({ x: 18 + i * (sW + 2), y: sY, width: sW, height: 30 }, s.label, () => {
        this.onStance(s.id);
      }, { variant: selected ? 'primary' : 'secondary', fontSize: '11px' }));
    });

    items.push(
      ui.button({ x: 120, y: SHEET_BOTTOM - 40, width: 150, height: 36 }, t('action.attack'), () => this.onAttack(preview.attackerArmyId, preview.targetLandId, this.stance), {
        variant: 'primary',
        fontSize: '14px',
      }),
    );

    return items;
  }
}
