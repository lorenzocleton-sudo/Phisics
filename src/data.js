import { G } from './state.js';

export const UPGRADES = {
  tank:  { name: 'Aether Tank', desc: 'More gas for thrust, reel and dashes.', vals: [100, 125, 150, 180, 220], cost: [80, 160, 280, 450], unit: ' gas' },
  reel:  { name: 'Reel Motor', desc: 'Stronger pull on your tethers.', vals: [1, 1.15, 1.3, 1.45, 1.6], cost: [100, 200, 320, 500], unit: 'x pull' },
  range: { name: 'Hook Launcher', desc: 'Fire tethers further.', vals: [80, 95, 110, 125, 140], cost: [90, 180, 300, 460], unit: ' m' },
  edge:  { name: 'Sunsteel Edge', desc: 'Sharper blades cut deeper.', vals: [1, 1.2, 1.4, 1.65, 1.9], cost: [100, 220, 360, 560], unit: 'x dmg' },
  stock: { name: 'Blade Magazine', desc: 'Carry more spare blade pairs.', vals: [4, 5, 6, 7, 8], cost: [60, 120, 200, 300], unit: ' spares' },
  armor: { name: 'Riveted Harness', desc: 'More health.', vals: [100, 120, 140, 165, 190], cost: [90, 180, 300, 460], unit: ' hp' },
};

export const CORPS = {
  vanguard: { name: 'Skyward Vanguard', motto: 'Beyond the wall, we fly.', perk: '+25 gas, +10% reel strength', color: 0x2f6f8a },
  watch:    { name: 'Bulwark Watch', motto: 'The stone holds because we do.', perk: '+25 health, blades wear 25% slower', color: 0x8a3a2a },
  lancers:  { name: 'Crown Lancers', motto: 'Steel for the Lantern.', perk: '+15% blade damage', color: 0xb08a3a },
};

export const ORIGINS = {
  farm:  { name: 'Lowmarch Farmhand', desc: 'You grew up under the Outer Bulwark, close to the danger.', perk: '+10 health' },
  forge: { name: 'Ironvale Forge-born', desc: 'Raised among the foundries that make rigs and blades.', perk: '+1 spare blade pair' },
  crown: { name: 'Solspire Runaway', desc: 'You walked away from a comfortable life in the inner ring.', perk: '+150 starting marks' },
};

export const COAT_COLORS = [0x3b4a5c, 0x5c3b3b, 0x3b5c44, 0x5a4a32, 0x2e2e34];

export function stats() {
  const s = G.save, U = s.upg;
  const lvl = s.level;
  return {
    maxHp: UPGRADES.armor.vals[U.armor] + (s.corps === 'watch' ? 25 : 0) + (s.origin === 'farm' ? 10 : 0) + (lvl - 1) * 4,
    maxGas: UPGRADES.tank.vals[U.tank] + (s.corps === 'vanguard' ? 25 : 0),
    reel: UPGRADES.reel.vals[U.reel] * (s.corps === 'vanguard' ? 1.1 : 1),
    range: UPGRADES.range.vals[U.range],
    dmg: UPGRADES.edge.vals[U.edge] * (s.corps === 'lancers' ? 1.15 : 1) * (1 + 0.03 * (lvl - 1)) * (s.flags.sunsteel ? 1.15 : 1),
    spare: UPGRADES.stock.vals[U.stock] + (s.origin === 'forge' ? 1 : 0),
    wear: s.corps === 'watch' ? 0.75 : 1,
  };
}

export function xpForLevel(l) { return Math.round(100 * Math.pow(l, 1.45)); }

export function newSave(name, origin, coat) {
  return {
    v: 1, name, origin, coat, corps: null,
    level: 1, xp: 0, marks: origin === 'crown' ? 200 : 50,
    upg: { tank: 0, reel: 0, range: 0, edge: 0, stock: 0, armor: 0 },
    section: 'lowmarch', pos: null,
    quests: {}, flags: {}, found: [], kills: 0, best: {},
    settings: null,
  };
}

export const TIPS = [
  'Hold a tether key to reel in. Let go at the bottom of a swing to keep your speed.',
  'Speed is damage. A slow cut barely marks the seam; a fast one severs it.',
  'Cut a Hollow at the ankle and it drops to its knees, nape low and exposed.',
  'Thornbacks wear bone plates over the nape. Take out both ankles first.',
  'Out of gas? Press F at any green-roofed depot to restock gas and blades.',
  'Brutes need two good cuts. Sprinters leap, so stay above them.',
  'Lost insignias sit on the highest rooftops. A collector in Solspire pays for them.',
  'Space in the air burns gas to thrust where you look. Shift dashes.',
];
