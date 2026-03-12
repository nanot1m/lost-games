class Engine {
  constructor(baseEnergy) {
    this.baseEnergy = baseEnergy;
  }

  produce() {
    return this.baseEnergy;
  }
}

class Lens {
  constructor() {
    this.buffNames = [];
    this.effects = [];
  }

  addBuff(name, fn) {
    this.buffNames.push(name);
    this.effects.push(fn);
  }

  distribute(totalEnergy, count) {
    const perGun = totalEnergy / count;
    return Array.from({ length: count }, () => {
      let packet = {
        energy: perGun,
        energyMultiplier: 1,
        burnChance: 0,
        iceChance: 0,
        lightningChance: 0,
        lightningChains: 0,
        lightningRadius: 0,
        critChance: 0,
        critMultiplier: 1.5,
      };
      for (const effect of this.effects) packet = effect(packet);
      return packet;
    });
  }
}

class Link {
  constructor() {
    this.cardId = null;
    this.buffName = null;
    this.effect = {};
    this.multiplier = 1;
    this.color = "#81f6d1";
  }

  isBuffed() {
    return Boolean(this.buffName);
  }

  applyCard(card) {
    if (this.isBuffed()) return false;
    this.cardId = card.id;
    this.buffName = card.name;
    this.effect = card.effect || {};
    this.multiplier = this.effect.multiplier || 1;
    this.color = card.color || "#81f6d1";
    return true;
  }
}

class Gun {
  constructor(name, x, y, baseDamage, linkSlots = 5) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.baseDamage = baseDamage;
    this.range = 130;
    this.attackMode = "circular";
    this.baseFireRate = 3;
    this.verticalBand = 0;
    this.shotgunPellets = 0;
    this.shotgunSpread = 0;
    this.fireRate = 3;
    this.cooldown = 0;
    this.energyMultiplier = 1;
    this.flatDamage = 0;
    this.multiplier = 1;
    this.burnChance = 0;
    this.iceChance = 0;
    this.oilChance = 0;
    this.lightningChance = 0;
    this.lightningChains = 0;
    this.lightningRadius = 0;
    this.magicDamageMultiplier = 1;
    this.links = Array.from({ length: linkSlots }, () => new Link());
  }

  setAttackProfile(profile) {
    if (profile === "sniper") {
      this.attackMode = "sniper";
      this.range = 1200;
      this.verticalBand = 270;
      this.shotgunPellets = 0;
      this.shotgunSpread = 0;
      this.baseFireRate = 0.72;
      return;
    }
    if (profile === "shotgun") {
      this.attackMode = "shotgun";
      this.range = 210;
      this.verticalBand = 130;
      this.shotgunPellets = 5;
      this.shotgunSpread = 120;
      this.baseFireRate = 2.1;
      return;
    }
    this.attackMode = "circular";
    this.verticalBand = 0;
    this.shotgunPellets = 0;
    this.shotgunSpread = 0;
    this.baseFireRate = 3;
  }

  hasFreeLink() {
    return this.links.some((link) => !link.isBuffed());
  }

  hasAttackProfile() {
    return this.links.some((link) => link.isBuffed() && Boolean(link.effect.attackProfile));
  }

  applyLinkCard(card) {
    if (card.effect.attackProfile && this.hasAttackProfile()) return false;
    const freeLink = this.links.find((link) => !link.isBuffed());
    if (!freeLink) return false;
    const applied = freeLink.applyCard(card);
    if (applied) this.recomputeFromLinks();
    return applied;
  }

  recomputeFromLinks() {
    this.energyMultiplier = 1;
    this.flatDamage = 0;
    this.multiplier = 1;
    this.burnChance = 0;
    this.iceChance = 0;
    this.oilChance = 0;
    this.lightningChance = 0;
    this.lightningChains = 0;
    this.lightningRadius = 0;
    this.magicDamageMultiplier = 1;
    this.range = 130;
    this.setAttackProfile("circular");
    let fireRateMultiplier = 1;

    for (const link of this.links) {
      if (!link.isBuffed()) continue;
      const effect = link.effect;
      this.flatDamage += effect.flatDamage || 0;
      this.multiplier *= effect.damageMultiplier || 1;
      this.multiplier *= effect.multiplier || 1;
      this.burnChance += effect.burnChance || 0;
      this.iceChance += effect.iceChance || 0;
      this.oilChance += effect.oilChance || 0;
      this.lightningChance += effect.lightningChance || 0;
      this.lightningChains += effect.lightningChains || 0;
      this.lightningRadius += effect.lightningRadius || 0;
      this.magicDamageMultiplier *= effect.magicDamageMultiplier || 1;
      this.energyMultiplier *= effect.energyMultiplier || 1;
      this.range += effect.rangeBonus || 0;
      if (effect.attackProfile) this.setAttackProfile(effect.attackProfile);
      fireRateMultiplier *= effect.fireRateMultiplier || 1;
    }
    this.fireRate = Math.max(0.35, this.baseFireRate * fireRateMultiplier);
    this.range = Math.max(70, this.range);
    this.burnChance = Math.max(0, Math.min(0.95, this.burnChance));
    this.iceChance = Math.max(0, Math.min(0.95, this.iceChance));
    this.oilChance = Math.max(0, Math.min(0.95, this.oilChance));
    this.lightningChance = Math.max(0, Math.min(0.95, this.lightningChance));
    this.lightningChains = Math.max(0, Math.round(this.lightningChains));
    this.lightningRadius = Math.max(0, this.lightningRadius);
    this.magicDamageMultiplier = Math.max(0.4, Math.min(4, this.magicDamageMultiplier));
    this.energyMultiplier = Math.max(0.4, Math.min(3, this.energyMultiplier));
  }
}

class Enemy {
  constructor(y, wave, isBoss, startX, wallX, powerScale, durabilityScale) {
    this.x = startX;
    this.y = y;
    this.wallX = wallX;
    this.isBoss = isBoss;
    const baseRadius = isBoss ? 20 : 12;
    const baseHp = isBoss ? 560 + wave * 80 : 48 + wave * 14;
    const baseSpeed = isBoss ? 38 + wave * 0.9 : 62 + wave * 2.1;
    const durability = durabilityScale || 1;
    const firstBossEase = isBoss && wave === 5 ? 0.82 : 1;

    this.maxHp = baseHp * powerScale * durability * firstBossEase;
    this.hp = this.maxHp;
    this.radius = baseRadius * (0.84 + 0.52 * Math.sqrt(durability));
    const durabilitySpeedPenalty = Math.max(0.42, Math.min(1.45, 1 / Math.pow(durability, 0.72)));
    const wavePowerBoost = Math.min(1.6, 1 + (powerScale - 1) * 0.2);
    this.speed = baseSpeed * wavePowerBoost * durabilitySpeedPenalty * (isBoss && wave === 5 ? 0.92 : 1);
    this.burnStacks = 0;
    this.burnTimer = 0;
    this.burnPower = 1;
    this.freezeStacks = 0;
    this.freezeTimer = 0;
    this.freezePower = 1;
    this.lastHitKind = "physical";
    this.reachedWall = false;
  }

  update(dt) {
    const slowMultiplier = Math.max(0.35, 1 - this.freezeStacks * 0.14);
    this.x -= this.speed * slowMultiplier * dt;
    if (this.x <= this.wallX + this.radius) this.reachedWall = true;
  }

  alive() {
    return this.hp > 0 && !this.reachedWall;
  }

  applyBurn(power = 1) {
    if (this.freezeStacks > 0) {
      this.freezeStacks = Math.max(0, this.freezeStacks - 1);
      if (this.freezeStacks === 0) this.freezePower = 1;
      return "thaw";
    }
    this.burnStacks += 1;
    this.burnPower = Math.max(this.burnPower, power);
    return "burn";
  }

  applyFreeze(power = 1) {
    if (this.burnStacks > 0) {
      this.burnStacks = Math.max(0, this.burnStacks - 1);
      if (this.burnStacks === 0) this.burnPower = 1;
      return "extinguish";
    }
    this.freezeStacks += 1;
    this.freezePower = Math.max(this.freezePower, power);
    return "freeze";
  }

  tickStatus(dt) {
    if (this.burnStacks > 0) {
      this.burnTimer += dt;
      if (this.burnTimer >= 0.45) {
        this.burnTimer = 0;
        this.hp -= this.burnStacks * 3.6 * this.burnPower;
      }
    }

    if (this.freezeStacks > 0) {
      this.freezeTimer += dt;
      if (this.freezeTimer >= 0.6) {
        this.freezeTimer = 0;
        this.hp -= this.freezeStacks * 1.6 * this.freezePower;
      }
    }
  }
}

const BOSS_EVERY_WAVES = 5;
const MAX_LINKS_PER_GUN = 8;
const SPAWN_INTERVAL = 0.65;
const WAVE_SIZE = (wave) => (wave <= 3 ? 4 + wave : 5 + Math.floor(wave * 1.1));
const ENEMY_POWER_PER_BOSS = 1.15;
const WALL_DAMAGE_NORMAL_BASE = 0.75;
const WALL_DAMAGE_BOSS_BASE = 4.2;
const WALL_HP_MAX = 30;
const REGULAR_CARD_CHOICES = 5;
const RARITY_COLORS = {
  common: "#8f9aa7",
  rare: "#5da8ff",
  legendary: "#ffb35c",
};
const RARITY_WEIGHTS = {
  common: 72,
  rare: 22,
  legendary: 6,
};

