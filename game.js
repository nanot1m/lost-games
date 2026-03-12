#!/usr/bin/env node

const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

class Engine {
  constructor(baseEnergyPerTick) {
    this.baseEnergyPerTick = baseEnergyPerTick;
  }

  produce() {
    return this.baseEnergyPerTick;
  }
}

class Lens {
  constructor(name, buffs = []) {
    this.name = name;
    this.buffs = buffs;
  }

  split(totalEnergy, gunCount) {
    const perGun = totalEnergy / gunCount;
    return Array.from({ length: gunCount }, () => {
      let packet = { energy: perGun, burnChance: 0, critChance: 0, critMultiplier: 1.5 };
      for (const buff of this.buffs) {
        packet = buff(packet);
      }
      return packet;
    });
  }

  addBuff(buffFn) {
    this.buffs.push(buffFn);
  }
}

class Link {
  constructor() {
    this.multiplier = 1;
    this.buffName = "Нет";
  }

  applyCard(card) {
    if (this.buffName !== "Нет") return false;
    this.multiplier = card.effect.multiplier ?? 1;
    this.buffName = card.name;
    return true;
  }
}

class Gun {
  constructor(name, baseDamage) {
    this.name = name;
    this.baseDamage = baseDamage;
    this.buffName = "Нет";
    this.burnChance = 0;
    this.flatDamageBonus = 0;
    this.damageMultiplier = 1;
    this.hasBuff = false;
    this.link = null;
  }

  unlockLink() {
    if (!this.link) this.link = new Link();
  }

  applyCard(card) {
    if (this.hasBuff) return false;
    this.flatDamageBonus += card.effect.flatDamage ?? 0;
    this.damageMultiplier *= card.effect.damageMultiplier ?? 1;
    this.burnChance += card.effect.burnChance ?? 0;
    this.buffName = card.name;
    this.hasBuff = true;
    return true;
  }

  shoot(packet, monster) {
    const critRoll = Math.random();
    const isCrit = critRoll < packet.critChance;
    const critMultiplier = isCrit ? packet.critMultiplier : 1;
    const linkMultiplier = this.link ? this.link.multiplier : 1;
    const damage =
      (this.baseDamage + packet.energy + this.flatDamageBonus) *
      this.damageMultiplier *
      critMultiplier *
      linkMultiplier;

    monster.hp -= damage;
    const burnRoll = Math.random();
    const totalBurnChance = this.burnChance + packet.burnChance;
    if (burnRoll < totalBurnChance) {
      monster.burnStacks += 1;
    }
    return { damage, isCrit, appliedBurn: burnRoll < totalBurnChance };
  }
}

class Monster {
  constructor(level) {
    this.level = level;
    this.maxHp = 40 + level * 12;
    this.hp = this.maxHp;
    this.burnStacks = 0;
  }

  burnTick() {
    if (this.burnStacks <= 0) return 0;
    const burnDamage = this.burnStacks * 4;
    this.hp -= burnDamage;
    return burnDamage;
  }

  get alive() {
    return this.hp > 0;
  }
}

const cards = [
  {
    id: "gun-flat",
    name: "Усиленный ствол",
    target: "gun",
    effect: { flatDamage: 9 },
    description: "+9 к урону пушки",
  },
  {
    id: "gun-mult",
    name: "Фокус-катушка",
    target: "gun",
    effect: { damageMultiplier: 1.35 },
    description: "x1.35 урона пушки",
  },
  {
    id: "gun-burn",
    name: "Термоядро",
    target: "gun",
    effect: { burnChance: 0.35 },
    description: "+35% шанс наложить ожог",
  },
  {
    id: "lens-burn",
    name: "Линза жара",
    target: "lens",
    effect: {},
    description: "Луч даёт +20% шанс ожога всем пушкам",
    applyLens: (lens) => lens.addBuff((p) => ({ ...p, burnChance: p.burnChance + 0.2 })),
  },
  {
    id: "lens-crit",
    name: "Линза точности",
    target: "lens",
    effect: {},
    description: "Луч даёт +15% шанс крита и x1.8 крит урон",
    applyLens: (lens) =>
      lens.addBuff((p) => ({ ...p, critChance: p.critChance + 0.15, critMultiplier: 1.8 })),
  },
  {
    id: "link-x2",
    name: "Резонатор",
    target: "link",
    effect: { multiplier: 2 },
    description: "Звено умножает эффект пушки x2",
  },
  {
    id: "link-x15",
    name: "Стабилизатор",
    target: "link",
    effect: { multiplier: 1.5 },
    description: "Звено умножает эффект пушки x1.5",
  },
];

