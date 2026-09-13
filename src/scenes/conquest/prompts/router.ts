/**
 * The two switches that know the whole `AscentPrompt` list: what makes a card's *content* unique,
 * and which renderer draws it. `refresh` in `shell.ts` compares `kind:signature` against
 * `openPromptKey`, so a reroll re-renders the sheet and a tick does not; when the key does change
 * it calls `renderPrompt` to draw the new one.
 *
 * A new prompt kind has to be added to both, and only one of them will say so: `promptSignature`
 * returns `string` with no `default`, so a missing case fails to compile, while `renderPrompt`
 * returns void and a missing case is silently a card that raises, holds the screen and draws
 * nothing. `promptSignature` needs no scene, and `shell.ts` imports it straight from here — which
 * is why this file must go on importing no sibling of its own.
 */
import type { AscentPrompt } from '../../../state/types';
import type { ConquestUIScene } from '../../ConquestUIScene';


export function renderPrompt(self: ConquestUIScene, prompt: AscentPrompt): void {
  switch (prompt.kind) {
    case 'coronation': self.showCoronation(); break;
    case 'inheritance': self.showInheritance(); break;
    case 'goal-won': self.showGoalWon(prompt); break;
    case 'mandate': self.showMandate(prompt); break;
    case 'founder': self.showFounder(prompt); break;
    case 'power-draft': self.showPowerDraft(prompt); break;
    case 'conquer-target': self.showConquerTarget(prompt); break;
    case 'conquer-method': self.showConquerMethod(prompt.target, prompt.notice); break;
    case 'hero-choice': self.showHeroChoice(prompt); break;
    case 'court-appointment': self.showAppointment(prompt); break;
    case 'law-choice': self.showLawChoice(prompt); break;
    case 'decree-offer': self.showDecreeOffer(prompt); break;
    case 'doctrine': self.showDoctrine(prompt); break;
    case 'parliament': self.showParliament(prompt); break;
    case 'envoy': self.showEnvoy(prompt); break;
    case 'world-event': self.showWorldEvent(prompt); break;
    case 'famine': self.showFamine(prompt); break;
    case 'restore-land': self.showRestoreLand(prompt); break;
    case 'province-order': self.showProvinceOrder(prompt); break;
    case 'muster-proposal': self.showMusterProposal(prompt); break;
    case 'rival-demand': self.showRivalDemand(prompt); break;
    case 'story-beat': self.showStoryBeat(prompt); break;
    case 'empire-response': self.showEmpireResponse(prompt); break;
    case 'wave-result': self.showWaveResult(prompt); break;
    case 'host-lost': self.showHostLost(prompt); break;
    case 'run-over': self.showRunOver(prompt); break;
    case 'dynasty-level': self.showDynastyLevel(prompt); break;
    case 'bind-card': self.showBindCard(prompt); break;
    case 'next-reign': self.showNextReign(prompt); break;
  }
}
