class Engine {
  constructor(baseEnergy) {
    this.baseEnergy = baseEnergy;
  }

  produce() {
    return this.baseEnergy;
  }
}

class SynthAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicMaster = null;
    this.enabled = true;
    this.lastPlayed = new Map();
    this.musicEnabled = true;
    this.musicInterval = null;
    this.musicTempo = 112;
    this.musicStep = 0;
    this.musicNextTime = 0;
    this.musicBar = 0;
  }

  unlock() {
    if (!this.enabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
      this.musicMaster = this.ctx.createGain();
      this.musicMaster.gain.value = 0.34;
      this.musicMaster.connect(this.master);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  canPlay(key, minGap = 0.02) {
    const now = performance.now() / 1000;
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < minGap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  tone({
    type = "sine",
    frequency = 440,
    frequencyEnd = frequency,
    attack = 0.003,
    hold = 0.02,
    release = 0.08,
    gain = 0.15,
    filterType = "lowpass",
    filterFrequency = 2200,
    q = 0.001,
    pan = 0,
    time = null,
    destination = null,
  }) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.master) return;
    const now = time ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const panner = this.ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequencyEnd), now + attack + hold + release);
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, now);
    filter.Q.value = q;
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.78), now + attack + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
    osc.connect(filter);
    filter.connect(env);
    env.connect(panner);
    panner.connect(destination || this.master);
    osc.start(now);
    osc.stop(now + attack + hold + release + 0.02);
  }

  noise({
    attack = 0.002,
    hold = 0.02,
    release = 0.09,
    gain = 0.1,
    filterType = "bandpass",
    filterFrequency = 900,
    q = 0.8,
    pan = 0,
    time = null,
    destination = null,
  }) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx || !this.master) return;
    const now = time ?? this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.2), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFrequency, now);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + attack);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.6), now + attack + hold);
    env.gain.exponentialRampToValueAtTime(0.0001, now + attack + hold + release);
    src.connect(filter);
    filter.connect(env);
    env.connect(panner);
    panner.connect(destination || this.master);
    src.start(now);
    src.stop(now + attack + hold + release + 0.02);
  }

  setMusicEnabled(enabled) {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMusic();
      return;
    }
    this.unlock();
    this.startMusic();
  }

  startMusic() {
    if (!this.musicEnabled) return;
    this.unlock();
    if (!this.ctx || !this.musicMaster || this.musicInterval) return;
    this.musicStep = 0;
    this.musicBar = 0;
    this.musicNextTime = this.ctx.currentTime + 0.08;
    this.musicInterval = window.setInterval(() => this.scheduleMusic(), 100);
  }

  stopMusic() {
    if (this.musicInterval) {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  scheduleMusic() {
    if (!this.musicEnabled || !this.ctx || !this.musicMaster) return;
    if (this.ctx.state === "suspended") return;
    const lookAhead = 0.28;
    while (this.musicNextTime < this.ctx.currentTime + lookAhead) {
      this.scheduleMusicStep(this.musicStep, this.musicNextTime);
      this.musicStep += 1;
      if (this.musicStep >= 16) {
        this.musicStep = 0;
        this.musicBar += 1;
      }
      this.musicNextTime += 60 / this.musicTempo / 4;
    }
  }

  scheduleMusicStep(step, time) {
    const phase = this.getMusicPhase();
    const isBoss = typeof state !== "undefined" && state.isBossWave;
    this.musicTempo = isBoss ? 124 : phase.tempo;

    const kickPattern = phase.kick;
    const hatPattern = phase.hat;
    const bassPattern = phase.bass;
    const arpPattern = phase.arp;
    const padStep = step === 0 || (phase.padTwin && step === 8);

    if (kickPattern.includes(step)) {
      this.tone({
        type: "sine",
        frequency: isBoss ? 78 : 74,
        frequencyEnd: isBoss ? 34 : 36,
        attack: 0.002,
        hold: 0.015,
        release: 0.18,
        gain: isBoss ? 0.17 : 0.16,
        filterFrequency: 260,
        time,
        destination: this.musicMaster,
      });
      this.noise({
        attack: 0.001,
        hold: 0.008,
        release: 0.05,
        gain: 0.025,
        filterType: "lowpass",
        filterFrequency: 420,
        time,
        destination: this.musicMaster,
      });
    }

    if (hatPattern.includes(step)) {
      this.noise({
        attack: 0.001,
        hold: phase.hatOpen && step % 8 === 6 ? 0.012 : 0.004,
        release: phase.hatOpen && step % 8 === 6 ? 0.08 : 0.035,
        gain: phase.hatGain,
        filterType: "highpass",
        filterFrequency: 5200,
        q: 0.8,
        pan: step % 4 === 0 ? -0.08 : 0.08,
        time,
        destination: this.musicMaster,
      });
    }

    if (bassPattern.includes(step)) {
      const notes = phase.bassNotes;
      const note = notes[Math.floor(step / 4) % notes.length];
      this.tone({
        type: "sawtooth",
        frequency: note,
        frequencyEnd: note * (phase.bassSlide || 0.92),
        attack: 0.01,
        hold: phase.bassHold,
        release: phase.bassRelease,
        gain: phase.bassGain,
        filterType: "lowpass",
        filterFrequency: phase.bassFilter,
        q: 0.7,
        time,
        destination: this.musicMaster,
      });
    }

    if (arpPattern.includes(step)) {
      const arpNotes = phase.arpNotes;
      const note = arpNotes[step % arpNotes.length];
      this.tone({
        type: phase.arpType,
        frequency: note,
        frequencyEnd: note * 1.18,
        attack: 0.004,
        hold: 0.02,
        release: 0.12,
        gain: phase.arpGain,
        filterType: "bandpass",
        filterFrequency: phase.arpFilter,
        q: 0.8,
        pan: step % 4 < 2 ? -0.16 : 0.16,
        time,
        destination: this.musicMaster,
      });
    }

    if (padStep) {
      this.tone({
        type: "triangle",
        frequency: phase.padNotes[step === 0 ? 0 : 1],
        frequencyEnd: phase.padNotes[step === 0 ? 1 : 2],
        attack: 0.12,
        hold: phase.padHold,
        release: phase.padRelease,
        gain: phase.padGain,
        filterType: "lowpass",
        filterFrequency: phase.padFilter,
        pan: step === 0 ? -0.16 : 0.16,
        time,
        destination: this.musicMaster,
      });
      this.tone({
        type: "sine",
        frequency: phase.padTop[step === 0 ? 0 : 1],
        frequencyEnd: phase.padTop[step === 0 ? 1 : 2],
        attack: 0.14,
        hold: 0.22,
        release: phase.padRelease * 0.92,
        gain: phase.padGain * 0.62,
        filterType: "bandpass",
        filterFrequency: phase.padFilter + 200,
        q: 0.5,
        pan: step === 0 ? 0.12 : -0.12,
        time,
        destination: this.musicMaster,
      });
    }
  }

  getMusicPhase() {
    const phaseIndex = this.musicBar % 16;
    const boss = typeof state !== "undefined" && state.isBossWave;
    if (boss) {
      return {
        tempo: 124,
        kick: [0, 3, 4, 8, 10, 12],
        hat: [0, 2, 4, 6, 8, 10, 12, 14, 15],
        hatOpen: true,
        hatGain: 0.022,
        bass: [0, 2, 4, 6, 8, 10, 12, 14],
        bassNotes: [49, 55, 58.27, 46.25],
        bassHold: 0.075,
        bassRelease: 0.18,
        bassGain: 0.06,
        bassFilter: 540,
        bassSlide: 0.88,
        arp: [1, 5, 7, 9, 11, 13, 15],
        arpNotes: [392, 493.88, 587.32, 783.99],
        arpType: "square",
        arpGain: 0.018,
        arpFilter: 1900,
        padTwin: true,
        padNotes: [164.81, 196, 220],
        padTop: [329.63, 392, 440],
        padHold: 0.34,
        padRelease: 0.78,
        padGain: 0.02,
        padFilter: 1100,
      };
    }
    if (phaseIndex < 4) {
      return {
        tempo: 108,
        kick: [0, 4, 8, 12],
        hat: [2, 6, 10, 14],
        hatOpen: false,
        hatGain: 0.013,
        bass: [0, 8],
        bassNotes: [55, 65.4, 49, 61.74],
        bassHold: 0.11,
        bassRelease: 0.28,
        bassGain: 0.04,
        bassFilter: 420,
        bassSlide: 0.95,
        arp: [],
        arpNotes: [],
        arpType: "triangle",
        arpGain: 0,
        arpFilter: 1600,
        padTwin: false,
        padNotes: [220, 246.94, 293.66],
        padTop: [440, 493.88, 587.32],
        padHold: 0.4,
        padRelease: 1,
        padGain: 0.03,
        padFilter: 1200,
      };
    }
    if (phaseIndex < 8) {
      return {
        tempo: 112,
        kick: [0, 4, 8, 12],
        hat: [0, 2, 4, 6, 8, 10, 12, 14],
        hatOpen: false,
        hatGain: 0.018,
        bass: [0, 4, 8, 12],
        bassNotes: [55, 55, 65.4, 49],
        bassHold: 0.09,
        bassRelease: 0.22,
        bassGain: 0.05,
        bassFilter: 460,
        bassSlide: 0.92,
        arp: [3, 7, 11, 15],
        arpNotes: [440, 493.88, 587.32, 659.25],
        arpType: "triangle",
        arpGain: 0.012,
        arpFilter: 1700,
        padTwin: true,
        padNotes: [220, 246.94, 293.66],
        padTop: [440, 493.88, 587.32],
        padHold: 0.28,
        padRelease: 0.9,
        padGain: 0.028,
        padFilter: 1200,
      };
    }
    if (phaseIndex < 12) {
      return {
        tempo: 118,
        kick: [0, 4, 7, 8, 12],
        hat: [0, 2, 4, 6, 8, 10, 12, 14],
        hatOpen: true,
        hatGain: 0.02,
        bass: [0, 2, 6, 8, 10, 14],
        bassNotes: [49, 55, 61.74, 65.4],
        bassHold: 0.075,
        bassRelease: 0.18,
        bassGain: 0.055,
        bassFilter: 520,
        bassSlide: 0.9,
        arp: [1, 3, 5, 7, 9, 11, 13, 15],
        arpNotes: [392, 440, 493.88, 587.32, 659.25, 783.99],
        arpType: "sawtooth",
        arpGain: 0.015,
        arpFilter: 1850,
        padTwin: true,
        padNotes: [196, 220, 261.63],
        padTop: [392, 440, 523.25],
        padHold: 0.24,
        padRelease: 0.76,
        padGain: 0.022,
        padFilter: 1250,
      };
    }
    return {
      tempo: 110,
      kick: [0, 4, 8, 12],
      hat: [2, 6, 10, 14],
      hatOpen: true,
      hatGain: 0.014,
      bass: [0, 8],
      bassNotes: [55, 49, 46.25, 65.4],
      bassHold: 0.12,
      bassRelease: 0.3,
      bassGain: 0.036,
      bassFilter: 400,
      bassSlide: 0.96,
      arp: [7, 15],
      arpNotes: [440, 587.32, 493.88],
      arpType: "sine",
      arpGain: 0.01,
      arpFilter: 1500,
      padTwin: false,
      padNotes: [174.61, 220, 246.94],
      padTop: [349.23, 440, 493.88],
      padHold: 0.46,
      padRelease: 1.1,
      padGain: 0.026,
      padFilter: 1000,
    };
  }

  uiTap() {
    if (!this.canPlay("uiTap", 0.04)) return;
    this.tone({ type: "triangle", frequency: 540, frequencyEnd: 760, hold: 0.014, release: 0.08, gain: 0.05, filterFrequency: 2400, pan: -0.05 });
  }

  cardOpen() {
    if (!this.canPlay("cardOpen", 0.08)) return;
    this.tone({ type: "sine", frequency: 320, frequencyEnd: 540, hold: 0.06, release: 0.22, gain: 0.07, filterFrequency: 1600 });
    this.tone({ type: "triangle", frequency: 640, frequencyEnd: 980, attack: 0.01, hold: 0.05, release: 0.18, gain: 0.045, filterFrequency: 3000, pan: 0.15 });
  }

  cardPick() {
    if (!this.canPlay("cardPick", 0.06)) return;
    this.tone({ type: "sine", frequency: 520, frequencyEnd: 860, hold: 0.02, release: 0.12, gain: 0.06, filterFrequency: 2400 });
  }

  shotCircular() {
    if (!this.canPlay("shotCircular", 0.03)) return;
    this.tone({ type: "triangle", frequency: 420, frequencyEnd: 280, hold: 0.012, release: 0.08, gain: 0.045, filterFrequency: 1800 });
  }

  shotSniper() {
    if (!this.canPlay("shotSniper", 0.06)) return;
    this.tone({ type: "sawtooth", frequency: 980, frequencyEnd: 260, hold: 0.03, release: 0.18, gain: 0.07, filterType: "bandpass", filterFrequency: 1200, q: 0.7 });
    this.noise({ attack: 0.001, hold: 0.008, release: 0.06, gain: 0.03, filterType: "highpass", filterFrequency: 2200, pan: 0.1 });
  }

  shotShotgun() {
    if (!this.canPlay("shotShotgun", 0.05)) return;
    this.noise({ attack: 0.001, hold: 0.012, release: 0.08, gain: 0.06, filterType: "bandpass", filterFrequency: 720, q: 1.2 });
    this.tone({ type: "triangle", frequency: 210, frequencyEnd: 110, hold: 0.01, release: 0.07, gain: 0.035, filterFrequency: 900 });
  }

  hitWall() {
    if (!this.canPlay("hitWall", 0.08)) return;
    this.noise({ attack: 0.001, hold: 0.03, release: 0.18, gain: 0.09, filterType: "bandpass", filterFrequency: 480, q: 0.9 });
    this.tone({ type: "sine", frequency: 140, frequencyEnd: 70, hold: 0.02, release: 0.22, gain: 0.05, filterFrequency: 500 });
  }

  enemyDeath(isBoss = false) {
    if (!this.canPlay(isBoss ? "bossDeath" : "enemyDeath", isBoss ? 0.2 : 0.025)) return;
    this.tone({ type: "triangle", frequency: isBoss ? 260 : 320, frequencyEnd: isBoss ? 90 : 140, hold: 0.02, release: isBoss ? 0.26 : 0.12, gain: isBoss ? 0.085 : 0.035, filterFrequency: isBoss ? 900 : 1400 });
    if (isBoss) this.noise({ attack: 0.002, hold: 0.04, release: 0.3, gain: 0.08, filterType: "bandpass", filterFrequency: 460, q: 0.8 });
  }

  burn() {
    if (!this.canPlay("burn", 0.05)) return;
    this.noise({ attack: 0.001, hold: 0.015, release: 0.07, gain: 0.03, filterType: "highpass", filterFrequency: 1500, q: 0.9 });
  }

  freeze() {
    if (!this.canPlay("freeze", 0.05)) return;
    this.tone({ type: "sine", frequency: 920, frequencyEnd: 520, hold: 0.018, release: 0.12, gain: 0.035, filterFrequency: 2600, pan: -0.1 });
  }

  lightning() {
    if (!this.canPlay("lightning", 0.04)) return;
    this.noise({ attack: 0.001, hold: 0.012, release: 0.08, gain: 0.05, filterType: "bandpass", filterFrequency: 1800, q: 1.4, pan: 0.12 });
    this.tone({ type: "square", frequency: 760, frequencyEnd: 420, hold: 0.01, release: 0.06, gain: 0.03, filterFrequency: 2200 });
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
    this.baseFireRate = 5;
    this.profile = "circular";
    this.verticalBand = 0;
    this.shotgunPellets = 0;
    this.shotgunSpread = 0;
    this.fireRate = 5;
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
    this.installed = false;
    this.slotUnlocked = false;
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
      this.shotgunSpread = 42;
      this.baseFireRate = 2.1;
      return;
    }
    this.attackMode = "circular";
    this.verticalBand = 0;
    this.shotgunPellets = 0;
    this.shotgunSpread = 0;
    this.baseFireRate = 5;
  }

  hasFreeLink() {
    return this.links.some((link) => !link.isBuffed());
  }

  hasAttackProfile() {
    return false;
  }

  applyLinkCard(card) {
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
    this.setAttackProfile(this.profile);
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

  chooseAttackProfile(profile) {
    this.profile = profile;
    this.recomputeFromLinks();
  }
}

class Enemy {
  constructor(y, wave, isBoss, startX, wallCx, wallCy, wallR, yMin, yMax, powerScale, durabilityScale) {
    this.x = startX;
    this.y = y;
    this.yMin = yMin;
    this.yMax = yMax;
    this.wallCx = wallCx;
    this.wallCy = wallCy;
    this.wallR = wallR;
    this.isBoss = isBoss;
    const baseRadius = isBoss ? 20 : 12;
    const baseHp = isBoss ? 560 + wave * 80 : 48 + wave * 14;
    const baseSpeed = isBoss ? 38 + wave * 0.9 : 62 + wave * 2.1;
    const durability = durabilityScale || 1;
    const firstBossEase = isBoss && wave === 5 ? 0.5 : 1;

    this.maxHp = baseHp * ENEMY_HP_WAVE_MULT * powerScale * durability * firstBossEase;
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
    this.targetY = y;
    this.bossSteerTimer = 0;
    this.bossSteerInterval = 0.7;
  }

  update(dt) {
    const slowMultiplier = Math.max(0.35, 1 - this.freezeStacks * 0.14);
    this.x -= this.speed * slowMultiplier * dt;

    if (this.isBoss) {
      this.bossSteerTimer -= dt;
      if (this.bossSteerTimer <= 0) {
        const pad = this.radius + 8;
        const minY = this.yMin + pad;
        const maxY = this.yMax - pad;
        this.targetY = minY + Math.random() * Math.max(8, maxY - minY);
        this.bossSteerInterval = 0.35 + Math.random() * 0.95;
        this.bossSteerTimer = this.bossSteerInterval;
      }
      const toTarget = this.targetY - this.y;
      const maxStep = this.speed * 0.75 * dt;
      this.y += Math.max(-maxStep, Math.min(maxStep, toTarget));
      const pad = this.radius + 4;
      this.y = Math.max(this.yMin + pad, Math.min(this.yMax - pad, this.y));
    }

    if (this.x >= this.wallCx) {
      const dist = Math.hypot(this.x - this.wallCx, this.y - this.wallCy);
      if (dist <= this.wallR + this.radius * 0.78) this.reachedWall = true;
    }
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
const WAVE_SIZE = (wave) => (wave <= 3 ? (4 + wave) * 2 : (5 + Math.floor(wave * 1.1)) * 2);
const ENEMY_HP_WAVE_MULT = 0.5;
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
    description: "Луч даёт +20% шанса ожога всем пушкам",
    applyLens: (lens) =>
      lens.addBuff("Жар", (p) => ({
        ...p,
        burnChance: p.burnChance + 0.2,
      })),
  },
  {
    id: "lens_frost",
    target: "lens",
    name: "Линза мороза",
    rarity: "rare",
    color: RARITY_COLORS.rare,
    description: "Луч даёт +18% шанса льда всем пушкам",
    applyLens: (lens) =>
      lens.addBuff("Мороз", (p) => ({
        ...p,
        iceChance: p.iceChance + 0.18,
      })),
  },
  {
    id: "lens_storm",
    target: "lens",
    name: "Линза грозы",
    rarity: "legendary",
    color: RARITY_COLORS.legendary,
    description: "Луч даёт +14% шанса молнии (+1 скачок, +70 радиус)",
    applyLens: (lens) =>
      lens.addBuff("Гроза", (p) => ({
        ...p,
        lightningChance: p.lightningChance + 0.14,
        lightningChains: p.lightningChains + 1,
        lightningRadius: p.lightningRadius + 70,
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
  gunStrip: document.getElementById("gunStrip"),
  modalGunStrip: document.getElementById("modalGunStrip"),
  startOverlay: document.getElementById("startOverlay"),
  startGameBtn: document.getElementById("startGameBtn"),
  restartBtn: document.getElementById("restartBtn"),
  helpBtn: document.getElementById("helpBtn"),
  helpModal: document.getElementById("helpModal"),
  helpCloseBtn: document.getElementById("helpCloseBtn"),
  cardsInfoBtn: document.getElementById("cardsInfoBtn"),
  cardsInfoModal: document.getElementById("cardsInfoModal"),
  cardsInfoBody: document.getElementById("cardsInfoBody"),
  cardsInfoCloseBtn: document.getElementById("cardsInfoCloseBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  threeModeBtn: document.getElementById("threeModeBtn"),
  soundBtn: document.getElementById("soundBtn"),
  musicBtn: document.getElementById("musicBtn"),
};

const audioFx = new SynthAudio();
const STORAGE_SOUND_KEY = "lost-games-td-sound-enabled";
const STORAGE_MUSIC_KEY = "lost-games-td-music-enabled";

const world = {
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  enginePos: { x: 120, y: 270 },
  lensPos: { x: 215, y: 270 },
  guns: [
    new Gun("Пушка A", 480, 90, 8, MAX_LINKS_PER_GUN),
    new Gun("Пушка B", 480, 175, 8, MAX_LINKS_PER_GUN),
    new Gun("Пушка C", 480, 260, 8, MAX_LINKS_PER_GUN),
    new Gun("Пушка D", 480, 345, 8, MAX_LINKS_PER_GUN),
    new Gun("Пушка E", 480, 430, 8, MAX_LINKS_PER_GUN),
  ],
  wall: {
    x: 250,
    y: 40,
    w: 16,
    h: 460,
    cx: 250,
    cy: 270,
    r: 230,
    angleMin: -1.12,
    angleMax: 1.12,
  },
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
  selectedGunIndices: [],
  draggingGroupIndices: [],
  draggingGroupBaseYs: [],
  dragGroupStartY: 0,
  pausedByCards: false,
  userPaused: false,
  threeMode: false,
  unlockedGunSlots: 1,
  gameOver: false,
  pendingRegularCardRewards: 0,
  pendingBossLensRewards: 0,
  waveRewardGranted: false,
  rewardModalDelay: 0,
  enemyPowerScale: 1,
  skipNextCanvasClick: false,
  modalTargetPick: null,
  moveGunUpHeld: false,
  moveGunDownHeld: false,
  soundEnabled: true,
  musicEnabled: true,
  started: false,
  lastTime: performance.now(),
};

function logLine(text) {
  const line = document.createElement("div");
  line.className = "log-item";
  line.textContent = text;
  ui.log.prepend(line);
}

function loadSoundPreference() {
  try {
    const raw = window.localStorage.getItem(STORAGE_SOUND_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function saveSoundPreference(enabled) {
  try {
    window.localStorage.setItem(STORAGE_SOUND_KEY, enabled ? "1" : "0");
  } catch {}
}

function loadMusicPreference() {
  try {
    const raw = window.localStorage.getItem(STORAGE_MUSIC_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function saveMusicPreference(enabled) {
  try {
    window.localStorage.setItem(STORAGE_MUSIC_KEY, enabled ? "1" : "0");
  } catch {}
}

function allLinksBuffed() {
  const unlocked = world.guns.filter((g) => g.slotUnlocked);
  return unlocked.length > 0 && unlocked.every((g) => g.links.every((link) => link.isBuffed()));
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
  const hasFreeLink = world.guns.some((g) => g.slotUnlocked && g.hasFreeLink());
  if (!hasFreeLink) return [];
  return LINK_CARDS;
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
  audioFx.uiTap();
  renderCardsInfoTable();
  openSimpleModal(ui.cardsInfoModal);
}

function closeCardsInfoModal() {
  if (!ui.cardsInfoModal) return;
  closeSimpleModal(ui.cardsInfoModal);
}

function openHelpModal() {
  if (!ui.helpModal) return;
  audioFx.uiTap();
  openSimpleModal(ui.helpModal);
}

function closeHelpModal() {
  if (!ui.helpModal) return;
  closeSimpleModal(ui.helpModal);
}

function openSimpleModal(node) {
  if (!node) return;
  node.classList.remove("hidden");
  node.classList.remove("modal-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      node.classList.add("modal-open");
    });
  });
}

function closeSimpleModal(node) {
  if (!node) return;
  node.classList.remove("modal-open");
  node.classList.add("hidden");
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
  const installed = getInstalledGuns();
  if (installed.length === 0) {
    return {
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
  const packets = state.lens.distribute(state.engine.produce(), installed.length);
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
  const baseEnergy = Math.max(1, state.engine.produce());
  const sharedEnergyScale = (packet.energy || 0) / baseEnergy;
  const energyScale = sharedEnergyScale * gun.energyMultiplier * (packet.energyMultiplier || 1);
  return {
    sharedEnergyScale,
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

function setSelectedGuns(indices, primary = -1) {
  const unique = [...new Set(indices)].filter(
    (idx) => idx >= 0 && idx < world.guns.length && world.guns[idx].installed
  );
  state.selectedGunIndices = unique;
  if (unique.length === 0) {
    state.selectedGunIndex = -1;
    return;
  }
  state.selectedGunIndex = unique.includes(primary) ? primary : unique[0];
}

function isGunSelected(idx) {
  return state.selectedGunIndices.includes(idx);
}

function wallAngleToPos(angle) {
  const a = Math.max(world.wall.angleMin, Math.min(world.wall.angleMax, angle));
  return {
    x: world.wall.cx + Math.cos(a) * world.wall.r,
    y: world.wall.cy + Math.sin(a) * world.wall.r,
  };
}

function pointToWallAngle(x, y) {
  return Math.atan2(y - world.wall.cy, x - world.wall.cx);
}

function setGunOnWallByAngle(gun, angle) {
  const a = Math.max(world.wall.angleMin, Math.min(world.wall.angleMax, angle));
  const p = wallAngleToPos(a);
  gun.wallAngle = a;
  gun.x = p.x;
  gun.y = p.y;
}

function placeInitialGunsOnWall() {
  const installed = world.guns.filter((g) => g.installed);
  const count = installed.length;
  installed.forEach((gun, idx) => {
    const t = count === 1 ? 0.5 : idx / (count - 1);
    const angle = world.wall.angleMin + (world.wall.angleMax - world.wall.angleMin) * t;
    setGunOnWallByAngle(gun, angle);
  });
}

function getInstalledGuns() {
  return world.guns.filter((g) => g.installed);
}

function getInstalledGunIndices() {
  return world.guns.map((gun, idx) => (gun.installed ? idx : -1)).filter((idx) => idx >= 0);
}

function cycleSelectedGun(direction = 1) {
  const installed = getInstalledGunIndices();
  if (installed.length === 0) return;
  const currentPos = installed.indexOf(state.selectedGunIndex);
  if (currentPos < 0) {
    const nextIdx = direction >= 0 ? installed[0] : installed[installed.length - 1];
    setSelectedGuns([nextIdx], nextIdx);
    return;
  }
  const nextPos = (currentPos + direction + installed.length) % installed.length;
  const nextIdx = installed[nextPos];
  setSelectedGuns([nextIdx], nextIdx);
}

function initializeGunSlots() {
  world.guns.forEach((gun, idx) => {
    gun.slotUnlocked = idx < 2;
    gun.installed = idx < 2;
    gun.chooseAttackProfile("circular");
  });
  placeInitialGunsOnWall();
  setSelectedGuns([0], 0);
  state.unlockedGunSlots = 2;
}

function unlockNextGunSlot(count = 1) {
  let unlockedNow = 0;
  for (let i = 0; i < count; i += 1) {
    const next = world.guns.find((g) => !g.slotUnlocked);
    if (!next) break;
    next.slotUnlocked = true;
    unlockedNow += 1;
    state.unlockedGunSlots += 1;
  }
  if (unlockedNow > 0) logLine(`Открыт слот пушки: +${unlockedNow}. (${state.unlockedGunSlots}/5)`);
}

function installGun(idx) {
  const gun = world.guns[idx];
  if (!gun || !gun.slotUnlocked || gun.installed) return;
  gun.installed = true;
  placeInitialGunsOnWall();
}

function removeGun(idx) {
  const gun = world.guns[idx];
  if (!gun || !gun.installed) return;
  if (getInstalledGuns().length <= 1) return;
  gun.installed = false;
  setSelectedGuns(state.selectedGunIndices.filter((v) => v !== idx), state.selectedGunIndex);
  placeInitialGunsOnWall();
}

function profileOptions() {
  return [
    {
      id: "profile_circular",
      name: "Круговой",
      description: "Сбалансированная круговая зона.",
      profile: "circular",
      icon: "◎",
      short: "Круг",
      color: "#8f9aa7",
      rarity: "common",
    },
    {
      id: "profile_sniper",
      name: "Снайпер",
      description: "Дальняя треугольная зона, редкие выстрелы.",
      profile: "sniper",
      icon: "△",
      short: "Снайп",
      color: "#5da8ff",
      rarity: "rare",
    },
    {
      id: "profile_shotgun",
      name: "Дробовик",
      description: "Широкая ближняя зона и дробь.",
      profile: "shotgun",
      icon: "▭",
      short: "Дробь",
      color: "#5da8ff",
      rarity: "rare",
    },
  ];
}

function renderGunStrip(container) {
  if (!container) return;
  container.innerHTML = "";
  world.guns.forEach((gun, idx) => {
    if (!gun.slotUnlocked) return;
    const card = document.createElement("div");
    const selected = isGunSelected(idx);
    card.className = `gun-pill ${selected ? "selected" : ""}`.trim();
    const status = gun.installed ? "Установлена" : "Слот открыт";
    const lensPacket = getLensPacketPreview();
    const combat = composeCombatStats(gun, lensPacket);
    const profiles = profileOptions();
    card.innerHTML = [
      `<div class="gun-pill-title">${gun.name} • ${status}</div>`,
      `<table class="gun-pill-table">`,
      `<tr><td>Профиль</td><td>${zoneName(gun)}</td></tr>`,
      `<tr><td>Скорость</td><td>${gun.fireRate.toFixed(2)}/с</td></tr>`,
      `<tr><td>Урон</td><td>${gun.baseDamage + gun.flatDamage} × ${gun.multiplier.toFixed(2)}</td></tr>`,
      `<tr><td>Дальность</td><td>${gun.range.toFixed(0)}</td></tr>`,
      `<tr><td>Энергия</td><td>x${combat.energyScale.toFixed(2)}</td></tr>`,
      `<tr><td>Магия</td><td>x${combat.magicScale.toFixed(2)}</td></tr>`,
      `<tr><td>Статусы</td><td>🔥${(combat.burnChance * 100).toFixed(0)} ❄${(combat.iceChance * 100).toFixed(0)} ⚡${(combat.lightningChance * 100).toFixed(0)}</td></tr>`,
      `</table>`,
      `<div class="gun-pill-profile-row">`,
      ...profiles.map((profile) => {
        const active = gun.profile === profile.profile;
        return `<button class="profile-icon-btn js-profile-select ${active ? "active" : ""}" data-idx="${idx}" data-profile="${profile.profile}" data-tooltip="${profile.name}: ${profile.description}" ${!gun.installed ? "disabled" : ""}>${profile.icon}</button>`;
      }),
      `</div>`,
      `<div class="gun-pill-actions">`,
      `<button class="energy-toggle-btn js-slot ${gun.installed ? "active" : ""}" data-idx="${idx}" data-tooltip="${gun.installed ? "Отключить подачу энергии" : "Включить подачу энергии"}">${gun.installed ? "⏻" : "◌"}</button>`,
      `</div>`,
    ].join("");
    container.append(card);
  });
}

function renderModalTargetStrip() {
  if (!ui.modalGunStrip) return;
  const target = state.modalTargetPick;
  if (!target) {
    ui.modalGunStrip.innerHTML = "";
    ui.modalGunStrip.classList.add("hidden");
    return;
  }
  ui.modalGunStrip.classList.remove("hidden");
  ui.modalGunStrip.innerHTML = "";
  const allowed = new Set(target.gunIndices);
  world.guns.forEach((gun, idx) => {
    if (!gun.slotUnlocked) return;
    const card = document.createElement("div");
    const selected = isGunSelected(idx);
    const canPick = allowed.has(idx);
    card.className = `gun-pill ${selected ? "selected" : ""} ${canPick ? "pickable" : ""}`.trim();
    card.dataset.idx = String(idx);
    const lensPacket = getLensPacketPreview();
    const combat = composeCombatStats(gun, lensPacket);
    card.innerHTML = [
      `<div class="gun-pill-title">${gun.name}</div>`,
      `<table class="gun-pill-table">`,
      `<tr><td>Профиль</td><td>${zoneName(gun)}</td></tr>`,
      `<tr><td>Скорость</td><td>${gun.fireRate.toFixed(2)}/с</td></tr>`,
      `<tr><td>Урон</td><td>${gun.baseDamage + gun.flatDamage} × ${gun.multiplier.toFixed(2)}</td></tr>`,
      `<tr><td>Дальность</td><td>${gun.range.toFixed(0)}</td></tr>`,
      `<tr><td>Энергия</td><td>x${combat.energyScale.toFixed(2)}</td></tr>`,
      `</table>`,
      `<div class="gun-pill-actions">${canPick ? "<span>Кликни, чтобы применить баф</span>" : "<span>Недоступно</span>"}</div>`,
    ].join("");
    ui.modalGunStrip.append(card);
  });
}

function toggleGunSelection(idx) {
  if (idx < 0 || idx >= world.guns.length) return;
  if (isGunSelected(idx)) {
    const next = state.selectedGunIndices.filter((v) => v !== idx);
    setSelectedGuns(next, next[0] ?? -1);
    return;
  }
  setSelectedGuns([...state.selectedGunIndices, idx], idx);
}

function updateHud() {
  ui.wave.textContent = String(state.wave);
  ui.kills.textContent = String(state.kills);
  ui.baseHp.textContent = String(Math.max(0, state.wallHp).toFixed(1));
  ui.nextCard.textContent = state.pendingRegularCardRewards > 0 ? "0" : "1";
  ui.restartBtn.classList.toggle("hidden", !state.gameOver);
  if (ui.pauseBtn) ui.pauseBtn.textContent = state.userPaused ? "Продолжить" : "Пауза";
  if (ui.threeModeBtn) ui.threeModeBtn.textContent = state.threeMode ? "2D режим" : "3D режим";
  if (ui.soundBtn) ui.soundBtn.textContent = state.soundEnabled ? "Звук: ON" : "Звук: OFF";
  if (ui.musicBtn) ui.musicBtn.textContent = state.musicEnabled ? "Музыка: ON" : "Музыка: OFF";
  if (state.selectedGunIndex >= 0 && !world.guns[state.selectedGunIndex].installed) {
    setSelectedGuns([]);
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

  if (state.selectedGunIndices.length === 0) {
    ui.selectedGunInfo.textContent = "Кликни по установленной пушке (или Профиль в списке). Shift+клик: мультивыбор.";
  } else if (state.selectedGunIndices.length > 1) {
    const names = state.selectedGunIndices.map((idx) => world.guns[idx].name).join(", ");
    ui.selectedGunInfo.innerHTML = [
      `<div><strong>Выбрано башен: ${state.selectedGunIndices.length}</strong></div>`,
      `<div>${names}</div>`,
      `<div>Перетаскивай любую выбранную башню, чтобы двигать группу.</div>`,
    ].join("");
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
      `<div>Энергия: поток x${combat.sharedEnergyScale.toFixed(2)} · пушка x${gun.energyMultiplier.toFixed(2)} · линза x${(lensPacket.energyMultiplier || 1).toFixed(2)} = x${combat.energyScale.toFixed(2)}</div>`,
      `<div>Звенья: ${buffedLinks}/${totalLinks} (макс ${MAX_LINKS_PER_GUN})</div>`,
      `<div>Апгрейды: ${gunUpgradesText(gun)}</div>`,
    ].join("");
  }
  renderGunStrip(ui.gunStrip);
}

function openCardModal(cards, hint, onPick) {
  state.pausedByCards = true;
  state.modalTargetPick = null;
  audioFx.cardOpen();
  ui.modal.classList.remove("hidden");
  ui.modal.classList.remove("modal-open");
  if (ui.cardModalTitle) ui.cardModalTitle.textContent = `Выбери 1 из ${cards.length} карточек`;
  ui.cardHint.textContent = hint;
  ui.cardChoices.innerHTML = "";
  ui.targetChoices.innerHTML = "";
  if (ui.targetChoices) ui.targetChoices.style.display = "none";
  ui.modalGunStrip?.classList.add("hidden");
  ui.modalGunStrip?.classList.remove("strip-open");
  if (ui.modalGunStrip) ui.modalGunStrip.innerHTML = "";
  if (ui.modalGunStrip) ui.modalGunStrip.classList.remove("hidden");
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
    btn.onclick = () => {
      audioFx.cardPick();
      onPick(card);
    };
    ui.cardChoices.append(btn);
  });
  animateModalOpen();
  animateFan(ui.cardChoices);
}

function closeCardModal() {
  state.pausedByCards = false;
  state.modalTargetPick = null;
  ui.modal.classList.remove("modal-open");
  ui.modal.classList.add("hidden");
  ui.cardChoices.innerHTML = "";
  ui.targetChoices.innerHTML = "";
  if (ui.modalGunStrip) {
    ui.modalGunStrip.innerHTML = "";
    ui.modalGunStrip.classList.remove("strip-open");
  }
  updateHud();
  maybeOfferQueuedRewards();
}

function showTargetPick(title, guns, onPick) {
  ui.cardHint.textContent = title;
  state.modalTargetPick = {
    gunIndices: guns.map((g) => world.guns.indexOf(g)).filter((idx) => idx >= 0),
    onPick,
  };
  renderModalTargetStrip();
  animateModalGunStrip();
}

function animateFan(container) {
  container.classList.remove("fan-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      container.classList.add("fan-open");
    });
  });
}

function animateModalOpen() {
  if (!ui.modal) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ui.modal.classList.add("modal-open");
    });
  });
}

function animateModalGunStrip() {
  if (!ui.modalGunStrip) return;
  ui.modalGunStrip.classList.remove("strip-open");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ui.modalGunStrip.classList.add("strip-open");
    });
  });
}

