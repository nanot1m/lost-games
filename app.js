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
      let packet = { energy: perGun, burnChance: 0, critChance: 0, critMultiplier: 1.5 };
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
      this.range = 360;
      this.verticalBand = 34;
      this.shotgunPellets = 0;
      this.shotgunSpread = 0;
      this.baseFireRate = 2.3;
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

    this.maxHp = baseHp * powerScale * durability;
    this.hp = this.maxHp;
    this.radius = baseRadius * (0.84 + 0.52 * Math.sqrt(durability));
    const durabilitySpeedPenalty = Math.max(0.42, Math.min(1.45, 1 / Math.pow(durability, 0.72)));
    const wavePowerBoost = Math.min(1.6, 1 + (powerScale - 1) * 0.2);
    this.speed = baseSpeed * wavePowerBoost * durabilitySpeedPenalty;
    this.burnStacks = 0;
    this.burnTimer = 0;
    this.burnPower = 1;
    this.freezeStacks = 0;
    this.freezeTimer = 0;
    this.freezePower = 1;
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
const WAVE_SIZE = (wave) => 6 + Math.floor(wave * 1.15);
const ENEMY_POWER_PER_BOSS = 1.15;
const WALL_DAMAGE_NORMAL_BASE = 0.75;
const WALL_DAMAGE_BOSS_BASE = 4.2;
const WALL_HP_MAX = 30;

const LINK_CARDS = [
  {
    id: "gun_flat",
    target: "link",
    name: "Усиленный ствол",
    description: "+10 урона, но -10% скорости атаки",
    color: "#ffb86b",
    effect: { flatDamage: 10, fireRateMultiplier: 0.9 },
  },
  {
    id: "gun_mult",
    target: "link",
    name: "Фокус-катушка",
    description: "x1.35 урона, но -18% скорости атаки",
    color: "#ffd86e",
    effect: { damageMultiplier: 1.35, fireRateMultiplier: 0.82 },
  },
  {
    id: "gun_burn",
    target: "link",
    name: "Термоядро",
    description: "+35% шанс поджога, но -4 урона",
    color: "#ff7f6e",
    effect: { burnChance: 0.35, flatDamage: -4 },
  },
  {
    id: "gun_lightning",
    target: "link",
    name: "Цепная молния",
    description: "22% шанс молнии (3 скачка), но -12% урона",
    color: "#d8f0ff",
    effect: { lightningChance: 0.22, lightningChains: 3, lightningRadius: 130, damageMultiplier: 0.88 },
  },
  {
    id: "gun_ice",
    target: "link",
    name: "Ледяной контур",
    description: "28% шанс льда (замедление+дот), но -8% скорости атаки",
    color: "#9bd5ff",
    effect: { iceChance: 0.28, fireRateMultiplier: 0.92 },
  },
  {
    id: "gun_oil",
    target: "link",
    name: "Масляный распыл",
    description: "18% шанс создать лужу, но -6 урона",
    color: "#7f8a9f",
    effect: { oilChance: 0.18, flatDamage: -6 },
  },
  {
    id: "gun_magic_amp",
    target: "link",
    name: "Магический фокус",
    description: "+40% маг. урону (огонь/лёд/молнии), но -14% физ. урона",
    color: "#d6a7ff",
    effect: { magicDamageMultiplier: 1.4, damageMultiplier: 0.86 },
  },
  {
    id: "gun_aspd_1",
    target: "link",
    name: "Разгон затвора",
    description: "+25% скорости атаки, но -12% урона",
    color: "#80e6ff",
    effect: { fireRateMultiplier: 1.25, damageMultiplier: 0.88 },
  },
  {
    id: "gun_aspd_2",
    target: "link",
    name: "Турбо-автоматика",
    description: "+45% скорости атаки, но -20% урона и -20 дальности",
    color: "#4bc7ff",
    effect: { fireRateMultiplier: 1.45, damageMultiplier: 0.8, rangeBonus: -20 },
  },
  {
    id: "gun_sniper",
    target: "link",
    name: "Снайперский ствол",
    description: "Профиль: узкая дальняя горизонталь",
    color: "#c9a6ff",
    effect: { attackProfile: "sniper" },
  },
  {
    id: "gun_shotgun",
    target: "link",
    name: "Дробовик",
    description: "Профиль: широкая дробь по вертикали",
    color: "#8ad4ff",
    effect: { attackProfile: "shotgun" },
  },
  {
    id: "link_x2",
    target: "link",
    name: "Резонатор",
    description: "x2 урона, но -30% скорости атаки и -15% шанса ожога",
    color: "#7dff9d",
    effect: { multiplier: 2, fireRateMultiplier: 0.7, burnChance: -0.15 },
  },
  {
    id: "link_x15",
    target: "link",
    name: "Стабилизатор",
    description: "x1.5 урона, но -15% скорости атаки",
    color: "#54f0b3",
    effect: { multiplier: 1.5, fireRateMultiplier: 0.85 },
  },
];

