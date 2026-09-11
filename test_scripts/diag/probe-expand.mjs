import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:5179/?capture=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__startBenchGame === 'function' && window.__phaserGame.scene.isActive('MenuScene'), null, { timeout: 30000 });
await page.evaluate(() => window.__startBenchGame(20260703, 'empire'));
await page.waitForFunction(() => window.__phaserGame.scene.isActive('MapScene'), null, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const st = window.__mandateState;
  const ACQ = await import('/src/systems/AcquisitionSystem.ts');
  const cap = st.lands.find(l => l.ownerId==='dai-viet');
  const neigh = cap.neighbors.map(id => st.lands.find(l => l.id===id)).filter(Boolean);
  const info = neigh.map(l => ({ name:l.name, type:l.type, owner:l.ownerId, hasVillage:l.hasVillage, localSoldiers:l.localSoldiers, defense:l.defense, visible:l.isVisible, explored:l.isExplored,
    bribeCost: ACQ.getGoldBribeCost(st, l), bribeChance: Math.round(ACQ.getBribeSuccessChance(st, l)*100), settleHumans: ACQ.getSettleHumansCost(st, l) }));
  // try each method on each neighbor, capture result + message
  const tries = [];
  for (const l of neigh) {
    const g0 = st.resources.gold, h0 = st.resources.humans;
    const b = ACQ.bribeLand(st, l.id); tries.push({ land:l.name, method:'bribe', ok:b, msg: st.message });
    const s = ACQ.settleLand(st, l.id); tries.push({ land:l.name, method:'settle', ok:s, msg: st.message });
  }
  return { gold: st.resources.gold, humans: st.resources.humans, capIncome: st.resourceRates, neighbors: info, tries };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();