function maybeOfferQueuedRewards() {
  if (state.gameOver) return;
  if (state.pausedByCards) return;
  if (state.rewardModalDelay > 0) return;
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
      if (!g.slotUnlocked) return false;
      return g.hasFreeLink();
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
  const offer = randomPick(LENS_CARDS, 3);
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
  state.rewardModalDelay = 0;
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
    world.wall.cx,
    world.wall.cy,
    world.wall.r,
    world.monsterYMin,
    world.monsterYMax,
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
    const halfAngle = ((gun.shotgunSpread || 120) * Math.PI) / 360;
    const angle = Math.atan2(dy, dx);
    return Math.hypot(dx, dy) <= gun.range && Math.abs(angle) <= halfAngle;
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
  audioFx.lightning();

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
    if (burnState !== "thaw") audioFx.burn();
    pushParticle(enemy.x, enemy.y, { color: burnState === "thaw" ? "#ffd39b" : "#ff9966", size: 2.7 });
  }
  if (Math.random() < combat.iceChance) {
    const freezeState = enemy.applyFreeze(combat.magicScale);
    enemy.lastHitKind = "magic";
    if (freezeState !== "extinguish") audioFx.freeze();
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
  audioFx.shotShotgun();
  const pellets = gun.shotgunPellets || 5;
  const spread = ((gun.shotgunSpread || 120) * Math.PI) / 180;
  for (let i = 0; i < pellets; i += 1) {
    const lane = pellets === 1 ? 0.5 : i / (pellets - 1);
    const angle = -spread / 2 + spread * lane;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const xEnd = gun.x + dirX * gun.range;
    const yEnd = gun.y + dirY * gun.range;

    let hit = null;
    let bestT = Infinity;
    for (const enemy of world.enemies) {
      if (!enemy.alive()) continue;
      const relX = enemy.x - gun.x;
      const relY = enemy.y - gun.y;
      const t = relX * dirX + relY * dirY;
      if (t < 0 || t > gun.range) continue;
      const closestX = gun.x + dirX * t;
      const closestY = gun.y + dirY * t;
      const miss = Math.hypot(enemy.x - closestX, enemy.y - closestY);
      if (miss > enemy.radius + 8) continue;
      if (t < bestT) {
        bestT = t;
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
        y2: yEnd,
        crit: false,
        life: 0.05,
      });
    }
  }
}