const LENS_CARDS = [
  {
    id: "lens_burn",
    target: "lens",
    name: "Линза жара",
    description: "Луч даёт +20% шанса ожога всем пушкам",
    applyLens: (lens) => lens.addBuff("Жар", (p) => ({ ...p, burnChance: p.burnChance + 0.2 })),
  },
  {
    id: "lens_crit",
    target: "lens",
    name: "Линза точности",
    description: "Луч даёт +16% крита и x1.85 крит-урон",
    applyLens: (lens) =>
      lens.addBuff("Точность", (p) => ({ ...p, critChance: p.critChance + 0.16, critMultiplier: 1.85 })),
  },
  {
    id: "lens_flux",
    target: "lens",
    name: "Линза потока",
    description: "Луч даёт +20% энергии каждому выстрелу",
    applyLens: (lens) => lens.addBuff("Поток", (p) => ({ ...p, energy: p.energy * 1.2 })),
  },
];

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  wave: document.getElementById("waveStat"),
  kills: document.getElementById("killsStat"),
  baseHp: document.getElementById("baseHpStat"),
  nextCard: document.getElementById("nextCardStat"),
  lensBuffs: document.getElementById("lensBuffs"),
  selectedGunInfo: document.getElementById("selectedGunInfo"),
  log: document.getElementById("log"),
  modal: document.getElementById("cardModal"),
  cardHint: document.getElementById("cardHint"),
  cardChoices: document.getElementById("cardChoices"),
  targetChoices: document.getElementById("targetChoices"),
  restartBtn: document.getElementById("restartBtn"),
};

const world = {
  width: canvas.width,
  height: canvas.height,
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
    const idx = Math.floor(Math.random() * src.length);
    selected.push(src.splice(idx, 1)[0]);
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

function updateHud() {
  ui.wave.textContent = String(state.wave);
  ui.kills.textContent = String(state.kills);
  ui.baseHp.textContent = String(Math.max(0, state.wallHp).toFixed(1));
  ui.nextCard.textContent = state.pendingRegularCardRewards > 0 ? "0" : "1";
  ui.restartBtn.classList.toggle("hidden", !state.gameOver);

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
      `<div>Ожог: ${(gun.burnChance * 100).toFixed(0)}%</div>`,
      `<div>Лёд: ${(gun.iceChance * 100).toFixed(0)}% | Лужа: ${(gun.oilChance * 100).toFixed(0)}%</div>`,
      `<div>Молния: ${(gun.lightningChance * 100).toFixed(0)}% (${gun.lightningChains} скач.)</div>`,
      `<div>Маг. множитель: x${gun.magicDamageMultiplier.toFixed(2)}</div>`,
      `<div>Звенья: ${buffedLinks}/${totalLinks} (макс ${MAX_LINKS_PER_GUN})</div>`,
      `<div>Апгрейды: ${gunUpgradesText(gun)}</div>`,
    ].join("");
  }
}