const LINK_CARDS = [
  {
    id: "gun_flat",
    target: "link",
    name: "Усиленный ствол",
    rarity: "common",
    color: RARITY_COLORS.common,
    description: "+2 урона",
    effect: { flatDamage: 2 },
  },
  {
    id: "gun_mult",
    target: "link",
    name: "Фокус-катушка",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "x1.9 урона, но -22% скорости атаки",
    effect: { damageMultiplier: 1.9, fireRateMultiplier: 0.78 },
  },
  {
    id: "gun_burn",
    target: "link",
    name: "Термоядро",
    rarity: "common",
    color: RARITY_COLORS.common,
    description: "+12% шанс поджога",
    effect: { burnChance: 0.12 },
  },
  {
    id: "gun_lightning",
    target: "link",
    name: "Цепная молния",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "26% шанс молнии (2 скачка), но -8% урона",
    effect: { lightningChance: 0.26, lightningChains: 2, lightningRadius: 130, damageMultiplier: 0.92 },
  },
  {
    id: "gun_ice",
    target: "link",
    name: "Ледяной контур",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "28% шанс льда, но -10% скорости атаки",
    effect: { iceChance: 0.28, fireRateMultiplier: 0.9 },
  },
  {
    id: "gun_oil",
    target: "link",
    name: "Масляный распыл",
    rarity: "common",
    color: RARITY_COLORS.common,
    description: "12% шанс создать масляную лужу",
    effect: { oilChance: 0.12 },
  },
  {
    id: "gun_magic_amp",
    target: "link",
    name: "Магический фокус",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "+70% маг. урону, но -25% физ. урона и -10% скорости атаки",
    effect: { magicDamageMultiplier: 1.7, damageMultiplier: 0.75, fireRateMultiplier: 0.9 },
  },
  {
    id: "gun_aspd_1",
    target: "link",
    name: "Разгон затвора",
    rarity: "common",
    color: RARITY_COLORS.common,
    description: "+12% скорости атаки",
    effect: { fireRateMultiplier: 1.12 },
  },
  {
    id: "gun_aspd_2",
    target: "link",
    name: "Турбо-автоматика",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "+80% скорости атаки, но -22% урона и -25 дальности",
    effect: { fireRateMultiplier: 1.8, damageMultiplier: 0.78, rangeBonus: -25 },
  },
  {
    id: "gun_sniper",
    target: "link",
    name: "Снайперский ствол",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "Снайпер-профиль, но -30% скорости атаки",
    effect: { attackProfile: "sniper", fireRateMultiplier: 0.7 },
  },
  {
    id: "gun_shotgun",
    target: "link",
    name: "Дробовик",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "Дробовой профиль, но -18% урона",
    effect: { attackProfile: "shotgun", damageMultiplier: 0.82 },
  },
  {
    id: "link_x2",
    target: "link",
    name: "Резонатор",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "x2 урона, но -35% скорости атаки и -20% шанса ожога",
    effect: { multiplier: 2, fireRateMultiplier: 0.65, burnChance: -0.2 },
  },
  {
    id: "link_x15",
    target: "link",
    name: "Стабилизатор",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "x1.35 урона, но -8% скорости атаки",
    effect: { multiplier: 1.35, fireRateMultiplier: 0.92 },
  },
];

const LENS_CARDS = [
  {
    id: "lens_flux",
    target: "lens",
    name: "Линза потока",
    rarity: "common",
    color: RARITY_COLORS.common,
    description: "Луч даёт +18% энергии каждому выстрелу",
    applyLens: (lens) =>
      lens.addBuff("Поток", (p) => ({ ...p, energyMultiplier: p.energyMultiplier * 1.18 })),
  },
  {
    id: "lens_pyro",
    target: "lens",
    name: "Линза жара",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "Луч даёт +20% шанса ожога всем пушкам, но -8% энергии",
    applyLens: (lens) =>
      lens.addBuff("Жар", (p) => ({
        ...p,
        burnChance: p.burnChance + 0.2,
        energyMultiplier: p.energyMultiplier * 0.92,
      })),
  },
  {
    id: "lens_frost",
    target: "lens",
    name: "Линза мороза",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "Луч даёт +18% шанса льда всем пушкам, но -8% энергии",
    applyLens: (lens) =>
      lens.addBuff("Мороз", (p) => ({
        ...p,
        iceChance: p.iceChance + 0.18,
        energyMultiplier: p.energyMultiplier * 0.92,
      })),
  },
  {
    id: "lens_storm",
    target: "lens",
    name: "Линза грозы",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "Луч даёт +14% шанса молнии (+1 скачок, +70 радиус), но -15% энергии",
    applyLens: (lens) =>
      lens.addBuff("Гроза", (p) => ({
        ...p,
        lightningChance: p.lightningChance + 0.14,
        lightningChains: p.lightningChains + 1,
        lightningRadius: p.lightningRadius + 70,
        energyMultiplier: p.energyMultiplier * 0.85,
      })),
  },
];

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;
let currentDpr = 1;
let enemyUidSeq = 1;