function fireSniper(gun, baseDamage, target, combat, crit) {
  audioFx.shotSniper();
  const shotDamage = baseDamage * 1.3;
  const dirXRaw = target.x - gun.x;
  const dirYRaw = target.y - gun.y;
  const len = Math.max(1, Math.hypot(dirXRaw, dirYRaw));
  const dirX = dirXRaw / len;
  const dirY = dirYRaw / len;
  const maxDx = Math.max(1, world.width - gun.x);
  const tToEdge = maxDx / Math.max(0.0001, dirX);
  const endX = gun.x + dirX * tToEdge;
  const endY = gun.y + dirY * tToEdge;

  const pierced = [];
  for (const enemy of world.enemies) {
    if (!enemy.alive()) continue;
    if (!enemyInGunZone(gun, enemy)) continue;
    const relX = enemy.x - gun.x;
    const relY = enemy.y - gun.y;
    const t = relX * dirX + relY * dirY;
    if (t < 0 || t > tToEdge) continue;
    const closestX = gun.x + dirX * t;
    const closestY = gun.y + dirY * t;
    const miss = Math.hypot(enemy.x - closestX, enemy.y - closestY);
    if (miss > enemy.radius + 10) continue;
    pierced.push({ enemy, t });
  }

  pierced.sort((a, b) => a.t - b.t);
  pierced.forEach(({ enemy }) => applyHit(enemy, shotDamage, combat));
  world.beams.push({
    x1: gun.x,
    y1: gun.y,
    x2: endX,
    y2: endY,
    crit,
    life: 0.13,
  });
}