function openCardModal(cards, hint, onPick) {
  state.pausedByCards = true;
  ui.modal.classList.remove("hidden");
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
      `<span class="game-card-type">${card.target.toUpperCase()}</span>`,
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
  guns.forEach((gun, idx) => {
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
      `🔥 ${(gun.burnChance * 100).toFixed(0)}% | ❄ ${(gun.iceChance * 100).toFixed(0)}% | 🛢 ${(gun.oilChance * 100).toFixed(0)}%<br/>`,
      `⚡ ${(gun.lightningChance * 100).toFixed(0)}% (${gun.lightningChains}) | ✨ x${gun.magicDamageMultiplier.toFixed(2)}<br/>`,
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
  const offer = randomPick(pool, 3);
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
    durabilityScale = 1.25 + Math.random() * 0.45;
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
  world.enemies.push(enemy);
}

function enemyWallDamage(enemy) {
  const power = Math.pow(state.enemyPowerScale, 0.9);
  if (enemy.isBoss) return WALL_DAMAGE_BOSS_BASE * power;
  return WALL_DAMAGE_NORMAL_BASE * power;
}

function enemyInGunZone(gun, enemy) {
  const dx = enemy.x - gun.x;
  const dy = Math.abs(enemy.y - gun.y);
  if (dx < 0) return false;

  if (gun.attackMode === "sniper") {
    return dx <= gun.range && dy <= gun.verticalBand / 2;
  }
  if (gun.attackMode === "shotgun") {
    return dx <= gun.range && dy <= gun.verticalBand / 2;
  }
  return Math.hypot(dx, enemy.y - gun.y) <= gun.range;
}

function applyMagicDamage(enemy, amount) {
  enemy.hp -= amount;
  world.particles.push({ x: enemy.x, y: enemy.y, life: 0.22, size: 2 + Math.random() * 2.1 });
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

function triggerLightning(gun, startEnemy) {
  if (gun.lightningChance <= 0 || gun.lightningChains <= 0 || gun.lightningRadius <= 0) return;
  if (Math.random() >= gun.lightningChance) return;

  const magicMult = gun.magicDamageMultiplier;
  let current = startEnemy;
  const visited = new Set([startEnemy]);
  applyMagicDamage(startEnemy, 8 * magicMult);

  for (let jump = 0; jump < gun.lightningChains; jump += 1) {
    let next = null;
    let bestDist = Infinity;
    for (const enemy of world.enemies) {
      if (!enemy.alive() || visited.has(enemy)) continue;
      const dist = Math.hypot(enemy.x - current.x, enemy.y - current.y);
      if (dist <= gun.lightningRadius && dist < bestDist) {
        bestDist = dist;
        next = enemy;
      }
    }
    if (!next) break;
    visited.add(next);
    applyMagicDamage(next, (7 - jump * 1.2) * magicMult);
    world.beams.push({
      x1: current.x,
      y1: current.y,
      x2: next.x,
      y2: next.y,
      crit: false,
      life: 0.12,
      color: "rgba(195,238,255,0.95)",
    });
    current = next;
  }
}

function applyHit(gun, enemy, damage, burnChance) {
  enemy.hp -= damage;
  if (Math.random() < burnChance) enemy.applyBurn(gun.magicDamageMultiplier);
  if (Math.random() < gun.iceChance) enemy.applyFreeze(gun.magicDamageMultiplier);
  if (Math.random() < gun.oilChance) createOilPuddle(enemy.x, enemy.y, gun.magicDamageMultiplier);
  triggerLightning(gun, enemy);
  world.particles.push({ x: enemy.x, y: enemy.y, life: 0.25, size: 2 + Math.random() * 2.5 });
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

function fireShotgun(gun, baseDamage, burnChance) {
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
      applyHit(gun, hit, baseDamage * 0.42, burnChance);
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
    const damage =
      (gun.baseDamage + packet.energy + gun.flatDamage) *
      gun.multiplier *
      critMultiplier;
    const totalBurn = gun.burnChance + packet.burnChance;

    if (gun.attackMode === "shotgun") {
      fireShotgun(gun, damage, totalBurn);
      return;
    }

    applyHit(gun, target, damage, totalBurn);
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
    p.y -= dt * 14;
  });
  world.particles = world.particles.filter((p) => p.life > 0);

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
      enemy.applyBurn(puddle.magicScale);
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
      const h = gun.verticalBand;
      ctx.strokeRect(gun.x, gun.y - h / 2, gun.range, h);
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
    }
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
        ? "#84bbf0"
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
    ctx.fillStyle = "#ffc982";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function drawGameOver() {
  if (!state.gameOver) return;
  ctx.fillStyle = "rgba(4,6,10,0.62)";
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.fillStyle = "#fff2f2";
  ctx.font = "700 54px Space Grotesk";
  ctx.fillText("СТЕНА РАЗРУШЕНА", 228, 270);
}

function render(now) {
  drawBackground();
  drawZones();
  drawEngineAndLens(now);
  drawWall();
  drawBeamsAndParticles();
  drawPuddles();
  drawEnemies();
  drawGuns();
  drawGameOver();
}

function update(dt) {
  if (state.pausedByCards || state.gameOver) return;
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
  updateHud();
  requestAnimationFrame(frame);
}

function canvasToWorld(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
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
  beginWave(1);
  logLine("Старт TD: монстры двигаются справа налево к стене.");
  requestAnimationFrame((t) => {
    state.lastTime = t;
    frame(t);
  });
}

init();