const ui = {
  board: document.querySelector(".board"),
  threeLayer: document.getElementById("threeLayer"),
  wave: document.getElementById("waveStat"),
  kills: document.getElementById("killsStat"),
  baseHp: document.getElementById("baseHpStat"),
  nextCard: document.getElementById("nextCardStat"),
  lensBuffs: document.getElementById("lensBuffs"),
  selectedGunInfo: document.getElementById("selectedGunInfo"),
  log: document.getElementById("log"),
  modal: document.getElementById("cardModal"),
  cardModalTitle: document.getElementById("cardModalTitle"),
  cardHint: document.getElementById("cardHint"),
  cardChoices: document.getElementById("cardChoices"),
  targetChoices: document.getElementById("targetChoices"),
  restartBtn: document.getElementById("restartBtn"),
  cardsInfoBtn: document.getElementById("cardsInfoBtn"),
  cardsInfoModal: document.getElementById("cardsInfoModal"),
  cardsInfoBody: document.getElementById("cardsInfoBody"),
  cardsInfoCloseBtn: document.getElementById("cardsInfoCloseBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  threeModeBtn: document.getElementById("threeModeBtn"),
  cameraOrbitBtn: document.getElementById("cameraOrbitBtn"),
};

const world = {
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  enginePos: { x: 90, y: 270 },
  lensPos: { x: 220, y: 270 },
  guns: [
    new Gun("Пушка A", 480, 90, 11, MAX_LINKS_PER_GUN),
    new Gun("Пушка B", 480, 175, 12, MAX_LINKS_PER_GUN),
    new Gun("Пушка C", 480, 260, 10, MAX_LINKS_PER_GUN),
    new Gun("Пушка D", 480, 345, 11, MAX_LINKS_PER_GUN),
    new Gun("Пушка E", 480, 430, 12, MAX_LINKS_PER_GUN),
  ],
  wall: { x: 472, y: 40, w: 16, h: 460 },
  monsterStartX: 940,
  monsterYMin: 74,
  monsterYMax: 466,
  enemies: [],
  beams: [],
  particles: [],
  puddles: [],
  explosions: [],
};

const state = {
  engine: new Engine(36),
  lens: new Lens(),
  wave: 1,
  kills: 0,
  wallHp: WALL_HP_MAX,
  waveQueue: 0,
  spawnTimer: 0,
  nextWaveDelay: 2.3,
  isBossWave: false,
  selectedGunIndex: -1,
  draggingGunIndex: -1,
  pausedByCards: false,
  userPaused: false,
  threeMode: false,
  cameraOrbitEnabled: false,
  gameOver: false,
  pendingRegularCardRewards: 0,
  pendingBossLensRewards: 0,
  waveRewardGranted: false,
  enemyPowerScale: 1,
  lastTime: performance.now(),
};

function logLine(text) {
  const line = document.createElement("div");
  line.className = "log-item";
  line.textContent = text;
  ui.log.prepend(line);
}

function allLinksBuffed() {
  return world.guns.every((g) => g.links.every((link) => link.isBuffed()));
}

function randomPick(pool, count) {
  const src = [...pool];
  const selected = [];
  while (selected.length < count && src.length > 0) {
    const totalWeight = src.reduce((sum, card) => sum + (RARITY_WEIGHTS[card.rarity] || 1), 0);
    let roll = Math.random() * totalWeight;
    let pickIdx = 0;
    for (let i = 0; i < src.length; i += 1) {
      roll -= RARITY_WEIGHTS[src[i].rarity] || 1;
      if (roll <= 0) {
        pickIdx = i;
        break;
      }
    }
    selected.push(src.splice(pickIdx, 1)[0]);
  }
  return selected;
}

function buildRegularCardPool() {
  const hasFreeLink = world.guns.some((g) => g.hasFreeLink());
  if (!hasFreeLink) return [];
  return LINK_CARDS.filter((card) => {
    if (!card.effect.attackProfile) return true;
    return world.guns.some((gun) => gun.hasFreeLink() && !gun.hasAttackProfile());
  });
}

function zoneName(gun) {
  if (gun.attackMode === "sniper") return "Снайпер";
  if (gun.attackMode === "shotgun") return "Дробовик";
  return "Круг";
}

function rarityLabel(card) {
  if (card.rarity === "legendary") return "ЛЕГЕНДАРНАЯ";
  if (card.rarity === "rare") return "РЕДКАЯ";
  return "ОБЫЧНАЯ";
}

function rarityChanceByCard(card, pool) {
  const sameRarity = pool.filter((c) => c.rarity === card.rarity).length;
  const rarityWeight = RARITY_WEIGHTS[card.rarity] || 0;
  if (!sameRarity || !rarityWeight) return 0;
  const weightTotal = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  return (rarityWeight / weightTotal / sameRarity) * 100;
}

function rarityChipHtml(card) {
  const color = card.color || "#8f9aa7";
  return `<span class="rarity-chip" style="border-color:${color};color:${color};">${card.rarity}</span>`;
}

function renderCardsInfoTable() {
  if (!ui.cardsInfoBody) return;
  const all = [
    ...LINK_CARDS.map((c) => ({ ...c, source: "Обычная награда" })),
    ...LENS_CARDS.map((c) => ({ ...c, source: "Награда за босса" })),
  ];
  const linkPool = LINK_CARDS;
  const lensPool = LENS_CARDS;

  ui.cardsInfoBody.innerHTML = "";
  all.forEach((card) => {
    const pool = card.source === "Награда за босса" ? lensPool : linkPool;
    const chance = rarityChanceByCard(card, pool);
    const row = document.createElement("tr");
    row.innerHTML = [
      `<td>${cardIcon(card)} ${card.name}</td>`,
      `<td>${card.source}</td>`,
      `<td>${rarityChipHtml(card)}</td>`,
      `<td>${chance.toFixed(1)}%</td>`,
      `<td>${card.description}</td>`,
    ].join("");
    ui.cardsInfoBody.append(row);
  });
}

function openCardsInfoModal() {
  if (!ui.cardsInfoModal) return;
  renderCardsInfoTable();
  ui.cardsInfoModal.classList.remove("hidden");
}

function closeCardsInfoModal() {
  if (!ui.cardsInfoModal) return;
  ui.cardsInfoModal.classList.add("hidden");
}

function cardIcon(card) {
  const id = card.id || "";
  if (id.includes("flat")) return "💥";
  if (id.includes("mult")) return "✖";
  if (id.includes("burn")) return "🔥";
  if (id.includes("lightning")) return "⚡";
  if (id.includes("ice")) return "❄";
  if (id.includes("oil")) return "🛢";
  if (id.includes("magic")) return "✨";
  if (id.includes("aspd")) return "⚡";
  if (id.includes("sniper")) return "🎯";
  if (id.includes("shotgun")) return "🔫";
  if (id.includes("x2") || id.includes("x15")) return "🔗";
  if (id.includes("lens")) return "🔮";
  return "🃏";
}

function linkBuffIcon(link) {
  const id = link?.cardId || "";
  if (id.includes("flat")) return "💥";
  if (id.includes("mult")) return "✖";
  if (id.includes("burn")) return "🔥";
  if (id.includes("lightning")) return "⚡";
  if (id.includes("ice")) return "❄";
  if (id.includes("oil")) return "🛢";
  if (id.includes("magic")) return "✨";
  if (id.includes("aspd")) return "⏩";
  if (id.includes("sniper")) return "🎯";
  if (id.includes("shotgun")) return "🔫";
  if (id.includes("x2") || id.includes("x15")) return "🔗";
  return "⬢";
}

function cardArtSeed(card) {
  const id = card.id || "";
  if (id.includes("flat")) return { glyph: "BLAST", c1: "#ff9a5b", c2: "#ffd38b" };
  if (id.includes("mult")) return { glyph: "CORE", c1: "#ffe377", c2: "#ffb347" };
  if (id.includes("burn")) return { glyph: "FIRE", c1: "#ff6f61", c2: "#ffbe7a" };
  if (id.includes("lightning")) return { glyph: "BOLT", c1: "#b5e8ff", c2: "#e6faff" };
  if (id.includes("ice")) return { glyph: "FROST", c1: "#90d4ff", c2: "#d7f1ff" };
  if (id.includes("oil")) return { glyph: "OIL", c1: "#848b9b", c2: "#b1b7c8" };
  if (id.includes("magic")) return { glyph: "ARCANA", c1: "#cd9dff", c2: "#e7d4ff" };
  if (id.includes("aspd")) return { glyph: "ARC", c1: "#6ed7ff", c2: "#9ff3ff" };
  if (id.includes("sniper")) return { glyph: "LINE", c1: "#c2a6ff", c2: "#e3d7ff" };
  if (id.includes("shotgun")) return { glyph: "CONE", c1: "#86c9ff", c2: "#cceaff" };
  if (id.includes("x2") || id.includes("x15")) return { glyph: "CHAIN", c1: "#78ffac", c2: "#b8ffd2" };
  if (id.includes("lens")) return { glyph: "LENS", c1: "#80b6ff", c2: "#a8e7ff" };
  return { glyph: "CARD", c1: "#7fd8ff", c2: "#b8f5ff" };
}

function svgToDataUri(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function cardArtDataUri(card) {
  const seed = cardArtSeed(card);
  const svg = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 280 180'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${seed.c1}' stop-opacity='0.95'/>
      <stop offset='100%' stop-color='${seed.c2}' stop-opacity='0.9'/>
    </linearGradient>
  </defs>
  <rect x='0' y='0' width='280' height='180' rx='18' fill='#0b2032'/>
  <rect x='8' y='8' width='264' height='164' rx='14' fill='url(#g)' opacity='0.2'/>
  <circle cx='140' cy='90' r='46' fill='url(#g)' opacity='0.28'/>
  <circle cx='140' cy='90' r='26' fill='none' stroke='url(#g)' stroke-width='3'/>
  <text x='140' y='98' text-anchor='middle' fill='#eaf8ff' font-size='20' font-family='Space Grotesk, Arial, sans-serif' font-weight='700'>${seed.glyph}</text>
</svg>`;
  return svgToDataUri(svg);
}

function gunUpgradesText(gun) {
  const upgrades = gun.links.filter((link) => link.isBuffed()).map((link) => link.buffName);
  return upgrades.length > 0 ? upgrades.join(", ") : "Нет апгрейдов";
}

function getLensPacketPreview() {
  const packets = state.lens.distribute(state.engine.produce(), world.guns.length);
  return packets[0] || {
    energy: 0,
    energyMultiplier: 1,
    burnChance: 0,
    iceChance: 0,
    lightningChance: 0,
    lightningChains: 0,
    lightningRadius: 0,
    critChance: 0,
    critMultiplier: 1.5,
  };
}

function composeCombatStats(gun, packet) {
  const energyScale = gun.energyMultiplier * (packet.energyMultiplier || 1);
  return {
    energyScale,
    magicScale: gun.magicDamageMultiplier * energyScale,
    burnChance: Math.max(0, Math.min(0.95, gun.burnChance + (packet.burnChance || 0))),
    iceChance: Math.max(0, Math.min(0.95, gun.iceChance + (packet.iceChance || 0))),
    oilChance: Math.max(0, Math.min(0.95, gun.oilChance)),
    lightningChance: Math.max(0, Math.min(0.95, gun.lightningChance + (packet.lightningChance || 0))),
    lightningChains: Math.max(0, Math.round(gun.lightningChains + (packet.lightningChains || 0))),
    lightningRadius: Math.max(0, gun.lightningRadius + (packet.lightningRadius || 0)),
  };
}

function updateHud() {
  ui.wave.textContent = String(state.wave);
  ui.kills.textContent = String(state.kills);
  ui.baseHp.textContent = String(Math.max(0, state.wallHp).toFixed(1));
  ui.nextCard.textContent = state.pendingRegularCardRewards > 0 ? "0" : "1";
  ui.restartBtn.classList.toggle("hidden", !state.gameOver);
  if (ui.pauseBtn) ui.pauseBtn.textContent = state.userPaused ? "Продолжить" : "Пауза";
  if (ui.threeModeBtn) ui.threeModeBtn.textContent = state.threeMode ? "2D режим" : "3D режим";
  if (ui.cameraOrbitBtn) {
    ui.cameraOrbitBtn.textContent = state.cameraOrbitEnabled ? "Камера: ON" : "Камера 3D";
    ui.cameraOrbitBtn.disabled = !state.threeMode;
  }

  ui.lensBuffs.innerHTML = "";
  if (state.lens.buffNames.length === 0) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "Без бафов";
    ui.lensBuffs.append(chip);
  } else {
    state.lens.buffNames.forEach((name) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = name;
      ui.lensBuffs.append(chip);
    });
  }

  if (state.selectedGunIndex < 0) {
    ui.selectedGunInfo.textContent = "Кликни по пушке на канвасе. Подписи: A/B/C/D/E.";
  } else {
    const gun = world.guns[state.selectedGunIndex];
    const lensPacket = getLensPacketPreview();
    const combat = composeCombatStats(gun, lensPacket);
    const buffedLinks = gun.links.filter((link) => link.isBuffed()).length;
    const totalLinks = gun.links.length;
    const zone = zoneName(gun);
    ui.selectedGunInfo.innerHTML = [
      `<div><strong>${gun.name}</strong></div>`,
      `<div>Урон: ${gun.baseDamage}+${gun.flatDamage}</div>`,
      `<div>Множитель: x${gun.multiplier.toFixed(2)}</div>`,
      `<div>Скорость атаки: ${gun.fireRate.toFixed(2)}/с</div>`,
      `<div>Дальность: ${gun.range.toFixed(0)}</div>`,
      `<div>Зона атаки: ${zone}</div>`,
      `<div>Ожог (итог): ${(combat.burnChance * 100).toFixed(0)}%</div>`,
      `<div>Лёд (итог): ${(combat.iceChance * 100).toFixed(0)}% | Лужа: ${(combat.oilChance * 100).toFixed(0)}%</div>`,
      `<div>Молния (итог): ${(combat.lightningChance * 100).toFixed(0)}% (${combat.lightningChains} скач., R${combat.lightningRadius.toFixed(0)})</div>`,
      `<div>Маг. множитель (итог): x${combat.magicScale.toFixed(2)}</div>`,
      `<div>Энергия: x${gun.energyMultiplier.toFixed(2)} · Линза: x${(lensPacket.energyMultiplier || 1).toFixed(2)} = x${combat.energyScale.toFixed(2)}</div>`,
      `<div>Звенья: ${buffedLinks}/${totalLinks} (макс ${MAX_LINKS_PER_GUN})</div>`,
      `<div>Апгрейды: ${gunUpgradesText(gun)}</div>`,
    ].join("");
  }
}

function openCardModal(cards, hint, onPick) {
  state.pausedByCards = true;
  ui.modal.classList.remove("hidden");
  if (ui.cardModalTitle) ui.cardModalTitle.textContent = `Выбери 1 из ${cards.length} карточек`;
  ui.cardHint.textContent = hint;
  ui.cardChoices.innerHTML = "";
  ui.targetChoices.innerHTML = "";
  cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.className = "card-btn game-card";
    btn.style.setProperty("--card-accent", card.color || "#7dd6ff");
    btn.style.setProperty("--i", String(idx));
    btn.style.setProperty("--count", String(cards.length));
    btn.style.setProperty("--art-bg", cardArtDataUri(card));
    btn.innerHTML = [
      `<div class="game-card-top">`,
      `<span class="game-card-icon">${cardIcon(card)}</span>`,
      `<span class="game-card-type">${rarityLabel(card)}</span>`,
      `<strong class="game-card-title">${card.name}</strong>`,
      `</div>`,
      `<div class="game-card-art"></div>`,
      `<div class="game-card-body">${card.description}</div>`,
    ].join("");
    btn.onclick = () => onPick(card);
    ui.cardChoices.append(btn);
  });
  animateFan(ui.cardChoices);
}

function closeCardModal() {
  state.pausedByCards = false;
  ui.modal.classList.add("hidden");
  ui.cardChoices.innerHTML = "";
  ui.targetChoices.innerHTML = "";
  updateHud();
  maybeOfferQueuedRewards();
}

function showTargetPick(title, guns, onPick) {
  ui.cardHint.textContent = title;
  ui.targetChoices.innerHTML = "";
  const lensPacket = getLensPacketPreview();
  guns.forEach((gun, idx) => {
    const combat = composeCombatStats(gun, lensPacket);
    const buffedLinks = gun.links.filter((link) => link.isBuffed()).length;
    const btn = document.createElement("button");
    btn.className = "target-btn game-card gun-card-choice";
    btn.style.setProperty("--card-accent", "#7cf1c5");
    btn.style.setProperty("--i", String(idx));
    btn.style.setProperty("--count", String(guns.length));
    btn.style.setProperty(
      "--art-bg",
      cardArtDataUri({ id: `gun_${zoneName(gun).toLowerCase()}`, color: "#7cf1c5" })
    );
    btn.innerHTML = [
      `<div class="game-card-top">`,
      `<span class="game-card-icon">🛡</span>`,
      `<span class="game-card-type">ПУШКА</span>`,
      `<strong class="game-card-title">${gun.name}</strong>`,
      `</div>`,
      `<div class="game-card-art"></div>`,
      `<div class="game-card-body">`,
      `💥 ${gun.baseDamage}+${gun.flatDamage}<br/>`,
      `✖ ${gun.multiplier.toFixed(2)} | ⚡ ${gun.fireRate.toFixed(2)}/с<br/>`,
      `🎯 ${zoneName(gun)} | 📏 ${gun.range.toFixed(0)}<br/>`,
      `🔥 ${(combat.burnChance * 100).toFixed(0)}% | ❄ ${(combat.iceChance * 100).toFixed(0)}% | 🛢 ${(combat.oilChance * 100).toFixed(0)}%<br/>`,
      `⚡ ${(combat.lightningChance * 100).toFixed(0)}% (${combat.lightningChains}) R${combat.lightningRadius.toFixed(0)} | ✨ x${combat.magicScale.toFixed(2)}<br/>`,
      `⚛ Энергия: x${combat.energyScale.toFixed(2)}<br/>`,
      `🔗 ${buffedLinks}/${MAX_LINKS_PER_GUN}<br/>`,
      `Апгрейды: ${gunUpgradesText(gun)}`,
      `</div>`,
    ].join("");
    btn.onclick = () => {
      onPick(gun);
      closeCardModal();
    };
    ui.targetChoices.append(btn);
  });
  animateFan(ui.targetChoices);
}

function animateFan(container) {
  container.classList.remove("fan-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.classList.add("fan-open");
    });
  });
}

function maybeOfferQueuedRewards() {
  if (state.pausedByCards) return;
  if (state.pendingBossLensRewards > 0) {
    offerBossLensCard();
    return;
  }
  if (state.pendingRegularCardRewards > 0) {
    offerRegularCards();
  }
}

function offerRegularCards() {
  const pool = buildRegularCardPool();
  const offer = randomPick(pool, REGULAR_CARD_CHOICES);
  if (offer.length === 0) {
    state.pendingRegularCardRewards = Math.max(0, state.pendingRegularCardRewards - 1);
    return;
  }
  openCardModal(offer, "Обычная награда: выбери 1 карточку.", (card) => {
    const targets = world.guns.filter((g) => {
      if (!g.hasFreeLink()) return false;
      if (card.effect.attackProfile) return !g.hasAttackProfile();
      return true;
    });
    if (targets.length === 0) {
      state.pendingRegularCardRewards = Math.max(0, state.pendingRegularCardRewards - 1);
      logLine(`"${card.name}" пропущена: нет валидной цели.`);
      closeCardModal();
      return;
    }
    showTargetPick(`"${card.name}": выбери звено`, targets, (gun) => {
      const applied = gun.applyLinkCard(card);
      if (!applied) {
        logLine(`"${card.name}" не применена к ${gun.name}.`);
        return;
      }
      state.pendingRegularCardRewards = Math.max(0, state.pendingRegularCardRewards - 1);
      logLine(`"${card.name}" применена к звену ${gun.name} (${gun.links.filter((l) => l.isBuffed()).length}/${MAX_LINKS_PER_GUN}).`);
      if (allLinksBuffed()) logLine("Все звенья забафаны. Максимальная синергия достигнута.");
    });
  });
}

function offerBossLensCard() {
  const offer = randomPick(LENS_CARDS, 2);
  openCardModal(
    offer,
    "Редкая награда за босса: улучшение ЛИНЗЫ (супер редкое). Выбери 1.",
    (card) => {
      card.applyLens(state.lens);
      state.pendingBossLensRewards = Math.max(0, state.pendingBossLensRewards - 1);
      logLine(`Босс-перк "${card.name}" применен к линзе.`);
      closeCardModal();
    }
  );
}

function beginWave(wave) {
  state.isBossWave = wave % BOSS_EVERY_WAVES === 0;
  state.waveQueue = state.isBossWave ? 1 : WAVE_SIZE(wave);
  state.spawnTimer = 0;
  state.waveRewardGranted = false;
  if (state.isBossWave) {
    logLine(`Волна ${wave}: БОСС.`);
  } else {
    logLine(`Волна ${wave}: ${state.waveQueue} монстров.`);
  }
}

function spawnEnemy() {
  const y =
    world.monsterYMin + Math.random() * (world.monsterYMax - world.monsterYMin);

  let durabilityScale = 1;
  if (state.isBossWave) {
    if (state.wave === 5) {
      durabilityScale = 1.05 + Math.random() * 0.3;
    } else {
      durabilityScale = 1.25 + Math.random() * 0.45;
    }
  } else {
    durabilityScale = 0.8 + Math.random() * 0.9;
  }

  const enemy = new Enemy(
    y,
    state.wave,
    state.isBossWave,
    world.monsterStartX,
    world.wall.x,
    state.enemyPowerScale,
    durabilityScale
  );
  enemy.uid = enemyUidSeq++;
  world.enemies.push(enemy);
}

function enemyWallDamage(enemy) {
  const power = Math.pow(state.enemyPowerScale, 0.9);
  if (enemy.isBoss) return WALL_DAMAGE_BOSS_BASE * power;
  return WALL_DAMAGE_NORMAL_BASE * power;
}

function enemyInGunZone(gun, enemy) {
  const dx = enemy.x - gun.x;
  const dy = enemy.y - gun.y;
  if (dx < 0) return false;

  if (gun.attackMode === "sniper") {
    const maxDx = Math.max(1, world.width - gun.x);
    if (dx > maxDx) return false;
    const t = dx / maxDx;
    const halfWidth = 8 + (gun.verticalBand / 2) * t;
    return Math.abs(dy) <= halfWidth;
  }
  if (gun.attackMode === "shotgun") {
    return dx <= gun.range && Math.abs(dy) <= gun.verticalBand / 2;
  }
  return Math.hypot(dx, dy) <= gun.range;
}

function pushParticle(x, y, options = {}) {
  world.particles.push({
    x,
    y,
    life: options.life ?? 0.25,
    size: options.size ?? 2.2,
    color: options.color ?? "#ffc982",
    vx: options.vx ?? (Math.random() - 0.5) * 22,
    vy: options.vy ?? -16 - Math.random() * 18,
  });
}

function spawnExplosion(x, y, kind = "death", scale = 1) {
  world.explosions.push({
    x,
    y,
    life: 0.48,
    maxLife: 0.48,
    radius: 12 * scale,
    kind,
  });
}

function applyMagicDamage(enemy, amount) {
  enemy.hp -= amount;
  enemy.lastHitKind = "magic";
  for (let i = 0; i < 3; i += 1) {
    pushParticle(enemy.x, enemy.y, {
      life: 0.24,
      size: 2 + Math.random() * 2.2,
      color: "#c8eaff",
      vx: (Math.random() - 0.5) * 34,
      vy: -10 - Math.random() * 22,
    });
  }
}

function createOilPuddle(x, y, magicScale) {
  if (world.puddles.length >= 18) return;
  world.puddles.push({
    x,
    y,
    radius: 34,
    life: 8,
    ignited: false,
    tickTimer: 0,
    magicScale: magicScale || 1,
  });
}

function triggerLightning(startEnemy, combat) {
  if (combat.lightningChance <= 0 || combat.lightningChains <= 0 || combat.lightningRadius <= 0) return;
  if (Math.random() >= combat.lightningChance) return;

  const magicMult = combat.magicScale;
  let current = startEnemy;
  const visited = new Set([startEnemy]);
  applyMagicDamage(startEnemy, 8 * magicMult);
  startEnemy.lastHitKind = "magic";

  for (let jump = 0; jump < combat.lightningChains; jump += 1) {
    let next = null;
    let bestDist = Infinity;
    for (const enemy of world.enemies) {
      if (!enemy.alive() || visited.has(enemy)) continue;
      const dist = Math.hypot(enemy.x - current.x, enemy.y - current.y);
      if (dist <= combat.lightningRadius && dist < bestDist) {
        bestDist = dist;
        next = enemy;
      }
    }
    if (!next) break;
    visited.add(next);
    applyMagicDamage(next, (7 - jump * 1.2) * magicMult);
    next.lastHitKind = "magic";
    world.beams.push({
      x1: current.x,
      y1: current.y,
      x2: next.x,
      y2: next.y,
      crit: false,
      life: 0.14,
      color: "rgba(255,238,80,0.98)",
    });
    pushParticle(next.x, next.y, { color: "#fff08a", size: 3.2, life: 0.24 });
    current = next;
  }
}

function applyHit(enemy, damage, combat) {
  enemy.lastHitKind = "physical";
  enemy.hp -= damage;
  if (Math.random() < combat.burnChance) {
    const burnState = enemy.applyBurn(combat.magicScale);
    enemy.lastHitKind = "magic";
    pushParticle(enemy.x, enemy.y, { color: burnState === "thaw" ? "#ffd39b" : "#ff9966", size: 2.7 });
  }
  if (Math.random() < combat.iceChance) {
    const freezeState = enemy.applyFreeze(combat.magicScale);
    enemy.lastHitKind = "magic";
    pushParticle(enemy.x, enemy.y, { color: freezeState === "extinguish" ? "#d8ecff" : "#7ecaff", size: 2.9 });
  }
  if (Math.random() < combat.oilChance) createOilPuddle(enemy.x, enemy.y, combat.magicScale);
  triggerLightning(enemy, combat);
  pushParticle(enemy.x, enemy.y, { color: "#ffc982", size: 2 + Math.random() * 2.5 });
}

function pickGunTarget(gun) {
  let target = null;
  let bestX = Infinity;
  for (const enemy of world.enemies) {
    if (!enemy.alive()) continue;
    if (!enemyInGunZone(gun, enemy)) continue;
    if (enemy.x < bestX) {
      bestX = enemy.x;
      target = enemy;
    }
  }
  return target;
}

function fireShotgun(gun, baseDamage, combat) {
  const pellets = gun.shotgunPellets || 5;
  const spread = gun.shotgunSpread || 120;
  for (let i = 0; i < pellets; i += 1) {
    const lane = pellets === 1 ? 0 : i / (pellets - 1);
    const yLine = gun.y - spread / 2 + spread * lane;
    const xEnd = gun.x + gun.range;

    let hit = null;
    let bestX = Infinity;
    for (const enemy of world.enemies) {
      if (!enemy.alive()) continue;
      if (enemy.x < gun.x || enemy.x > xEnd) continue;
      if (Math.abs(enemy.y - yLine) > 18) continue;
      if (enemy.x < bestX) {
        bestX = enemy.x;
        hit = enemy;
      }
    }

    if (hit) {
      applyHit(hit, baseDamage * 0.42, combat);
      world.beams.push({
        x1: gun.x,
        y1: gun.y,
        x2: hit.x,
        y2: hit.y,
        crit: false,
        life: 0.08,
      });
    } else {
      world.beams.push({
        x1: gun.x,
        y1: gun.y,
        x2: xEnd,
        y2: yLine,
        crit: false,
        life: 0.05,
      });
    }
  }
}

function handleShooting(dt) {
  const packets = state.lens.distribute(state.engine.produce(), world.guns.length);
  world.guns.forEach((gun, idx) => {
    if (gun.cooldown > 0) gun.cooldown -= dt;
    if (gun.cooldown > 0) return;

    const target = pickGunTarget(gun);
    if (!target) return;

    gun.cooldown = 1 / gun.fireRate;
    const packet = packets[idx];
    const crit = Math.random() < packet.critChance;
    const critMultiplier = crit ? packet.critMultiplier : 1;
    const combat = composeCombatStats(gun, packet);
    const damage =
      (gun.baseDamage + packet.energy + gun.flatDamage) *
      gun.multiplier *
      critMultiplier *
      combat.energyScale;

    if (gun.attackMode === "shotgun") {
      fireShotgun(gun, damage, combat);
      return;
    }

    applyHit(target, damage, combat);
    world.beams.push({
      x1: gun.x,
      y1: gun.y,
      x2: target.x,
      y2: target.y,
      crit,
      life: gun.attackMode === "sniper" ? 0.13 : 0.09,
    });
  });
}

function updateEnemies(dt) {
  for (const enemy of world.enemies) {
    enemy.update(dt);
    enemy.tickStatus(dt);

    for (const puddle of world.puddles) {
      if (puddle.ignited) continue;
      const inPuddle = Math.hypot(enemy.x - puddle.x, enemy.y - puddle.y) <= puddle.radius + enemy.radius * 0.2;
      if (inPuddle && enemy.burnStacks > 0) {
        puddle.ignited = true;
        puddle.tickTimer = 0;
        puddle.magicScale = Math.max(puddle.magicScale || 1, enemy.burnPower || 1);
      }
    }

    if (enemy.reachedWall && enemy.hp > 0) {
      const wallDmg = enemyWallDamage(enemy);
      state.wallHp -= wallDmg;
      enemy.lastHitKind = "wall";
      spawnExplosion(enemy.x, enemy.y, "wall", enemy.isBoss ? 1.5 : 1);
      enemy.hp = -1;
      logLine(`${enemy.isBoss ? "Босс" : "Монстр"} ударил стену: -${wallDmg.toFixed(1)} HP.`);
      if (state.wallHp <= 0) state.gameOver = true;
    }
  }
}

function clearDeadEnemies() {
  const deadBosses = [];
  let killsNow = 0;
  world.enemies = world.enemies.filter((enemy) => {
    if (enemy.hp <= 0 && !enemy.reachedWall) {
      spawnExplosion(enemy.x, enemy.y, enemy.lastHitKind === "magic" ? "magic" : "death", enemy.isBoss ? 1.35 : 1);
      killsNow += 1;
      if (enemy.isBoss) deadBosses.push(enemy);
      return false;
    }
    return enemy.alive();
  });

  if (killsNow === 0) return;
  state.kills += killsNow;
  if (deadBosses.length > 0) {
    state.enemyPowerScale *= ENEMY_POWER_PER_BOSS;
    state.pendingBossLensRewards += deadBosses.length;
    logLine("Босс уничтожен. Выдано редкое улучшение линзы.");
    logLine(`Сила монстров выросла на 15% (x${state.enemyPowerScale.toFixed(2)}).`);
  }
  maybeOfferQueuedRewards();
}

function updateWave(dt) {
  if (state.waveQueue > 0) {
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnEnemy();
      state.waveQueue -= 1;
      state.spawnTimer = state.isBossWave ? 99 : SPAWN_INTERVAL;
    }
    return;
  }

  if (world.enemies.length > 0) return;
  if (!state.waveRewardGranted) {
    state.pendingRegularCardRewards += 1;
    state.waveRewardGranted = true;
    logLine("Волна завершена. Выдана карточка усиления.");
    maybeOfferQueuedRewards();
  }
  if (state.pausedByCards) return;
  state.nextWaveDelay -= dt;
  if (state.nextWaveDelay > 0) return;
  state.wave += 1;
  state.nextWaveDelay = 2.4;
  beginWave(state.wave);
}

function updateVisualEffects(dt) {
  world.beams.forEach((b) => {
    b.life -= dt;
  });
  world.beams = world.beams.filter((b) => b.life > 0);

  world.particles.forEach((p) => {
    p.life -= dt;
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || -14) * dt;
    p.vy = (p.vy || -14) + dt * 28;
  });
  world.particles = world.particles.filter((p) => p.life > 0);

  world.explosions.forEach((e) => {
    e.life -= dt;
    e.radius += dt * 46;
  });
  world.explosions = world.explosions.filter((e) => e.life > 0);

  for (const puddle of world.puddles) {
    puddle.life -= dt;
    if (!puddle.ignited) continue;
    puddle.tickTimer += dt;
    if (puddle.tickTimer < 0.25) continue;
    puddle.tickTimer = 0;
    for (const enemy of world.enemies) {
      if (!enemy.alive()) continue;
      const inPuddle = Math.hypot(enemy.x - puddle.x, enemy.y - puddle.y) <= puddle.radius + enemy.radius * 0.25;
      if (!inPuddle) continue;
      applyMagicDamage(enemy, 4.4 * puddle.magicScale);
      enemy.lastHitKind = "magic";
      enemy.applyBurn(puddle.magicScale);
      pushParticle(enemy.x, enemy.y, { color: "#ffb278", size: 2.4, life: 0.22 });
    }
  }
  world.puddles = world.puddles.filter((p) => p.life > 0);
}

function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, 0, world.height);
  grad.addColorStop(0, "#0a1d30");
  grad.addColorStop(1, "#081526");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, world.width, world.height);
}

function drawZones() {
  const zones = [
    { x: 0, w: 150, color: "rgba(41,123,109,0.12)" },
    { x: 150, w: 140, color: "rgba(60,111,167,0.12)" },
    { x: 290, w: 160, color: "rgba(71,96,167,0.14)" },
    { x: 450, w: 70, color: "rgba(168,75,75,0.12)" },
    { x: 520, w: 440, color: "rgba(147,92,62,0.12)" },
  ];

  zones.forEach((zone) => {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, 0, zone.w, world.height);
  });
}

function drawEngineAndLens(now) {
  const e = world.enginePos;
  const l = world.lensPos;
  const pulse = 0.5 + Math.sin(now * 0.005) * 0.5;

  ctx.fillStyle = "#69e8bd";
  ctx.beginPath();
  ctx.arc(e.x, e.y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8fd8ff";
  ctx.beginPath();
  ctx.arc(l.x, l.y, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(111,241,195,${0.45 + pulse * 0.4})`;
  ctx.lineWidth = 4 + pulse * 2;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(l.x, l.y);
  ctx.stroke();

  world.guns.forEach((gun) => {
    ctx.strokeStyle = `rgba(130,212,255,${0.3 + pulse * 0.3})`;
    ctx.lineWidth = 2 + pulse * 1.3;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(gun.x, gun.y);
    ctx.stroke();
  });
}

function drawGuns() {
  world.guns.forEach((gun, idx) => {
    const selected = idx === state.selectedGunIndex;

    ctx.fillStyle = selected ? "#2f6b7c" : "#24495e";
    ctx.strokeStyle = selected ? "#97f3d3" : "#507390";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#b0dcff";
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(124,180,219,0.22)";
    ctx.lineWidth = 1;
    if (gun.attackMode === "sniper") {
      const xEnd = world.width;
      const halfEnd = gun.verticalBand / 2;
      const minHalf = 8;
      ctx.beginPath();
      ctx.moveTo(gun.x, gun.y - minHalf);
      ctx.lineTo(xEnd, gun.y - halfEnd);
      ctx.lineTo(xEnd, gun.y + halfEnd);
      ctx.lineTo(gun.x, gun.y + minHalf);
      ctx.closePath();
      ctx.stroke();
    } else if (gun.attackMode === "shotgun") {
      const h = gun.verticalBand;
      ctx.strokeRect(gun.x, gun.y - h / 2, gun.range, h);
      ctx.strokeStyle = "rgba(124,180,219,0.12)";
      ctx.beginPath();
      ctx.moveTo(gun.x, gun.y - h / 2);
      ctx.lineTo(gun.x + gun.range, gun.y);
      ctx.lineTo(gun.x, gun.y + h / 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(gun.x, gun.y, gun.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#d8ecff";
    ctx.font = "700 12px Space Grotesk";
    ctx.fillText(gun.name, gun.x - 28, gun.y - 30);

    for (let i = 0; i < MAX_LINKS_PER_GUN; i += 1) {
      const linkX = gun.x - 36 - i * 11;
      const link = gun.links[i];
      if (!link) {
        ctx.fillStyle = "rgba(88,105,121,0.3)";
      } else if (link.isBuffed()) {
        ctx.fillStyle = link.color;
      } else {
        ctx.fillStyle = "#678095";
      }
      ctx.beginPath();
      ctx.arc(linkX, gun.y, 5.6, 0, Math.PI * 2);
      ctx.fill();
      if (link?.isBuffed()) {
        const icon = linkBuffIcon(link);
        ctx.fillStyle = "#eaf6ff";
        ctx.font = "700 7px Space Grotesk";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(icon, linkX, gun.y + 0.5);
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  });
}

function drawWall() {
  const w = world.wall;
  const hpRatio = Math.max(0, Math.min(1, state.wallHp / WALL_HP_MAX));
  const innerHeight = Math.max(0, w.h * hpRatio - 4);
  ctx.fillStyle = "#243646";
  ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = "#72e4b2";
  ctx.fillRect(w.x + 2, w.y + w.h * (1 - hpRatio) + 2, w.w - 4, innerHeight);
  ctx.strokeStyle = "#97b8cd";
  ctx.lineWidth = 2;
  ctx.strokeRect(w.x - 1, w.y - 1, w.w + 2, w.h + 2);
}

function drawPuddles() {
  for (const puddle of world.puddles) {
    ctx.beginPath();
    ctx.arc(puddle.x, puddle.y, puddle.radius, 0, Math.PI * 2);
    if (puddle.ignited) {
      ctx.fillStyle = "rgba(255,129,72,0.28)";
      ctx.strokeStyle = "rgba(255,193,122,0.55)";
    } else {
      ctx.fillStyle = "rgba(68,74,89,0.32)";
      ctx.strokeStyle = "rgba(126,136,156,0.45)";
    }
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawEnemies() {
  world.enemies.forEach((enemy) => {
    ctx.fillStyle = enemy.isBoss
      ? "#a054f0"
      : enemy.freezeStacks > 0
        ? "#6ec8ff"
        : enemy.burnStacks > 0
          ? "#eb8a57"
          : "#ca6f6f";
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    const hpW = enemy.isBoss ? 54 : 28;
    const hpPct = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = "rgba(34,54,70,0.95)";
    ctx.fillRect(enemy.x - hpW / 2, enemy.y - enemy.radius - 10, hpW, 4);
    ctx.fillStyle = "#85efba";
    ctx.fillRect(enemy.x - hpW / 2, enemy.y - enemy.radius - 10, hpW * hpPct, 4);

    if (enemy.isBoss) {
      ctx.fillStyle = "#f0d9ff";
      ctx.font = "700 10px Space Grotesk";
      ctx.fillText("BOSS", enemy.x - 14, enemy.y + 3);
    }
  });
}

function drawBeamsAndParticles() {
  world.beams.forEach((beam) => {
    ctx.strokeStyle = beam.color || (beam.crit ? "rgba(255,220,120,0.92)" : "rgba(128,220,255,0.88)");
    ctx.lineWidth = beam.crit ? 3.1 : 2.2;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
  });

  world.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 0.25);
    ctx.fillStyle = p.color || "#ffc982";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawExplosions() {
  for (const e of world.explosions) {
    const t = e.life / e.maxLife;
    const color =
      e.kind === "wall"
        ? "255,168,116"
        : e.kind === "magic"
          ? "189,214,255"
          : "255,206,140";
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = `rgba(${color},0.22)`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${color},0.65)`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawGameOver() {
  if (!state.gameOver) return;
  ctx.fillStyle = "rgba(4,6,10,0.62)";
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.fillStyle = "#fff2f2";
  ctx.font = "700 54px Space Grotesk";
  ctx.fillText("СТЕНА РАЗРУШЕНА", 228, 270);
}

const threeView = {
  ready: false,
  scene: null,
  camera: null,
  renderer: null,
  engineMesh: null,
  lensMesh: null,
  wallMesh: null,
  gunMeshes: [],
  enemyMeshes: new Map(),
  staticBeamGroup: null,
  dynamicBeamGroup: null,
  engineLensLine: null,
  lensGunLines: [],
  engineLensBeam: null,
  lensGunBeams: [],
  orbit: {
    azimuth: 0,
    elevation: 0.58,
    radius: 980,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  },
};

function createBeamRod(THREE, color, radius = 1.6, opacity = 0.82) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 10),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    })
  );
  return mesh;
}

function placeBeamRod(mesh, p1, p2) {
  const dir = p2.clone().sub(p1);
  const len = Math.max(0.001, dir.length());
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(new window.THREE.Vector3(0, 1, 0), dir.normalize());
}

function updateThreeCameraFromOrbit() {
  if (!threeView.ready) return;
  const o = threeView.orbit;
  const planar = o.radius * Math.cos(o.elevation);
  const z = o.radius * Math.sin(o.elevation);
  const x = o.targetX + planar * Math.cos(o.azimuth);
  const y = o.targetY + planar * Math.sin(o.azimuth);
  threeView.camera.up.set(0, 0, 1);
  threeView.camera.position.set(x, y, z);
  threeView.camera.lookAt(o.targetX, o.targetY, o.targetZ);
}

function worldToThree(x, y, z = 0) {
  return new window.THREE.Vector3(x - world.width / 2, world.height / 2 - y, z);
}

function resizeThreeView() {
  if (!threeView.ready || !ui.threeLayer) return;
  const rect = ui.threeLayer.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  threeView.renderer.setPixelRatio(Math.max(1, Math.min(3, window.devicePixelRatio || 1)));
  threeView.renderer.setSize(w, h, false);
  threeView.camera.aspect = w / h;
  threeView.camera.updateProjectionMatrix();
}

function initThreeView() {
  if (threeView.ready || !ui.threeLayer || !window.THREE) return;
  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071322);

  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 1, 5000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";
  ui.threeLayer.append(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x8cc0ff, 0.7);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0x9bd7ff, 0.9);
  key.position.set(-220, 280, 420);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x6ff0c0, 0.55);
  rim.position.set(300, -200, 280);
  scene.add(rim);

  const fieldGeo = new THREE.PlaneGeometry(world.width, world.height);
  const fieldMat = new THREE.MeshStandardMaterial({ color: 0x0b1f34, metalness: 0.05, roughness: 0.92 });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.position.z = -30;
  scene.add(field);

  const engine = new THREE.Mesh(
    new THREE.SphereGeometry(18, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x66e6bc, emissive: 0x1f604e, emissiveIntensity: 0.55 })
  );
  scene.add(engine);

  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(14, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x255067, emissiveIntensity: 0.4 })
  );
  scene.add(lens);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(world.wall.w, world.wall.h, 18),
    new THREE.MeshStandardMaterial({ color: 0x7de6bb, emissive: 0x204d3d, emissiveIntensity: 0.28 })
  );
  scene.add(wall);

  const staticBeamGroup = new THREE.Group();
  scene.add(staticBeamGroup);
  const dynamicBeamGroup = new THREE.Group();
  scene.add(dynamicBeamGroup);

  const buildLine = (color, opacity, width = 2.4) =>
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false,
        linewidth: width,
      })
    );

  const engineLensLine = buildLine(0x76f0c6, 0.9, 2.8);
  staticBeamGroup.add(engineLensLine);
  const engineLensBeam = createBeamRod(THREE, 0x79f2cb, 1.8, 0.55);
  staticBeamGroup.add(engineLensBeam);

  const lensGunLines = world.guns.map(() => {
    const line = buildLine(0x84d4ff, 0.48, 2.1);
    staticBeamGroup.add(line);
    return line;
  });
  const lensGunBeams = world.guns.map(() => {
    const rod = createBeamRod(THREE, 0x8cd8ff, 1.25, 0.32);
    staticBeamGroup.add(rod);
    return rod;
  });

  const gunMeshes = world.guns.map(() => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(15.5, 18.5, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x30556f, metalness: 0.35, roughness: 0.36 })
    );
    base.rotation.x = Math.PI / 2;
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 10.2, 16, 20),
      new THREE.MeshStandardMaterial({ color: 0x4e88ab, emissive: 0x1f4f68, emissiveIntensity: 0.45 })
    );
    body.rotation.x = Math.PI / 2;
    body.position.z = 6;
    const barrel = new THREE.Mesh(
      new THREE.BoxGeometry(18, 5, 5),
      new THREE.MeshStandardMaterial({ color: 0xa0d2ee, metalness: 0.52, roughness: 0.25 })
    );
    barrel.position.set(11, 0, 6);
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(4.2, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xc9ecff, emissive: 0x69b7e2, emissiveIntensity: 0.9 })
    );
    core.position.z = 8;
    group.add(base);
    group.add(body);
    group.add(barrel);
    group.add(core);
    group.userData.core = core;
    scene.add(group);
    return group;
  });

  threeView.scene = scene;
  threeView.camera = camera;
  threeView.renderer = renderer;
  threeView.engineMesh = engine;
  threeView.lensMesh = lens;
  threeView.wallMesh = wall;
  threeView.gunMeshes = gunMeshes;
  threeView.staticBeamGroup = staticBeamGroup;
  threeView.dynamicBeamGroup = dynamicBeamGroup;
  threeView.engineLensLine = engineLensLine;
  threeView.lensGunLines = lensGunLines;
  threeView.engineLensBeam = engineLensBeam;
  threeView.lensGunBeams = lensGunBeams;
  threeView.ready = true;
  threeView.orbit.azimuth = -Math.PI / 2;
  threeView.orbit.elevation = 0.58;
  threeView.orbit.radius = 980;
  threeView.orbit.targetX = 0;
  threeView.orbit.targetY = 0;
  threeView.orbit.targetZ = 0;
  updateThreeCameraFromOrbit();
  resizeThreeView();
}

function ensureEnemyMesh(enemy) {
  if (!threeView.ready) return null;
  const existing = threeView.enemyMeshes.get(enemy.uid);
  if (existing) return existing;
  const THREE = window.THREE;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(8, enemy.radius), 20, 20),
    new THREE.MeshStandardMaterial({ color: enemy.isBoss ? 0xa054f0 : 0xca6f6f, emissive: 0x2c2030, emissiveIntensity: 0.35 })
  );
  threeView.scene.add(mesh);
  threeView.enemyMeshes.set(enemy.uid, mesh);
  return mesh;
}

function syncThreeWorld(now) {
  if (!threeView.ready) return;
  const THREE = window.THREE;

  const ePos = worldToThree(world.enginePos.x, world.enginePos.y, 8);
  threeView.engineMesh.position.copy(ePos);
  threeView.engineMesh.scale.setScalar(1 + Math.sin(now * 0.004) * 0.04);

  const lPos = worldToThree(world.lensPos.x, world.lensPos.y, 8);
  threeView.lensMesh.position.copy(lPos);
  threeView.lensMesh.scale.setScalar(1 + Math.sin(now * 0.006) * 0.03);

  if (threeView.engineLensLine) {
    const points = [ePos.clone(), lPos.clone()];
    threeView.engineLensLine.geometry.setFromPoints(points);
  }
  if (threeView.engineLensBeam) placeBeamRod(threeView.engineLensBeam, ePos, lPos);

  const wallPos = worldToThree(world.wall.x + world.wall.w / 2, world.wall.y + world.wall.h / 2, 4);
  threeView.wallMesh.position.copy(wallPos);
  const wallHpScale = Math.max(0.1, state.wallHp / WALL_HP_MAX);
  threeView.wallMesh.scale.set(1, wallHpScale, 1);

  world.guns.forEach((gun, idx) => {
    const mesh = threeView.gunMeshes[idx];
    if (!mesh) return;
    const p = worldToThree(gun.x, gun.y, 10);
    mesh.position.copy(p);
    const line = threeView.lensGunLines[idx];
    if (line) line.geometry.setFromPoints([lPos.clone(), p.clone()]);
    const rod = threeView.lensGunBeams[idx];
    if (rod) placeBeamRod(rod, lPos, p);
    const pulse = idx === state.selectedGunIndex ? 1.2 : 1;
    mesh.scale.set(pulse, pulse, pulse);
    const target = pickGunTarget(gun);
    const targetAngle = target ? -Math.atan2(target.y - gun.y, target.x - gun.x) : 0;
    const currentAngle = mesh.rotation.z || 0;
    mesh.rotation.z = currentAngle + (targetAngle - currentAngle) * 0.22;
    if (mesh.userData.core?.material) {
      mesh.userData.core.material.emissiveIntensity = idx === state.selectedGunIndex ? 1.35 : 0.9;
    }
  });

  const seen = new Set();
  for (const enemy of world.enemies) {
    if (!enemy.alive()) continue;
    const mesh = ensureEnemyMesh(enemy);
    if (!mesh) continue;
    seen.add(enemy.uid);
    const p = worldToThree(enemy.x, enemy.y, 9);
    mesh.position.copy(p);
    const color = enemy.isBoss ? 0xa054f0 : enemy.freezeStacks > 0 ? 0x6ec8ff : enemy.burnStacks > 0 ? 0xeb8a57 : 0xca6f6f;
    mesh.material.color.setHex(color);
    const emissive = enemy.freezeStacks > 0 ? 0x174b79 : enemy.burnStacks > 0 ? 0x5a2a15 : 0x322023;
    mesh.material.emissive.setHex(emissive);
  }

  for (const [uid, mesh] of threeView.enemyMeshes.entries()) {
    if (seen.has(uid)) continue;
    threeView.scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
    threeView.enemyMeshes.delete(uid);
  }

  const bgPulse = 0.08 + Math.sin(now * 0.0015) * 0.02;
  threeView.scene.fog = new THREE.Fog(0x071322, 700, 1300 + bgPulse * 1000);

  while (threeView.dynamicBeamGroup.children.length > 0) {
    const line = threeView.dynamicBeamGroup.children.pop();
    threeView.dynamicBeamGroup.remove(line);
    if (line.geometry) line.geometry.dispose();
    if (line.material) line.material.dispose();
  }
  for (const beam of world.beams) {
    const p1 = worldToThree(beam.x1, beam.y1, 24);
    const p2 = worldToThree(beam.x2, beam.y2, 24);
    const lineColor = beam.color?.includes("255,238,80") ? 0xffee50 : beam.crit ? 0xffdc78 : 0x8ce0ff;
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([p1, p2]),
      new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: Math.max(0.35, Math.min(1, (beam.life || 0.08) / 0.13)),
        depthWrite: false,
        depthTest: false,
      })
    );
    threeView.dynamicBeamGroup.add(line);

    const rod = createBeamRod(THREE, lineColor, beam.crit ? 2.25 : 1.7, 0.72);
    placeBeamRod(rod, p1, p2);
    threeView.dynamicBeamGroup.add(rod);

    const flareMat = new THREE.MeshBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      depthTest: false,
    });
    const flare1 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 12), flareMat.clone());
    flare1.position.copy(p1);
    const flare2 = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 12), flareMat);
    flare2.position.copy(p2);
    threeView.dynamicBeamGroup.add(flare1);
    threeView.dynamicBeamGroup.add(flare2);
  }
}

function renderThreeMode(now) {
  if (!state.threeMode) return;
  if (!threeView.ready) initThreeView();
  if (!threeView.ready) return;
  syncThreeWorld(now);
  threeView.renderer.render(threeView.scene, threeView.camera);
}

function setThreeMode(enabled) {
  state.threeMode = Boolean(enabled);
  if (ui.board) ui.board.classList.toggle("three-active", state.threeMode);
  if (state.threeMode) initThreeView();
  if (!state.threeMode) state.cameraOrbitEnabled = false;
  if (ui.threeLayer) ui.threeLayer.style.pointerEvents = state.threeMode && state.cameraOrbitEnabled ? "auto" : "none";
  resizeThreeView();
  updateHud();
}

function setCameraOrbitEnabled(enabled) {
  state.cameraOrbitEnabled = Boolean(enabled) && state.threeMode;
  if (ui.threeLayer) ui.threeLayer.style.pointerEvents = state.cameraOrbitEnabled ? "auto" : "none";
  if (!state.cameraOrbitEnabled) {
    threeView.orbit.dragging = false;
    threeView.orbit.pointerId = null;
  }
  updateHud();
}

function onThreePointerDown(event) {
  if (!state.threeMode || !state.cameraOrbitEnabled || !threeView.ready) return;
  event.preventDefault();
  threeView.orbit.dragging = true;
  threeView.orbit.pointerId = event.pointerId;
  threeView.orbit.lastX = event.clientX;
  threeView.orbit.lastY = event.clientY;
  ui.threeLayer.setPointerCapture?.(event.pointerId);
}

function onThreePointerMove(event) {
  const o = threeView.orbit;
  if (!state.threeMode || !state.cameraOrbitEnabled || !o.dragging) return;
  if (o.pointerId !== null && event.pointerId !== o.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - o.lastX;
  const dy = event.clientY - o.lastY;
  o.lastX = event.clientX;
  o.lastY = event.clientY;
  o.azimuth -= dx * 0.008;
  o.elevation = Math.max(0.25, Math.min(1.1, o.elevation + dy * 0.0048));
  updateThreeCameraFromOrbit();
}

function onThreePointerUp(event) {
  const o = threeView.orbit;
  if (o.pointerId !== null && event.pointerId !== o.pointerId) return;
  o.dragging = false;
  o.pointerId = null;
  ui.threeLayer.releasePointerCapture?.(event.pointerId);
}

function onThreeWheel(event) {
  if (!state.threeMode || !state.cameraOrbitEnabled || !threeView.ready) return;
  event.preventDefault();
  const o = threeView.orbit;
  const next = o.radius * (1 + event.deltaY * 0.0012);
  o.radius = Math.max(560, Math.min(1500, next));
  updateThreeCameraFromOrbit();
}

function render(now) {
  drawBackground();
  drawZones();
  drawEngineAndLens(now);
  drawWall();
  drawBeamsAndParticles();
  drawExplosions();
  drawPuddles();
  drawEnemies();
  drawGuns();
  drawGameOver();
}

function setupCanvasForDpr() {
  currentDpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.width = Math.round(LOGICAL_WIDTH * currentDpr);
  canvas.height = Math.round(LOGICAL_HEIGHT * currentDpr);
  ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
  resizeThreeView();
}

function update(dt) {
  if (state.pausedByCards || state.userPaused || state.gameOver) return;
  handleShooting(dt);
  updateEnemies(dt);
  clearDeadEnemies();
  updateWave(dt);
  updateVisualEffects(dt);
}

function frame(now) {
  const dt = Math.min((now - state.lastTime) / 1000, 0.05);
  state.lastTime = now;
  update(dt);
  render(now);
  renderThreeMode(now);
  updateHud();
  requestAnimationFrame(frame);
}

function canvasToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = LOGICAL_WIDTH / rect.width;
  const sy = LOGICAL_HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy,
  };
}

function pickGunAt(x, y) {
  state.selectedGunIndex = -1;
  world.guns.forEach((gun, idx) => {
    if (Math.hypot(gun.x - x, gun.y - y) <= 24) state.selectedGunIndex = idx;
  });
}

function onCanvasMouseDown(event) {
  const { x, y } = canvasToWorld(event);
  pickGunAt(x, y);
  state.draggingGunIndex = state.selectedGunIndex;
  updateHud();
}

function onCanvasMouseMove(event) {
  if (state.draggingGunIndex < 0) return;
  const { y } = canvasToWorld(event);
  const gun = world.guns[state.draggingGunIndex];
  const minY = world.wall.y + 24;
  const maxY = world.wall.y + world.wall.h - 24;
  gun.x = world.wall.x + world.wall.w / 2;
  gun.y = Math.max(minY, Math.min(maxY, y));
}

function onCanvasMouseUp() {
  state.draggingGunIndex = -1;
}

function onCanvasClick(event) {
  const { x, y } = canvasToWorld(event);
  pickGunAt(x, y);
  updateHud();
}

function getTouchPoint(touchEvent) {
  const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
  return { clientX: touch.clientX, clientY: touch.clientY };
}

function onCanvasTouchStart(event) {
  event.preventDefault();
  const { x, y } = canvasToWorld(getTouchPoint(event));
  pickGunAt(x, y);
  state.draggingGunIndex = state.selectedGunIndex;
  updateHud();
}

function onCanvasTouchMove(event) {
  event.preventDefault();
  if (state.draggingGunIndex < 0) return;
  const { y } = canvasToWorld(getTouchPoint(event));
  const gun = world.guns[state.draggingGunIndex];
  const minY = world.wall.y + 24;
  const maxY = world.wall.y + world.wall.h - 24;
  gun.x = world.wall.x + world.wall.w / 2;
  gun.y = Math.max(minY, Math.min(maxY, y));
}

function onCanvasTouchEnd(event) {
  event.preventDefault();
  state.draggingGunIndex = -1;
}

function init() {
  setupCanvasForDpr();
  window.addEventListener("resize", setupCanvasForDpr);
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onCanvasMouseMove);
  canvas.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("mouseleave", onCanvasMouseUp);
  window.addEventListener("mouseup", onCanvasMouseUp);
  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
  canvas.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onCanvasTouchEnd, { passive: false });
  ui.restartBtn.addEventListener("click", () => {
    window.location.reload();
  });
  if (ui.cardsInfoBtn) ui.cardsInfoBtn.addEventListener("click", openCardsInfoModal);
  if (ui.cardsInfoCloseBtn) ui.cardsInfoCloseBtn.addEventListener("click", closeCardsInfoModal);
  if (ui.cardsInfoModal) {
    ui.cardsInfoModal.addEventListener("click", (event) => {
      if (event.target === ui.cardsInfoModal) closeCardsInfoModal();
    });
  }
  if (ui.pauseBtn) {
    ui.pauseBtn.addEventListener("click", () => {
      if (state.gameOver) return;
      state.userPaused = !state.userPaused;
      updateHud();
    });
  }
  if (ui.threeModeBtn) {
    ui.threeModeBtn.addEventListener("click", () => {
      if (!window.THREE) {
        logLine("3D режим недоступен: three.js не загружен.");
        return;
      }
      setThreeMode(!state.threeMode);
    });
  }
  if (ui.cameraOrbitBtn) {
    ui.cameraOrbitBtn.addEventListener("click", () => {
      if (!state.threeMode) return;
      setCameraOrbitEnabled(!state.cameraOrbitEnabled);
    });
  }
  if (ui.threeLayer) {
    ui.threeLayer.addEventListener("pointerdown", onThreePointerDown);
    ui.threeLayer.addEventListener("pointermove", onThreePointerMove);
    ui.threeLayer.addEventListener("pointerup", onThreePointerUp);
    ui.threeLayer.addEventListener("pointercancel", onThreePointerUp);
    ui.threeLayer.addEventListener("wheel", onThreeWheel, { passive: false });
  }
  beginWave(1);
  logLine("Старт TD: монстры двигаются справа налево к стене.");
  requestAnimationFrame((t) => {
    state.lastTime = t;
    frame(t);
  });
}

init();