function handleShooting(dt) {
  const installed = getInstalledGuns();
  if (installed.length === 0) return;
  const packets = state.lens.distribute(state.engine.produce(), installed.length);
  installed.forEach((gun, idx) => {
    if (gun.cooldown > 0) gun.cooldown -= dt;
    if (gun.cooldown > 0) return;

    const target = pickGunTarget(gun);
    if (!target) return;

    gun.cooldown = 1 / gun.fireRate;
    const packet = packets[idx];
    const crit = Math.random() < packet.critChance;
    const critMultiplier = crit ? packet.critMultiplier : 1;
    const combat = composeCombatStats(gun, packet);
    const damage = (gun.baseDamage + gun.flatDamage) * gun.multiplier * critMultiplier * combat.energyScale;

    if (gun.attackMode === "shotgun") {
      fireShotgun(gun, damage, combat);
      return;
    }

    if (gun.attackMode === "sniper") {
      fireSniper(gun, damage, target, combat, crit);
      return;
    }

    audioFx.shotCircular();
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
      audioFx.hitWall();
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
      audioFx.enemyDeath(enemy.isBoss);
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
    state.rewardModalDelay = 0.65;
    if (state.isBossWave) {
      unlockNextGunSlot(1);
      logLine("Босс-волна завершена. Открыт следующий слот пушки.");
    }
    logLine("Волна завершена. Выдана карточка усиления.");
  }
  if (state.rewardModalDelay > 0) {
    state.rewardModalDelay = Math.max(0, state.rewardModalDelay - dt);
    if (state.rewardModalDelay > 0) return;
    maybeOfferQueuedRewards();
    if (state.pausedByCards) return;
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
  grad.addColorStop(0, "#030914");
  grad.addColorStop(1, "#02060f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, world.width, world.height);

  const glow = ctx.createRadialGradient(world.width * 0.5, world.height * 0.5, 20, world.width * 0.5, world.height * 0.5, world.width * 0.7);
  glow.addColorStop(0, "rgba(50,132,194,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, world.width, world.height);
}

function drawZones() {
  const zones = [
    { x: 0, w: 150, color: "rgba(38,132,173,0.08)" },
    { x: 150, w: 140, color: "rgba(48,94,186,0.08)" },
    { x: 290, w: 160, color: "rgba(43,82,176,0.09)" },
    { x: 450, w: 70, color: "rgba(88,66,160,0.09)" },
    { x: 520, w: 440, color: "rgba(64,64,84,0.07)" },
  ];

  zones.forEach((zone) => {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, 0, zone.w, world.height);
  });

  ctx.strokeStyle = "rgba(86,170,230,0.14)";
  ctx.lineWidth = 1;
  for (let x = 0.5; x < world.width; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0.5; y < world.height; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }
}

function drawEngineAndLens(now) {
  const e = world.enginePos;
  const l = world.lensPos;
  const pulse = 0.5 + Math.sin(now * 0.005) * 0.5;

  ctx.fillStyle = "#5ff2cf";
  ctx.beginPath();
  ctx.arc(e.x, e.y, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#7fd6ff";
  ctx.beginPath();
  ctx.arc(l.x, l.y, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(114,244,211,${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 4 + pulse * 2;
  ctx.beginPath();
  ctx.moveTo(e.x, e.y);
  ctx.lineTo(l.x, l.y);
  ctx.stroke();

  getInstalledGuns().forEach((gun) => {
    ctx.strokeStyle = `rgba(124,220,255,${0.34 + pulse * 0.34})`;
    ctx.lineWidth = 2 + pulse * 1.3;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(gun.x, gun.y);
    ctx.stroke();
  });
}

function drawGuns() {
  world.guns.forEach((gun, idx) => {
    if (!gun.installed) return;
    const selected = isGunSelected(idx);

    ctx.fillStyle = selected ? "#2e6e88" : "#1e4362";
    ctx.strokeStyle = selected ? "#73ffe1" : "#4f9bd2";
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#bbebff";
    ctx.beginPath();
    ctx.arc(gun.x, gun.y, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(88,173,234,0.25)";
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
      const halfAngle = ((gun.shotgunSpread || 120) * Math.PI) / 360;
      const yTop = gun.y - Math.tan(halfAngle) * gun.range;
      const yBottom = gun.y + Math.tan(halfAngle) * gun.range;
      ctx.beginPath();
      ctx.moveTo(gun.x, gun.y);
      ctx.lineTo(gun.x + gun.range, yTop);
      ctx.lineTo(gun.x + gun.range, yBottom);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(gun.x, gun.y, gun.range, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#dcf5ff";
    ctx.font = "700 12px Space Grotesk";
    ctx.fillText(gun.name, gun.x - 28, gun.y - 30);

    for (let i = 0; i < MAX_LINKS_PER_GUN; i += 1) {
      const linkX = gun.x - 36 - i * 11;
      const link = gun.links[i];
      if (!link) {
        ctx.fillStyle = "rgba(79,99,128,0.28)";
      } else if (link.isBuffed()) {
        ctx.fillStyle = link.color;
      } else {
        ctx.fillStyle = "#6d90ad";
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
  ctx.strokeStyle = "rgba(120,230,255,0.26)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, w.r, w.angleMin, w.angleMax);
  ctx.stroke();

  ctx.strokeStyle = hpRatio > 0.35 ? "#78f5d0" : "#ffad8a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, w.r, w.angleMin, w.angleMin + (w.angleMax - w.angleMin) * hpRatio);
  ctx.stroke();

  ctx.strokeStyle = "rgba(173,241,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(w.cx, w.cy, w.r + 10, w.angleMin, w.angleMax);
  ctx.stroke();
}

function drawPuddles() {
  for (const puddle of world.puddles) {
    ctx.beginPath();
    ctx.arc(puddle.x, puddle.y, puddle.radius, 0, Math.PI * 2);
    if (puddle.ignited) {
      ctx.fillStyle = "rgba(255,138,70,0.30)";
      ctx.strokeStyle = "rgba(255,212,110,0.62)";
    } else {
      ctx.fillStyle = "rgba(34,41,58,0.34)";
      ctx.strokeStyle = "rgba(110,126,162,0.48)";
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
    ctx.fillStyle = "rgba(14,29,46,0.95)";
    ctx.fillRect(enemy.x - hpW / 2, enemy.y - enemy.radius - 10, hpW, 4);
    ctx.fillStyle = enemy.freezeStacks > 0 ? "#8bd9ff" : "#7af3c7";
    ctx.fillRect(enemy.x - hpW / 2, enemy.y - enemy.radius - 10, hpW * hpPct, 4);

    if (enemy.isBoss) {
      ctx.fillStyle = "#f2dfff";
      ctx.font = "700 10px Space Grotesk";
      ctx.fillText("BOSS", enemy.x - 14, enemy.y + 3);
    }
  });
}

function drawBeamsAndParticles() {
  world.beams.forEach((beam) => {
    const color = beam.color || (beam.crit ? "rgba(255,224,110,0.96)" : "rgba(118,221,255,0.92)");
    ctx.strokeStyle = color;
    ctx.lineWidth = beam.crit ? 3.8 : 2.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = beam.crit ? 14 : 9;
    ctx.beginPath();
    ctx.moveTo(beam.x1, beam.y1);
    ctx.lineTo(beam.x2, beam.y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
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
  wallGroup: null,
  wallCoreMesh: null,
  wallFrameMesh: null,
  wallScanRings: [],
  wallEnergyCore: null,
  wallBaseZ: -30,
  wallDomeRadius: 210,
  gunMeshes: [],
  enemyMeshes: new Map(),
  raycaster: null,
  pointerNdc: null,
  staticBeamGroup: null,
  dynamicBeamGroup: null,
  engineLensLine: null,
  lensGunLines: [],
  engineLensBeam: null,
  lensGunBeams: [],
  zoneGroup: null,
  enemyInfoGroup: null,
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

function clearThreeGroup(group) {
  if (!group) return;
  while (group.children.length > 0) {
    const obj = group.children.pop();
    group.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material?.dispose) obj.material.dispose();
  }
}

function makeThreeLine(points, color, opacity = 0.4, closed = false) {
  const THREE = window.THREE;
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
  });
  return closed ? new THREE.LineLoop(geometry, mat) : new THREE.Line(geometry, mat);
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
  scene.background = new THREE.Color(0x020710);
  threeView.raycaster = new THREE.Raycaster();
  threeView.pointerNdc = new THREE.Vector2();

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
  const fieldMat = new THREE.MeshStandardMaterial({ color: 0x04080f, metalness: 0.08, roughness: 0.88 });
  const field = new THREE.Mesh(fieldGeo, fieldMat);
  field.position.z = -30;
  scene.add(field);
  const tableGrid = new THREE.GridHelper(world.width, 28, 0x2a89c8, 0x174c73);
  tableGrid.rotation.x = Math.PI / 2;
  tableGrid.position.z = -29;
  tableGrid.material.transparent = true;
  tableGrid.material.opacity = 0.28;
  scene.add(tableGrid);

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

  const domeRadius = world.wall.r;
  const wall = new THREE.Mesh(
    new THREE.SphereGeometry(domeRadius, 52, 28, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x79e8ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wall.rotation.x = Math.PI / 2;

  const wallFrame = new THREE.Mesh(
    new THREE.SphereGeometry(domeRadius + 4, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xb7f6ff,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    })
  );
  wallFrame.rotation.x = Math.PI / 2;

  const wallEnergyCore = new THREE.Mesh(
    new THREE.SphereGeometry(14, 22, 22),
    new THREE.MeshBasicMaterial({
      color: 0x9ff3ff,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    })
  );
  wallEnergyCore.position.z = 14;

  const wallGroup = new THREE.Group();
  wallGroup.add(wallFrame);
  wallGroup.add(wall);
  wallGroup.add(wallEnergyCore);
  scene.add(wallGroup);

  const wallScanRings = [];
  for (let i = 0; i < 8; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1.04, 56),
      new THREE.MeshBasicMaterial({
        color: 0x9befff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    wallGroup.add(ring);
    wallScanRings.push(ring);
  }

  const baseRing = new THREE.Mesh(
    new THREE.RingGeometry(domeRadius - 5, domeRadius, 84),
    new THREE.MeshBasicMaterial({
      color: 0x8be7ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  wallGroup.add(baseRing);

  const staticBeamGroup = new THREE.Group();
  scene.add(staticBeamGroup);
  const dynamicBeamGroup = new THREE.Group();
  scene.add(dynamicBeamGroup);
  const zoneGroup = new THREE.Group();
  scene.add(zoneGroup);
  const enemyInfoGroup = new THREE.Group();
  scene.add(enemyInfoGroup);

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

  const gunMeshes = world.guns.map((_, idx) => {
    const group = new THREE.Group();
    group.userData.gunIndex = idx;
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
  threeView.wallGroup = wallGroup;
  threeView.wallCoreMesh = wall;
  threeView.wallFrameMesh = wallFrame;
  threeView.wallScanRings = wallScanRings;
  threeView.wallEnergyCore = wallEnergyCore;
  threeView.wallBaseZ = -30;
  threeView.wallDomeRadius = domeRadius;
  threeView.gunMeshes = gunMeshes;
  threeView.staticBeamGroup = staticBeamGroup;
  threeView.dynamicBeamGroup = dynamicBeamGroup;
  threeView.engineLensLine = engineLensLine;
  threeView.lensGunLines = lensGunLines;
  threeView.engineLensBeam = engineLensBeam;
  threeView.lensGunBeams = lensGunBeams;
  threeView.zoneGroup = zoneGroup;
  threeView.enemyInfoGroup = enemyInfoGroup;
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

  const wallPos = worldToThree(world.wall.cx, world.wall.cy, threeView.wallBaseZ);
  if (threeView.wallGroup) {
    threeView.wallGroup.position.copy(wallPos);
  }
  const wallHpRatio = Math.max(0, Math.min(1, state.wallHp / WALL_HP_MAX));
  if (threeView.wallCoreMesh?.material) {
    const pulse = 0.82 + Math.sin(now * 0.011) * 0.18;
    threeView.wallCoreMesh.material.opacity = 0.12 + wallHpRatio * 0.24 * pulse;
    threeView.wallCoreMesh.material.color.setHex(wallHpRatio < 0.35 ? 0xff8f7a : wallHpRatio < 0.65 ? 0x7fe9ff : 0x79e8ff);
  }
  if (threeView.wallFrameMesh?.material) {
    threeView.wallFrameMesh.material.opacity = 0.05 + wallHpRatio * 0.14;
  }
  if (threeView.wallEnergyCore?.material) {
    const corePulse = 0.78 + Math.sin(now * 0.017) * 0.22;
    threeView.wallEnergyCore.material.opacity = 0.35 + wallHpRatio * 0.55 * corePulse;
    threeView.wallEnergyCore.material.color.setHex(wallHpRatio < 0.35 ? 0xffb08f : 0x9ff3ff);
  }
  const zMin = 10;
  const zMax = threeView.wallDomeRadius - 8;
  const travel = zMax - zMin;
  threeView.wallScanRings.forEach((bar, idx) => {
    const t = ((now * 0.00032 + idx * 0.12) % 1 + 1) % 1;
    const z = zMin + t * travel;
    const ringR = Math.max(10, Math.sqrt(Math.max(0, threeView.wallDomeRadius ** 2 - z ** 2)));
    bar.position.set(0, 0, z);
    bar.scale.set(ringR, ringR, 1);
    if (bar.material) bar.material.opacity = (0.08 + wallHpRatio * 0.22) * (0.7 + Math.sin(now * 0.006 + idx) * 0.3);
  });

  world.guns.forEach((gun, idx) => {
    const mesh = threeView.gunMeshes[idx];
    if (!mesh) return;
    const line = threeView.lensGunLines[idx];
    const rod = threeView.lensGunBeams[idx];
    if (!gun.installed) {
      mesh.visible = false;
      if (line) line.visible = false;
      if (rod) rod.visible = false;
      return;
    }
    mesh.visible = true;
    if (line) line.visible = true;
    if (rod) rod.visible = true;
    const p = worldToThree(gun.x, gun.y, 10);
    mesh.position.copy(p);
    if (line) line.geometry.setFromPoints([lPos.clone(), p.clone()]);
    if (rod) placeBeamRod(rod, lPos, p);
    const pulse = isGunSelected(idx) ? 1.2 : 1;
    mesh.scale.set(pulse, pulse, pulse);
    const target = pickGunTarget(gun);
    const targetAngle = target ? -Math.atan2(target.y - gun.y, target.x - gun.x) : 0;
    const currentAngle = mesh.rotation.z || 0;
    mesh.rotation.z = currentAngle + (targetAngle - currentAngle) * 0.22;
    if (mesh.userData.core?.material) {
      mesh.userData.core.material.emissiveIntensity = isGunSelected(idx) ? 1.35 : 0.9;
    }
  });

  clearThreeGroup(threeView.zoneGroup);
  for (const gun of getInstalledGuns()) {
    const points = [];
    if (gun.attackMode === "sniper") {
      const xEnd = world.width;
      points.push(worldToThree(gun.x, gun.y - 8, 12));
      points.push(worldToThree(xEnd, gun.y - gun.verticalBand / 2, 12));
      points.push(worldToThree(xEnd, gun.y + gun.verticalBand / 2, 12));
      points.push(worldToThree(gun.x, gun.y + 8, 12));
      threeView.zoneGroup.add(makeThreeLine(points, 0x77d7ff, 0.36, true));
    } else if (gun.attackMode === "shotgun") {
      const halfAngle = ((gun.shotgunSpread || 120) * Math.PI) / 360;
      const x2 = gun.x + gun.range;
      const yTop = gun.y - Math.tan(halfAngle) * gun.range;
      const yBottom = gun.y + Math.tan(halfAngle) * gun.range;
      points.push(worldToThree(gun.x, gun.y, 12));
      points.push(worldToThree(x2, yTop, 12));
      points.push(worldToThree(x2, yBottom, 12));
      threeView.zoneGroup.add(makeThreeLine(points, 0x7ecbff, 0.3, true));
    } else {
      const steps = 44;
      for (let i = 0; i < steps; i += 1) {
        const a = (Math.PI * 2 * i) / steps;
        points.push(worldToThree(gun.x + Math.cos(a) * gun.range, gun.y + Math.sin(a) * gun.range, 12));
      }
      threeView.zoneGroup.add(makeThreeLine(points, 0x6fc2ff, 0.24, true));
    }
  }

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

  clearThreeGroup(threeView.enemyInfoGroup);
  for (const enemy of world.enemies) {
    if (!enemy.alive()) continue;
    const y = enemy.y - enemy.radius - 14;
    const half = enemy.isBoss ? 27 : 14;
    const hpPct = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
    const bgL = makeThreeLine(
      [worldToThree(enemy.x - half, y, 20), worldToThree(enemy.x + half, y, 20)],
      0x23364a,
      0.92,
      false
    );
    const fgColor = enemy.freezeStacks > 0 ? 0x8fdfff : enemy.burnStacks > 0 ? 0xffcf86 : 0x7ef5c5;
    const fgL = makeThreeLine(
      [worldToThree(enemy.x - half, y, 21), worldToThree(enemy.x - half + half * 2 * hpPct, y, 21)],
      fgColor,
      0.98,
      false
    );
    threeView.enemyInfoGroup.add(bgL);
    threeView.enemyInfoGroup.add(fgL);

    if (enemy.burnStacks > 0 || enemy.freezeStacks > 0) {
      const statusPoints = [];
      const ringR = enemy.radius + 5;
      const ringSteps = 20;
      for (let i = 0; i < ringSteps; i += 1) {
        const a = (Math.PI * 2 * i) / ringSteps;
        statusPoints.push(worldToThree(enemy.x + Math.cos(a) * ringR, enemy.y + Math.sin(a) * ringR, 16));
      }
      if (enemy.burnStacks > 0) {
        threeView.enemyInfoGroup.add(makeThreeLine(statusPoints, 0xffa45e, 0.85, true));
      }
      if (enemy.freezeStacks > 0) {
        const inner = statusPoints.map((p) => p.clone().multiplyScalar(0.998));
        threeView.enemyInfoGroup.add(makeThreeLine(inner, 0x87d9ff, 0.9, true));
      }
    }
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
  if (!state.threeMode) {
    threeView.orbit.dragging = false;
    threeView.orbit.pointerId = null;
  }
  if (ui.threeLayer) ui.threeLayer.style.pointerEvents = state.threeMode ? "auto" : "none";
  resizeThreeView();
  updateHud();
}

function onThreePointerDown(event) {
  if (!state.threeMode || !threeView.ready) return;
  if (event.button !== 0) return;
  event.preventDefault();
  const hitIdx = pickGunIndexAtThreeEvent(event);
  const point = getThreePointerWorldPoint(event);
  const pointerAngle = point ? pointToWallAngle(point.worldX, point.worldY) : 0;

  if (hitIdx >= 0) {
    if (event.shiftKey) {
      toggleGunSelection(hitIdx);
      updateHud();
    } else {
      if (!isGunSelected(hitIdx) || state.selectedGunIndices.length <= 1) {
        setSelectedGuns([hitIdx], hitIdx);
      } else {
        setSelectedGuns(state.selectedGunIndices, hitIdx);
      }
      beginGroupDrag(hitIdx, pointerAngle);
      updateHud();
    }
    threeView.orbit.dragging = false;
    threeView.orbit.pointerId = event.pointerId;
    ui.threeLayer.setPointerCapture?.(event.pointerId);
    return;
  }

  if (!event.shiftKey) {
    setSelectedGuns([]);
    updateHud();
  }
  threeView.orbit.dragging = true;
  threeView.orbit.pointerId = event.pointerId;
  threeView.orbit.lastX = event.clientX;
  threeView.orbit.lastY = event.clientY;
  ui.threeLayer.setPointerCapture?.(event.pointerId);
}

function onThreePointerMove(event) {
  const o = threeView.orbit;
  if (!state.threeMode) return;
  if (o.pointerId !== null && event.pointerId !== o.pointerId) return;
  if (state.draggingGroupIndices.length > 0) {
    event.preventDefault();
    const point = getThreePointerWorldPoint(event);
    if (point) applyGroupDrag(pointToWallAngle(point.worldX, point.worldY));
    return;
  }
  if (!o.dragging) return;
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
  endGroupDrag();
  ui.threeLayer.releasePointerCapture?.(event.pointerId);
}

function onThreeWheel(event) {
  if (!state.threeMode || !threeView.ready) return;
  event.preventDefault();
  const o = threeView.orbit;
  const next = o.radius * (1 + event.deltaY * 0.0012);
  o.radius = Math.max(560, Math.min(1500, next));
  updateThreeCameraFromOrbit();
}

function getThreePointerNdc(event) {
  if (!ui.threeLayer || !threeView.pointerNdc) return null;
  const rect = ui.threeLayer.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  threeView.pointerNdc.set(x, y);
  return threeView.pointerNdc;
}

function getGunIndexFromThreeObject(obj) {
  let cur = obj;
  while (cur) {
    if (typeof cur.userData?.gunIndex === "number") return cur.userData.gunIndex;
    cur = cur.parent;
  }
  return -1;
}

function pickGunIndexAtThreeEvent(event) {
  if (!threeView.ready || !threeView.raycaster) return -1;
  const ndc = getThreePointerNdc(event);
  if (!ndc) return -1;
  threeView.raycaster.setFromCamera(ndc, threeView.camera);
  const hits = threeView.raycaster.intersectObjects(threeView.gunMeshes, true);
  if (hits.length === 0) return -1;
  return getGunIndexFromThreeObject(hits[0].object);
}

function getThreePointerWorldPoint(event) {
  if (!threeView.ready || !threeView.raycaster) return null;
  const ndc = getThreePointerNdc(event);
  if (!ndc) return null;
  threeView.raycaster.setFromCamera(ndc, threeView.camera);
  const plane = new window.THREE.Plane(new window.THREE.Vector3(0, 0, 1), -10);
  const p = new window.THREE.Vector3();
  const hit = threeView.raycaster.ray.intersectPlane(plane, p);
  if (!hit) return null;
  return {
    worldX: p.x + world.width / 2,
    worldY: world.height / 2 - p.y,
  };
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
  if (!state.started || state.pausedByCards || state.userPaused || state.gameOver) return;
  updateKeyboardGunMove(dt);
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

function screenToWorld(clientX, clientY, preferThreeLayer = false) {
  const rect =
    preferThreeLayer && ui.threeLayer
      ? ui.threeLayer.getBoundingClientRect()
      : canvas.getBoundingClientRect();
  const sx = LOGICAL_WIDTH / rect.width;
  const sy = LOGICAL_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

function canvasToWorld(event) {
  return screenToWorld(event.clientX, event.clientY, false);
}

function pickGunIndexAt(x, y) {
  let hit = -1;
  world.guns.forEach((gun, idx) => {
    if (!gun.installed) return;
    if (Math.hypot(gun.x - x, gun.y - y) <= 24) hit = idx;
  });
  return hit;
}

function beginGroupDrag(anchorIdx, pointerAngle) {
  if (anchorIdx < 0 || anchorIdx >= world.guns.length) return;
  const group =
    isGunSelected(anchorIdx) && state.selectedGunIndices.length > 1
      ? [...state.selectedGunIndices]
      : [anchorIdx];
  state.draggingGroupIndices = group;
  state.draggingGroupBaseYs = group.map((idx) => world.guns[idx].wallAngle ?? pointToWallAngle(world.guns[idx].x, world.guns[idx].y));
  state.dragGroupStartY = pointerAngle;
}

function applyGroupDrag(pointerAngle) {
  if (state.draggingGroupIndices.length === 0) return;
  const minBase = Math.min(...state.draggingGroupBaseYs);
  const maxBase = Math.max(...state.draggingGroupBaseYs);
  const wantedDelta = pointerAngle - state.dragGroupStartY;
  const deltaMin = world.wall.angleMin - minBase;
  const deltaMax = world.wall.angleMax - maxBase;
  const appliedDelta = Math.max(deltaMin, Math.min(deltaMax, wantedDelta));

  state.draggingGroupIndices.forEach((idx, i) => {
    const gun = world.guns[idx];
    setGunOnWallByAngle(gun, state.draggingGroupBaseYs[i] + appliedDelta);
  });
}

function endGroupDrag() {
  state.draggingGroupIndices = [];
  state.draggingGroupBaseYs = [];
}

function onCanvasMouseDown(event) {
  audioFx.unlock();
  const { x, y } = canvasToWorld(event);
  const hitIdx = pickGunIndexAt(x, y);
  if (hitIdx < 0) {
    if (!event.shiftKey) setSelectedGuns([]);
    updateHud();
    return;
  }

  if (event.shiftKey) {
    toggleGunSelection(hitIdx);
    updateHud();
    return;
  }

  if (!isGunSelected(hitIdx) || state.selectedGunIndices.length <= 1) {
    setSelectedGuns([hitIdx], hitIdx);
  } else {
    setSelectedGuns(state.selectedGunIndices, hitIdx);
  }
  beginGroupDrag(hitIdx, pointToWallAngle(x, y));
  updateHud();
}

function onCanvasMouseMove(event) {
  if (state.draggingGroupIndices.length === 0) return;
  const { x, y } = canvasToWorld(event);
  applyGroupDrag(pointToWallAngle(x, y));
  state.skipNextCanvasClick = true;
}

function onCanvasMouseUp() {
  endGroupDrag();
}

function onCanvasClick(event) {
  if (event.shiftKey) return;
  if (state.skipNextCanvasClick) {
    state.skipNextCanvasClick = false;
    return;
  }
  const { x, y } = canvasToWorld(event);
  const hitIdx = pickGunIndexAt(x, y);
  if (hitIdx < 0) return;
  const gun = world.guns[hitIdx];
  if (!gun?.installed) return;
  setSelectedGuns([hitIdx], hitIdx);
  updateHud();
}

function getTouchPoint(touchEvent) {
  const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0];
  return { clientX: touch.clientX, clientY: touch.clientY };
}

function onCanvasTouchStart(event) {
  event.preventDefault();
  audioFx.unlock();
  const { x, y } = canvasToWorld(getTouchPoint(event));
  const hitIdx = pickGunIndexAt(x, y);
  if (hitIdx < 0) {
    setSelectedGuns([]);
    updateHud();
    return;
  }
  if (!isGunSelected(hitIdx) || state.selectedGunIndices.length <= 1) {
    setSelectedGuns([hitIdx], hitIdx);
  } else {
    setSelectedGuns(state.selectedGunIndices, hitIdx);
  }
  beginGroupDrag(hitIdx, pointToWallAngle(x, y));
  updateHud();
}

function onCanvasTouchMove(event) {
  event.preventDefault();
  if (state.draggingGroupIndices.length === 0) return;
  const { x, y } = canvasToWorld(getTouchPoint(event));
  applyGroupDrag(pointToWallAngle(x, y));
}

function onCanvasTouchEnd(event) {
  event.preventDefault();
  endGroupDrag();
}

function onGunStripPointerDown(event) {
  audioFx.unlock();
  const profileBtn = event.target.closest(".js-profile-select");
  if (profileBtn && ui.gunStrip?.contains(profileBtn)) {
    event.preventDefault();
    audioFx.uiTap();
    const idx = Number(profileBtn.getAttribute("data-idx"));
    const profile = profileBtn.getAttribute("data-profile");
    const gun = world.guns[idx];
    if (!gun?.installed || !profile) return;
    gun.chooseAttackProfile(profile);
    const profileMeta = profileOptions().find((item) => item.profile === profile);
    logLine(`${gun.name}: профиль "${profileMeta?.name || profile}".`);
    updateHud();
    return;
  }

  const slotBtn = event.target.closest(".js-slot");
  if (slotBtn && ui.gunStrip?.contains(slotBtn)) {
    event.preventDefault();
    audioFx.uiTap();
    const idx = Number(slotBtn.getAttribute("data-idx"));
    const gun = world.guns[idx];
    if (!gun) return;
    if (gun.installed) removeGun(idx);
    else installGun(idx);
    updateHud();
  }
}

function onModalGunStripPointerDown(event) {
  const pickCard = event.target.closest(".gun-pill.pickable");
  if (pickCard && ui.modalGunStrip?.contains(pickCard)) {
    event.preventDefault();
    audioFx.cardPick();
    const idx = Number(pickCard.dataset.idx);
    const target = state.modalTargetPick;
    const gun = world.guns[idx];
    if (!target || !gun) return;
    if (!target.gunIndices.includes(idx)) return;
    target.onPick(gun);
    closeCardModal();
  }
}

function updateKeyboardGunMove(dt) {
  if (state.draggingGroupIndices.length > 0) return;
  const idx = state.selectedGunIndex;
  const gun = idx >= 0 ? world.guns[idx] : null;
  if (!gun?.installed) return;

  const direction = (state.moveGunDownHeld ? 1 : 0) - (state.moveGunUpHeld ? 1 : 0);
  if (direction === 0) return;

  const angularSpeed = 1.55;
  setGunOnWallByAngle(gun, (gun.wallAngle ?? pointToWallAngle(gun.x, gun.y)) + direction * angularSpeed * dt);
}

function onWindowKeyDown(event) {
  if (event.defaultPrevented) return;
  if (state.gameOver || state.pausedByCards) return;
  audioFx.unlock();
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

  if (event.code === "Tab") {
    event.preventDefault();
    audioFx.uiTap();
    cycleSelectedGun(event.shiftKey ? -1 : 1);
    updateHud();
    return;
  }

  if (event.code === "KeyW") {
    event.preventDefault();
    state.moveGunUpHeld = true;
    return;
  }

  if (event.code === "KeyS") {
    event.preventDefault();
    state.moveGunDownHeld = true;
    return;
  }

  let profile = null;
  if (event.code === "Digit1" || event.code === "Numpad1") profile = "circular";
  if (event.code === "Digit2" || event.code === "Numpad2") profile = "sniper";
  if (event.code === "Digit3" || event.code === "Numpad3") profile = "shotgun";
  if (!profile) return;

  const idx = state.selectedGunIndex;
  const gun = idx >= 0 ? world.guns[idx] : null;
  if (!gun?.installed) return;
  if (gun.profile === profile) return;

  event.preventDefault();
  gun.chooseAttackProfile(profile);
  const profileMeta = profileOptions().find((item) => item.profile === profile);
  logLine(`${gun.name}: профиль "${profileMeta?.name || profile}" (клавиша ${event.code.endsWith("1") ? "1" : event.code.endsWith("2") ? "2" : "3"}).`);
  updateHud();
}

function onWindowKeyUp(event) {
  if (event.code === "KeyW") {
    state.moveGunUpHeld = false;
    return;
  }
  if (event.code === "KeyS") {
    state.moveGunDownHeld = false;
  }
}

function startGame() {
  if (state.started) return;
  state.started = true;
  if (ui.startOverlay) ui.startOverlay.classList.add("hidden");
  audioFx.enabled = state.soundEnabled;
  audioFx.musicEnabled = state.musicEnabled;
  audioFx.unlock();
  if (state.musicEnabled) audioFx.startMusic();
  if (state.soundEnabled) audioFx.cardOpen();
  beginWave(1);
  logLine("Старт TD: монстры двигаются справа налево к стене.");
  updateHud();
}

function init() {
  initializeGunSlots();
  state.soundEnabled = loadSoundPreference();
  state.musicEnabled = loadMusicPreference();
  audioFx.enabled = state.soundEnabled;
  audioFx.musicEnabled = state.musicEnabled;
  setupCanvasForDpr();
  window.addEventListener("resize", setupCanvasForDpr);
  window.addEventListener("keydown", onWindowKeyDown);
  window.addEventListener("keyup", onWindowKeyUp);
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
  if (ui.gunStrip) ui.gunStrip.addEventListener("pointerdown", onGunStripPointerDown);
  if (ui.modalGunStrip) ui.modalGunStrip.addEventListener("pointerdown", onModalGunStripPointerDown);
  if (ui.startGameBtn) {
    ui.startGameBtn.addEventListener("click", () => {
      audioFx.unlock();
      startGame();
    });
  }
  ui.restartBtn.addEventListener("click", () => {
    window.location.reload();
  });
  if (ui.helpBtn) ui.helpBtn.addEventListener("click", openHelpModal);
  if (ui.helpCloseBtn) ui.helpCloseBtn.addEventListener("click", closeHelpModal);
  if (ui.helpModal) {
    ui.helpModal.addEventListener("click", (event) => {
      if (event.target === ui.helpModal) closeHelpModal();
    });
  }
  if (ui.cardsInfoBtn) ui.cardsInfoBtn.addEventListener("click", openCardsInfoModal);
  if (ui.cardsInfoCloseBtn) ui.cardsInfoCloseBtn.addEventListener("click", closeCardsInfoModal);
  if (ui.cardsInfoModal) {
    ui.cardsInfoModal.addEventListener("click", (event) => {
      if (event.target === ui.cardsInfoModal) closeCardsInfoModal();
    });
  }
  if (ui.pauseBtn) {
    ui.pauseBtn.addEventListener("click", () => {
      audioFx.uiTap();
      if (state.gameOver) return;
      state.userPaused = !state.userPaused;
      updateHud();
    });
  }
  if (ui.soundBtn) {
    ui.soundBtn.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      audioFx.enabled = state.soundEnabled;
      saveSoundPreference(state.soundEnabled);
      if (state.soundEnabled) {
        audioFx.unlock();
        audioFx.uiTap();
      }
      updateHud();
    });
  }
  if (ui.musicBtn) {
    ui.musicBtn.addEventListener("click", () => {
      state.musicEnabled = !state.musicEnabled;
      audioFx.musicEnabled = state.musicEnabled;
      saveMusicPreference(state.musicEnabled);
      if (state.musicEnabled) {
        audioFx.unlock();
        if (state.started) audioFx.startMusic();
        if (state.soundEnabled) audioFx.uiTap();
      } else {
        audioFx.stopMusic();
      }
      updateHud();
    });
  }
  if (ui.threeModeBtn) {
    ui.threeModeBtn.addEventListener("click", () => {
      audioFx.uiTap();
      if (!window.THREE) {
        logLine("3D режим недоступен: three.js не загружен.");
        return;
      }
      setThreeMode(!state.threeMode);
    });
  }
  if (ui.threeLayer) {
    ui.threeLayer.addEventListener("pointerdown", onThreePointerDown);
    ui.threeLayer.addEventListener("pointermove", onThreePointerMove);
    ui.threeLayer.addEventListener("pointerup", onThreePointerUp);
    ui.threeLayer.addEventListener("pointercancel", onThreePointerUp);
    ui.threeLayer.addEventListener("wheel", onThreeWheel, { passive: false });
  }
  if (ui.startOverlay) ui.startOverlay.classList.toggle("hidden", state.started);
  requestAnimationFrame((t) => {
    state.lastTime = t;
    frame(t);
  });
}

init();