function pickRandomCards(count, pool) {
  const source = [...pool];
  const picked = [];
  while (picked.length < count && source.length > 0) {
    const idx = Math.floor(Math.random() * source.length);
    picked.push(source.splice(idx, 1)[0]);
  }
  return picked;
}

function allGunsBuffed(guns) {
  return guns.every((g) => g.hasBuff);
}

function allLinksBuffed(guns) {
  return guns.every((g) => g.link && g.link.buffName !== "Нет");
}

async function chooseCard(rl, cardsOffered, state) {
  console.log("\nВыбери одну карточку:");
  cardsOffered.forEach((card, i) => {
    console.log(`${i + 1}. ${card.name} [${card.target}] — ${card.description}`);
  });

  while (true) {
    const answer = await rl.question("Номер карточки: ");
    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= cardsOffered.length) {
      console.log("Некорректный ввод, попробуй снова.");
      continue;
    }
    const chosen = cardsOffered[idx];
    const applied = applyCardToState(chosen, state);
    if (!applied) {
      console.log("Эту карточку сейчас нельзя применить, выбери другую.");
      continue;
    }
    console.log(`Применено: ${chosen.name}`);
    break;
  }
}

function applyCardToState(card, state) {
  const { guns, lens } = state;

  if (card.target === "lens") {
    card.applyLens(lens);
    return true;
  }

  if (card.target === "gun") {
    const freeGun = guns.find((g) => !g.hasBuff);
    if (!freeGun) return false;
    return freeGun.applyCard(card);
  }

  if (card.target === "link") {
    const freeLinkGun = guns.find((g) => g.link && g.link.buffName === "Нет");
    if (!freeLinkGun) return false;
    return freeLinkGun.link.applyCard(card);
  }

  return false;
}

function makeCardPool(state) {
  const pool = [];
  const { guns } = state;
  const hasFreeGun = guns.some((g) => !g.hasBuff);
  const hasFreeLink = guns.some((g) => g.link && g.link.buffName === "Нет");

  for (const card of cards) {
    if (card.target === "gun" && hasFreeGun) pool.push(card);
    if (card.target === "lens") pool.push(card);
    if (card.target === "link" && hasFreeLink) pool.push(card);
  }
  return pool;
}

async function run() {
  const rl = readline.createInterface({ input, output });
  const engine = new Engine(36);
  const lens = new Lens("Дисперсер");
  const guns = [new Gun("Пушка A", 11), new Gun("Пушка B", 12), new Gun("Пушка C", 10)];
  const state = { engine, lens, guns };

  const KILLS_FOR_CARD = 3;
  let kills = 0;
  let level = 1;

  console.log("=== Lost Games: прототип механики ===");
  console.log("Энергия: Движок -> Линза(дисперсер) -> Пушки -> Монстр\n");

  while (level <= 15) {
    const monster = new Monster(level);
    console.log(`\nМонстр ${level}: HP ${Math.round(monster.hp)}`);

    while (monster.alive) {
      const packets = lens.split(engine.produce(), guns.length);
      for (let i = 0; i < guns.length; i++) {
        const result = guns[i].shoot(packets[i], monster);
        if (!monster.alive) break;
        const burnDamage = monster.burnTick();
        const logLine =
          `${guns[i].name} наносит ${result.damage.toFixed(1)} ` +
          `${result.isCrit ? "(КРИТ) " : ""}` +
          `${result.appliedBurn ? "[ожог] " : ""}` +
          `${burnDamage > 0 ? `| burn ${burnDamage}` : ""}` +
          `| HP монстра: ${Math.max(0, monster.hp).toFixed(1)}`;
        console.log(logLine);
      }
    }

    kills += 1;
    console.log(`Монстр ${level} уничтожен. Убийств: ${kills}`);

    if (allGunsBuffed(guns) && !guns[0].link) {
      guns.forEach((g) => g.unlockLink());
      console.log("Все пушки забафаны: перед каждой пушкой открылось звено для отдельного бафа.");
    }

    if (kills % KILLS_FOR_CARD === 0) {
      const pool = makeCardPool(state);
      const offer = pickRandomCards(3, pool);
      if (offer.length > 0) {
        await chooseCard(rl, offer, state);
      }
    }

    if (allLinksBuffed(guns)) {
      console.log("\nВсе звенья забафаны. Сборка полностью раскрыта.");
      break;
    }

    level += 1;
  }

  console.log("\nИтог билда:");
  guns.forEach((g) => {
    const linkBuff = g.link ? g.link.buffName : "нет";
    console.log(`- ${g.name}: баф=${g.buffName}, звено=${linkBuff}`);
  });

  rl.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
