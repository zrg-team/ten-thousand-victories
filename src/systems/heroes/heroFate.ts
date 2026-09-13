/** Pure outcome table shared by the resolver and distribution verification. */
export function heroFate(roll: number, trapped: boolean, lethalConsent: boolean, persistentCaptor: boolean): 'safe' | 'wounded' | 'captured' | 'dead' {
  return !trapped && roll < .7 ? 'safe' : trapped && lethalConsent && roll >= .95 ? 'dead'
    : trapped && roll >= .35 && persistentCaptor ? 'captured' : 'wounded';
}
