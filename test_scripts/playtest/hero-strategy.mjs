/** Deliberately simple, declared strategies; these are agents, not evidence of human preference. */
import * as service from '/src/systems/heroes/HeroService.ts';
import { availableHeroPerks, heroLevel, heroWindow } from '/src/systems/heroes/heroModel.ts';

export function heroStrategyTick(state, plan) {
  if (!state.ascent?.heroDepth || plan === 'declining') return;
  for (const hero of state.heroes.filter(hero => hero.growth)) {
    if (hero.life?.kind === 'captive') {
      const ransom = service.quoteHeroRelease(state, hero.id, 'gold');
      const quote = ransom && state.resources.gold >= ransom.cost * 3 ? ransom : service.quoteHeroRelease(state, hero.id, 'concession');
      if (quote) service.releaseHeroFromQuote(state, quote);
    }
    if (hero.life?.kind === 'active' && hero.life.assignment.kind === 'home') {
      const hosts = state.armies.filter(a => a.kingdomId === 'dai-viet' && !a.generalHeroId && !a.isLevy && !a.patron);
      const provinces = state.lands.filter(land => land.ownerId === 'dai-viet' && !state.heroes.some(h => h.assignedTo === land.id));
      provinces.sort((a,b) => (b.outputs.gold+b.outputs.food+b.outputs.supplies)-(a.outputs.gold+a.outputs.food+a.outputs.supplies));
      const seats = state.court.unlockedSeats.filter(seat => !state.court.seats[seat]);
      const jobs = plan === 'warhost' ? [...hosts.map(a => ({kind:'host',armyId:a.id})), ...provinces.map(l=>({kind:'province',landId:l.id}))]
        : [...provinces.map(l=>({kind:'province',landId:l.id})), ...hosts.map(a => ({kind:'host',armyId:a.id}))];
      jobs.push(...seats.map(seat => ({kind:'court',seat})));
      for (const job of jobs) if (service.assignHeroDuty(state, hero.id, job).ok) break;
      if (hero.life?.kind === 'active' && hero.life.assignment.kind === 'home') for (const court of state.kingdoms) {
        if (!service.residentEntryReason(state, hero, court.id) && service.postResident(state, hero.id, court.id).ok) break;
      }
    }
    const choices = availableHeroPerks(state, hero);
    const priorities = hero.life?.kind === 'active' && hero.life.assignment.kind === 'host'
      ? ['prepared-line','rearguard','orderly-retreat','relief-column']
      : hero.assignedTo?.startsWith('ambassador:') ? ['resident-broker','patient-audience','custodian']
      : plan === 'frontier' ? ['works','continuity','relief'] : ['granary','relief','continuity'];
    const perk = priorities.find(id => choices.includes(id)); if (perk) service.chooseHeroPerk(state, hero.id, perk);
    if (hero.life?.kind === 'active' && hero.life.assignment.kind === 'embassy') {
      const targets = [{kind:'intelligence'}, ...state.heroes.filter(h=>h.life?.kind==='captive').map(h=>({kind:'release',id:h.id})),
        ...state.lands.filter(l=>l.ownerId==='dai-viet'&&l.outputs.supplies>0).map(l=>({kind:'supplies',id:l.id}))];
      for (const target of targets) { const q=service.residentActionQuote(state,hero.id,target.kind,target.id); if(q.ok) {service.startResidentAction(state,q);break;} }
    }
  }
  const working = state.heroes.filter(h=>h.growth && service.serviceStat(state,h));
  for(const mentor of working.filter(h=>heroLevel(h)>=3)) {
    const student=working.find(h=>heroLevel(h)<heroLevel(mentor)&&(h.growth.windows[heroWindow(state)]?.deed??0)<2);
    if(student && service.useHeroPolicy(state,'hero-apprenticeship',mentor.id,student.id).ok) break;
  }
  // Default protection remains authoritative. This agent deliberately grants no lethal consent.
  state.isStrategyPause = false;
}
