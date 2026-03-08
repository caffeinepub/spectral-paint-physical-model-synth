/**
 * SpectralPaintProcessor - Karplus-Strong based physical model resonator
 * 
 * Architecture: Column-scanning excitation engine
 * - Canvas is scanned column-by-column during playback
 * - Each column's pixel data is analyzed for harmonic energy
 * - Excitation events fire ONLY on energy transitions (rise above threshold)
 * - Resonator handles natural decay; no continuous driving except drone mode
 * 
 * Key Karplus-Strong formula:
 *   y[n] = feedback * lowpass(y[n - delayLength])
 *   lowpass: one-pole:  y_lp[n] = (1-a)*y[n] + a*y_lp[n-1]
 *     where a = brightCoeff controls tone (higher a = darker/more filtered)
 *   feedback = feedbackCoeff (close to 1.0 for long sustain)
 *
 * For pluck sounds: ADSR sustain=0, short decay → voice auto-releases
 * For drone sounds: sustainEnergy injects noise to keep loop alive
 */
class SpectralPaintProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'tension', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'damping', defaultValue: 0.3, minValue: 0, maxValue: 1 },
      { name: 'resonance', defaultValue: 0.6, minValue: 0, maxValue: 1 },
      { name: 'decayTime', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'brightness', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'sustainEnergy', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'pickupPosition', defaultValue: 0.5, minValue: 0, maxValue: 1 },
      { name: 'resonatorMorph', defaultValue: 0, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();

    this.SAMPLE_RATE = sampleRate;
    this.MAX_VOICES = 8;
    this.DELAY_BUFFER_SIZE = 8192;
    this.BINS = 64;
    this.CONTROL_RATE = 128;
    this.controlCounter = 0;

    // Pre-allocate all voice buffers — NO dynamic allocation during playback
    this.voices = [];
    for (let i = 0; i < this.MAX_VOICES; i++) {
      const voice = {
        delayBufferL: new Float32Array(this.DELAY_BUFFER_SIZE),
        delayBufferR: new Float32Array(this.DELAY_BUFFER_SIZE),
        writePos: 0,
        delayLength: 200,
        feedbackCoeff: 0.995,
        lpStateL: 0,   // one-pole lowpass state L
        lpStateR: 0,   // one-pole lowpass state R
        active: false,
        age: 0,
        pan: 0,
        excitationType: 0,
        bqx1L: 0, bqx2L: 0, bqy1L: 0, bqy2L: 0,  // biquad filter state L
        bqx1R: 0, bqx2R: 0, bqy1R: 0, bqy2R: 0,  // biquad filter state R
        bqb0: 1, bqb1: 0, bqb2: 0, bqa1: 0, bqa2: 0,
        bodyY1L: 0, bodyY2L: 0,
        bodyY1R: 0, bodyY2R: 0,
        bodyB0: 1, bodyB1: 0, bodyB2: 0, bodyA1: 0, bodyA2: 0,
        adsrPhase: 4,   // 0=attack, 1=decay, 2=sustain, 3=release, 4=idle
        adsrLevel: 0,
        adsrAttack: 0.01,
        adsrDecay: 0.1,
        adsrSustain: 0.7,
        adsrRelease: 0.3,
        // Auto-release timer for pluck/percussive sounds (0 = never auto-release)
        autoReleaseSamples: 0,
        autoReleaseCounter: 0,
        driftPhase: Math.random() * Math.PI * 2,
        driftRate: 0.3 + Math.random() * 0.5,
        driftAmount: 0,
        amplitude: 1.0,
        note: 0,
      };
      this.voices.push(voice);
    }

    // Pre-allocated scratch buffers
    this.mixL = new Float32Array(128);
    this.mixR = new Float32Array(128);

    // Column excitation system — pre-allocated, no dynamic allocation
    this.harmonicEnergy = new Float32Array(this.BINS);       // current column
    this.prevHarmonicEnergy = new Float32Array(this.BINS);    // previous column
    this.smoothedHarmonics = new Float32Array(this.BINS);     // interpolated
    this.columnTotalEnergy = 0;
    this.prevColumnTotalEnergy = 0;
    this.energyThreshold = 0.15;
    this.amplitudeGain = 1.5;
    this.amplitudeFloor = 0.05;
    this.impulseWidth = 0.5;
    this.playheadFrac = 0;
    this.resonatorInputLevel = 0;

    // Effects: Chorus
    this.chorusEnabled = false;
    this.chorusMix = 0.3;
    this.chorusBufL = new Float32Array(8192);
    this.chorusBufR = new Float32Array(8192);
    this.chorusWritePos = 0;
    this.chorusLfoPhase = 0;
    this.chorusRate = 0.5;
    this.chorusDepth = 0.003;
    this.chorusDelay = 0.015;

    // Effects: Delay
    this.delayEnabled = false;
    this.delayMix = 0.3;
    this.delayBufL = new Float32Array(65536);
    this.delayBufR = new Float32Array(65536);
    this.delayWritePos = 0;
    this.delayLength = Math.floor(0.35 * sampleRate);
    this.delayFeedback = 0.4;

    // Effects: Reverb (Schroeder: 4 comb + 2 allpass) — pre-allocated
    this.reverbEnabled = false;
    this.reverbMix = 0.3;
    const combLens = [1557, 1617, 1491, 1422];
    const apLens = [225, 556];
    this.reverbCombBufL = combLens.map(l => new Float32Array(l));
    this.reverbCombBufR = combLens.map(l => new Float32Array(l + 23));
    this.reverbCombPosL = new Int32Array(4);
    this.reverbCombPosR = new Int32Array(4);
    this.reverbCombFb = new Float32Array([0.805, 0.827, 0.783, 0.764]);
    this.reverbCombDamp = new Float32Array(4).fill(0.2);
    this.reverbCombStoreL = new Float32Array(4);
    this.reverbCombStoreR = new Float32Array(4);
    this.reverbApBufL = apLens.map(l => new Float32Array(l));
    this.reverbApBufR = apLens.map(l => new Float32Array(l));
    this.reverbApPosL = new Int32Array(2);
    this.reverbApPosR = new Int32Array(2);

    // LFO state
    this.lfoPhase = 0;
    this.lfoRate = 1.0;
    this.lfoDepth = 0;
    this.lfoWave = 0;
    this.lfoTarget = 0;
    this.lfoValue = 0;
    this.lfoRandPrev = 0;
    this.lfoRandNext = 0;
    this.lfoRandCounter = 0;
    this.lfoRandPeriod = Math.floor(sampleRate / 4);

    // Params cache
    this.params = {
      tension: 0.5,
      damping: 0.3,
      resonance: 0.6,
      decayTime: 0.5,
      brightness: 0.5,
      sustainEnergy: 0,
      pickupPosition: 0.5,
      resonatorMorph: 0,
      filterType: 0,
      filterCutoff: 0.7,
      filterResonance: 0.3,
      filterDrive: 0,
      bodyModel: 0,
      bodySize: 0.5,
      bodyMix: 0,
      driftAmount: 0,
      driftRate: 0.3,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.7,
      release: 0.3,
      excitationEnergy: 0.8,
      attackSharpness: 0.5,
      energyThreshold: 0.15,
      amplitudeGain: 1.5,
      amplitudeFloor: 0.05,
      impulseWidth: 0.5,
      energyCompressor: 0,
    };

    this.samplesSinceExcitation = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'setCanvasColumn') {
        this._receiveColumnData(msg.harmonicEnergy, msg.playheadFrac, msg.dominantHue, msg.panSpread);
      } else if (msg.type === 'triggerVoice') {
        this._triggerVoice(msg.bins, msg.pan, msg.excitationType, msg.amplitude, msg.note);
      } else if (msg.type === 'stopAll') {
        for (let i = 0; i < this.MAX_VOICES; i++) {
          this.voices[i].active = false;
          this.voices[i].adsrPhase = 4;
        }
        this.prevColumnTotalEnergy = 0;
        this.columnTotalEnergy = 0;
      } else if (msg.type === 'updateParams') {
        Object.assign(this.params, msg.params);
        if (msg.params.energyThreshold !== undefined) this.energyThreshold = msg.params.energyThreshold;
        if (msg.params.amplitudeGain !== undefined) this.amplitudeGain = msg.params.amplitudeGain;
        if (msg.params.amplitudeFloor !== undefined) this.amplitudeFloor = msg.params.amplitudeFloor;
        if (msg.params.impulseWidth !== undefined) this.impulseWidth = msg.params.impulseWidth;
        this._updateFilters();
      } else if (msg.type === 'setEffect') {
        if (msg.name === 'chorus') {
          this.chorusEnabled = msg.enabled;
          this.chorusMix = msg.mix;
        } else if (msg.name === 'delay') {
          this.delayEnabled = msg.enabled;
          this.delayMix = msg.mix;
        } else if (msg.name === 'reverb') {
          this.reverbEnabled = msg.enabled;
          this.reverbMix = msg.mix;
        }
      }
    };
  }

  _receiveColumnData(harmonicEnergyIn, playheadFrac, dominantHue, panSpread) {
    const bins = Math.min(harmonicEnergyIn.length, this.BINS);

    this.prevHarmonicEnergy.set(this.harmonicEnergy);
    this.prevColumnTotalEnergy = this.columnTotalEnergy;
    this.playheadFrac = playheadFrac || 0;

    let maxE = 0;
    for (let b = 0; b < bins; b++) {
      let e = harmonicEnergyIn[b] * this.amplitudeGain;
      if (e > 0.001 && e < this.amplitudeFloor) e = this.amplitudeFloor;
      this.harmonicEnergy[b] = e;
      if (e > maxE) maxE = e;
    }
    for (let b = bins; b < this.BINS; b++) this.harmonicEnergy[b] = 0;

    if (maxE > 1.0) {
      const inv = 1.0 / maxE;
      for (let b = 0; b < this.BINS; b++) this.harmonicEnergy[b] *= inv;
    }

    if (this.params.energyCompressor > 0) {
      const comp = 1.0 - this.params.energyCompressor * 0.7;
      for (let b = 0; b < this.BINS; b++) {
        if (this.harmonicEnergy[b] > 0.001) {
          this.harmonicEnergy[b] = Math.pow(this.harmonicEnergy[b], comp);
        }
      }
    }

    let total = 0;
    for (let b = 0; b < this.BINS; b++) total += this.harmonicEnergy[b];
    this.columnTotalEnergy = total / this.BINS;

    const frac = Math.max(0, Math.min(1, playheadFrac));
    for (let b = 0; b < this.BINS; b++) {
      this.smoothedHarmonics[b] = this.prevHarmonicEnergy[b] * (1 - frac) + this.harmonicEnergy[b] * frac;
    }

    const threshold = Math.max(0.001, this.energyThreshold);
    const isAboveThreshold = this.columnTotalEnergy > threshold;
    const wasBelow = this.prevColumnTotalEnergy <= threshold;
    const minGapSamples = Math.floor(this.SAMPLE_RATE * 0.05);

    if (isAboveThreshold && wasBelow && this.samplesSinceExcitation > minGapSamples) {
      this._fireExcitation(dominantHue, panSpread);
      this.samplesSinceExcitation = 0;
      this.resonatorInputLevel = this.columnTotalEnergy;
      this.port.postMessage({ type: 'excitationEvent', energy: this.columnTotalEnergy });
    }

    if (this.params.sustainEnergy > 0.05) {
      this._updateDroneVoice();
    }
  }

  _fireExcitation(dominantHue, panSpread) {
    const excitationType = this._hueToExcitationType(dominantHue || 0);

    let maxE = 0;
    let maxBin = 16;
    for (let b = 0; b < this.BINS; b++) {
      if (this.smoothedHarmonics[b] > maxE) {
        maxE = this.smoothedHarmonics[b];
        maxBin = b;
      }
    }

    const note = Math.round((maxBin / this.BINS) * 36);
    const pan = (panSpread || 0) * (Math.random() * 2 - 1);

    const binsToSend = [];
    for (let b = 0; b < this.BINS; b++) {
      if (this.smoothedHarmonics[b] > 0.01) {
        binsToSend.push({ bin: b, amplitude: this.smoothedHarmonics[b], hue: dominantHue || 0 });
      }
    }

    this._triggerVoice(binsToSend, pan, excitationType, maxE * this.amplitudeGain, note);
  }

  _updateDroneVoice() {
    // Handled implicitly via sustainEnergy injection in process() loop
  }

  _hueToExcitationType(hue) {
    if (hue < 15 || hue >= 345) return 0;  // Red: pluck
    if (hue < 45) return 1;                  // Orange: strike
    if (hue < 90) return 2;                  // Yellow: brass/reed
    if (hue < 150) return 3;                 // Green: air/flute
    if (hue < 225) return 4;                 // Blue: bell
    if (hue < 285) return 5;                 // Purple: glass
    return 6;                                 // White/other: broadband
  }

  _findFreeVoice() {
    for (let i = 0; i < this.MAX_VOICES; i++) {
      if (!this.voices[i].active) return i;
    }
    // Steal oldest voice
    let oldest = 0;
    let maxAge = -1;
    for (let i = 0; i < this.MAX_VOICES; i++) {
      if (this.voices[i].age > maxAge) {
        maxAge = this.voices[i].age;
        oldest = i;
      }
    }
    return oldest;
  }

  _triggerVoice(bins, pan, excitationType, amplitude, note) {
    const idx = this._findFreeVoice();
    const v = this.voices[idx];

    v.delayBufferL.fill(0);
    v.delayBufferR.fill(0);
    v.lpStateL = 0;
    v.lpStateR = 0;
    v.writePos = 0;
    v.pan = pan || 0;
    v.excitationType = excitationType || 0;
    v.amplitude = Math.min(1.0, (amplitude || 1.0));
    v.note = note || 0;
    v.age = 0;
    v.active = true;
    v.adsrPhase = 0;
    v.adsrLevel = 0;
    v.bqx1L = 0; v.bqx2L = 0; v.bqy1L = 0; v.bqy2L = 0;
    v.bqx1R = 0; v.bqx2R = 0; v.bqy1R = 0; v.bqy2R = 0;
    v.bodyY1L = 0; v.bodyY2L = 0;
    v.bodyY1R = 0; v.bodyY2R = 0;

    // Map note to delay line length (frequency)
    // Base pitch range: 55 Hz (A1) to ~880 Hz, spread across 36 semitones
    const freq = 55 * Math.pow(2, (note + 24) / 12.0);
    const morphedFreq = freq * (1 + this.params.resonatorMorph * 0.5);
    const baseTension = 0.1 + this.params.tension * 0.9;
    v.delayLength = Math.max(4, Math.min(this.DELAY_BUFFER_SIZE - 2,
      Math.floor(this.SAMPLE_RATE / (morphedFreq * (0.5 + baseTension * 0.5)))
    ));

    // ── CORRECTED Karplus-Strong feedback coefficient ──────────────────────
    // feedbackCoeff: 0.0 = instant silence, 1.0 = infinite sustain
    // Map decayTime [0,1] → feedbackCoeff [0.90, 0.9998]
    // This gives clearly audible differences between short and long decay
    const decayFactor = 0.90 + this.params.decayTime * 0.0998;
    v.feedbackCoeff = decayFactor;

    // ── CORRECTED one-pole lowpass coefficient (brightness) ────────────────
    // brightCoeff is the FEEDBACK coefficient of the one-pole filter
    // 0 = allpass (bright), 1 = heavy lowpass (dark)
    // Map brightness [0,1] → lpCoeff [0.05, 0.70]
    // Higher brightness → lower lpCoeff (less filtering, brighter sound)
    v.lpCoeff = 0.70 - this.params.brightness * 0.65;

    // Auto-release: pluck/percussive types self-release based on ADSR decay
    // Sustain=0 voices release after decay + small hold time
    const isPercussive = (excitationType === 0 || excitationType === 1) && this.params.sustainEnergy < 0.1;
    if (isPercussive && this.params.sustain < 0.15) {
      // Auto-release after attack + decay + tiny hold
      const holdSec = 0.05;
      v.autoReleaseSamples = Math.floor((this.params.attack * 0.5 + this.params.decay + holdSec) * this.SAMPLE_RATE);
    } else {
      v.autoReleaseSamples = 0; // Manual release / drone modes
    }
    v.autoReleaseCounter = 0;

    this._generateExcitation(v, bins, excitationType);

    v.adsrAttack = Math.max(0.001, this.params.attack * 0.5);
    v.adsrDecay = Math.max(0.01, this.params.decay * 1.0);
    v.adsrSustain = this.params.sustain;
    v.adsrRelease = Math.max(0.01, this.params.release * 3.0);

    this._updateVoiceFilter(v);
    this._updateVoiceBody(v);
  }

  /**
   * Generate excitation impulse based on type and harmonic energy bins.
   * Critical: excitation fills the delay buffer ONCE; resonator does all the decay.
   *
   * For pluck (type 0): use a VERY short impulse (< 10% of delay length)
   * so the KS loop sees a clean initial kick and decays naturally.
   */
  _generateExcitation(v, bins, excitationType) {
    const len = v.delayLength;
    const attackSharpness = Math.max(0.1, this.params.attackSharpness || 0.5);

    // ── Pluck/percussive: use short impulse (5-20% of delay length)
    // ── Tonal/sustained: use longer impulse (40-80% of delay length)
    let exciteFraction;
    switch (excitationType) {
      case 0: exciteFraction = 0.08; break;  // Pluck: very short burst
      case 1: exciteFraction = 0.05; break;  // Strike: shortest burst
      case 4: exciteFraction = 0.10; break;  // Bell: short burst
      case 5: exciteFraction = 0.08; break;  // Glass: short burst
      case 2: exciteFraction = 0.50; break;  // Brass/reed: longer
      case 3: exciteFraction = 0.60; break;  // Air: longest
      default: exciteFraction = 0.30; break; // Broadband: medium
    }

    // Override with impulseWidth param if it's non-default (user adjusted)
    if (this.impulseWidth !== 0.5) {
      // impulseWidth 0..1 maps to 0.02..0.8 of delay length
      exciteFraction = 0.02 + this.impulseWidth * 0.78;
    }

    const exciteLen = Math.max(4, Math.floor(len * exciteFraction));

    if (!bins || bins.length === 0) {
      // Default: white noise burst
      for (let i = 0; i < exciteLen; i++) {
        const env = this._excitationEnvelope(i, exciteLen, excitationType, attackSharpness);
        const noise = (Math.random() * 2 - 1) * env;
        v.delayBufferL[i] = noise;
        v.delayBufferR[i] = noise;
      }
    } else {
      const harmonics = Math.min(bins.length, this.BINS);
      let peak = 0;

      for (let i = 0; i < exciteLen; i++) {
        const t = i / exciteLen;
        const env = this._excitationEnvelope(i, exciteLen, excitationType, attackSharpness);
        let sL = 0;

        for (let b = 0; b < harmonics; b++) {
          const bdata = bins[b];
          if (!bdata || bdata.amplitude < 0.001) continue;
          const amp = bdata.amplitude;
          const binIdx = bdata.bin !== undefined ? bdata.bin : b;
          const freqMult = binIdx + 1;
          const phase = t * freqMult * Math.PI * 2;

          let sample = this._excitationSample(excitationType, phase, t, b, freqMult);
          sL += sample * amp;
        }

        sL = (sL / Math.max(1, Math.sqrt(harmonics))) * env;
        v.delayBufferL[i] = sL;
        v.delayBufferR[i] = sL;
        if (Math.abs(sL) > peak) peak = Math.abs(sL);
      }

      // Normalize to full scale — resonator determines decay, not excitation
      if (peak > 0.001) {
        const targetGain = (0.95 * Math.max(0.5, this.params.excitationEnergy)) / peak;
        for (let i = 0; i < exciteLen; i++) {
          v.delayBufferL[i] = Math.max(-1, Math.min(1, v.delayBufferL[i] * targetGain));
          v.delayBufferR[i] = v.delayBufferL[i];
        }
      } else {
        // Fallback: noise burst
        for (let i = 0; i < exciteLen; i++) {
          const env = this._excitationEnvelope(i, exciteLen, excitationType, attackSharpness);
          const noise = (Math.random() * 2 - 1) * 0.9 * env;
          v.delayBufferL[i] = noise;
          v.delayBufferR[i] = noise;
        }
      }
    }
  }

  /**
   * Per-sample excitation envelope shape.
   * Returns gain 0..1 based on excitation type and attack sharpness.
   */
  _excitationEnvelope(i, len, excitationType, attackSharpness) {
    const t = i / len;
    switch (excitationType) {
      case 0: // Pluck: instant attack, fast exponential decay
        return Math.exp(-t * (3 + attackSharpness * 10));
      case 1: // Strike: very sharp transient, very fast decay
        return t < 0.02 ? t * 50 : Math.exp(-(t - 0.02) * (8 + attackSharpness * 20));
      case 2: // Brass/reed: gradual rise then sustain
        return t < 0.3 ? Math.pow(t / 0.3, 1 - attackSharpness * 0.8) : 0.9 - t * 0.3;
      case 3: // Flute/air: soft onset, gentle decay
        return Math.sin(t * Math.PI) * (0.5 + attackSharpness * 0.5);
      case 4: // Bell: instant attack, moderate decay in excitation
        return Math.exp(-t * (2 + attackSharpness * 5));
      case 5: // Glass: very sharp attack, fast decay
        return t < 0.02 ? t * 50 : Math.exp(-(t - 0.02) * (3 + attackSharpness * 8));
      case 6: // Broadband: hann window
        return 0.5 * (1 - Math.cos(t * Math.PI * 2));
      default:
        return Math.exp(-t * 3);
    }
  }

  /**
   * Per-harmonic excitation sample shape.
   */
  _excitationSample(excitationType, phase, t, binIdx, freqMult) {
    switch (excitationType) {
      case 0: // Pluck: sine + slight noise
        return Math.sin(phase) * 0.8 + (Math.random() * 2 - 1) * 0.2;
      case 1: // Strike: click transient
        return Math.sin(phase) + (Math.random() * 2 - 1) * (t < 0.05 ? 0.8 : 0.05);
      case 2: // Brass/reed: sawtooth
        return 2 * ((t * freqMult) % 1) - 1;
      case 3: // Air/flute: sine + breathiness
        return Math.sin(phase) * 0.6 + (Math.random() * 2 - 1) * 0.4;
      case 4: // Bell: inharmonic partials (stretched series)
        return Math.sin(phase * (1 + binIdx * 0.013)) * Math.exp(-binIdx * 0.08);
      case 5: // Glass: stretched harmonic series
        return Math.sin(phase * Math.sqrt(freqMult) * 0.9);
      case 6: // Broadband: pure noise
        return Math.random() * 2 - 1;
      default:
        return Math.sin(phase);
    }
  }

  _calcBiquadCoeffs(type, cutoff, q) {
    const w0 = 2 * Math.PI * cutoff / this.SAMPLE_RATE;
    const cosw0 = Math.cos(w0);
    const sinw0 = Math.sin(w0);
    const alpha = sinw0 / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 0) {
      b0 = (1 - cosw0) / 2; b1 = 1 - cosw0; b2 = (1 - cosw0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
    } else if (type === 1) {
      b0 = alpha; b1 = 0; b2 = -alpha;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
    } else {
      b0 = (1 + cosw0) / 2; b1 = -(1 + cosw0); b2 = (1 + cosw0) / 2;
      a0 = 1 + alpha; a1 = -2 * cosw0; a2 = 1 - alpha;
    }
    return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
  }

  _updateVoiceFilter(v) {
    const freq = 20 * Math.pow(1000, this.params.filterCutoff);
    const q = 0.707 + this.params.filterResonance * 9;
    const coeffs = this._calcBiquadCoeffs(this.params.filterType, Math.min(freq, this.SAMPLE_RATE * 0.48), q);
    v.bqb0 = coeffs.b0; v.bqb1 = coeffs.b1; v.bqb2 = coeffs.b2;
    v.bqa1 = coeffs.a1; v.bqa2 = coeffs.a2;
  }

  _updateVoiceBody(v) {
    const bodyFreqs = [200, 180, 300, 250, 400, 350];
    const bodyModel = Math.min(5, Math.floor(this.params.bodyModel));
    if (bodyModel === 0) {
      v.bodyB0 = 1; v.bodyB1 = 0; v.bodyB2 = 0; v.bodyA1 = 0; v.bodyA2 = 0;
      return;
    }
    const freq = bodyFreqs[bodyModel - 1] * (0.5 + this.params.bodySize * 1.5);
    const q = 2 + this.params.bodySize * 4;
    const coeffs = this._calcBiquadCoeffs(1, Math.min(freq, this.SAMPLE_RATE * 0.48), q);
    v.bodyB0 = coeffs.b0; v.bodyB1 = coeffs.b1; v.bodyB2 = coeffs.b2;
    v.bodyA1 = coeffs.a1; v.bodyA2 = coeffs.a2;
  }

  _updateFilters() {
    for (let i = 0; i < this.MAX_VOICES; i++) {
      if (this.voices[i].active) {
        this._updateVoiceFilter(this.voices[i]);
        this._updateVoiceBody(this.voices[i]);
      }
    }
  }

  _applyBody(v, x, isL) {
    if (this.params.bodyModel === 0 || this.params.bodyMix === 0) return x;
    let y;
    if (isL) {
      y = v.bodyB0 * x + v.bodyB1 * v.bodyY1L + v.bodyB2 * v.bodyY2L - v.bodyA1 * v.bodyY1L - v.bodyA2 * v.bodyY2L;
      v.bodyY2L = v.bodyY1L; v.bodyY1L = y;
    } else {
      y = v.bodyB0 * x + v.bodyB1 * v.bodyY1R + v.bodyB2 * v.bodyY2R - v.bodyA1 * v.bodyY1R - v.bodyA2 * v.bodyY2R;
      v.bodyY2R = v.bodyY1R; v.bodyY1R = y;
    }
    if (isNaN(y)) y = 0;
    return x + (y - x) * this.params.bodyMix;
  }

  _updateADSR(v, numSamples) {
    const attackRate = numSamples / (v.adsrAttack * this.SAMPLE_RATE);
    const decayRate = numSamples / (v.adsrDecay * this.SAMPLE_RATE);
    const releaseRate = numSamples / (v.adsrRelease * this.SAMPLE_RATE);

    // Auto-release counter for percussive sounds
    if (v.autoReleaseSamples > 0 && v.adsrPhase === 2) {
      v.autoReleaseCounter += numSamples;
      if (v.autoReleaseCounter >= v.autoReleaseSamples) {
        v.adsrPhase = 3; // trigger release
      }
    }

    switch (v.adsrPhase) {
      case 0: // Attack
        v.adsrLevel += attackRate;
        if (v.adsrLevel >= 1) { v.adsrLevel = 1; v.adsrPhase = 1; }
        break;
      case 1: // Decay
        v.adsrLevel -= decayRate;
        if (v.adsrLevel <= v.adsrSustain) {
          v.adsrLevel = v.adsrSustain;
          v.adsrPhase = 2; // sustain
          v.autoReleaseCounter = 0;
          // If sustain=0 on percussive, immediately trigger release
          if (v.adsrSustain <= 0.001 && v.autoReleaseSamples > 0) {
            v.adsrPhase = 3;
          }
        }
        break;
      case 2: // Sustain
        v.adsrLevel = v.adsrSustain;
        break;
      case 3: // Release
        v.adsrLevel -= releaseRate;
        if (v.adsrLevel <= 0) {
          v.adsrLevel = 0;
          v.adsrPhase = 4;
          v.active = false;
        }
        break;
    }
  }

  _processChorus(sampleL, sampleR) {
    if (!this.chorusEnabled) return [sampleL, sampleR];
    this.chorusLfoPhase += this.chorusRate / this.SAMPLE_RATE;
    if (this.chorusLfoPhase > 1) this.chorusLfoPhase -= 1;
    const lfo = Math.sin(this.chorusLfoPhase * Math.PI * 2);
    const delayMs = (this.chorusDelay + lfo * this.chorusDepth) * this.SAMPLE_RATE;
    const delayInt = Math.floor(delayMs);
    const frac = delayMs - delayInt;
    const bufSize = this.chorusBufL.length;

    this.chorusBufL[this.chorusWritePos % bufSize] = sampleL;
    this.chorusBufR[this.chorusWritePos % bufSize] = sampleR;

    const rpos = (this.chorusWritePos - delayInt + bufSize) % bufSize;
    const rpos1 = (rpos + 1) % bufSize;
    const wetL = this.chorusBufL[rpos] * (1 - frac) + this.chorusBufL[rpos1] * frac;
    const wetR = this.chorusBufR[rpos] * (1 - frac) + this.chorusBufR[rpos1] * frac;
    this.chorusWritePos = (this.chorusWritePos + 1) % bufSize;

    return [
      sampleL * (1 - this.chorusMix) + wetL * this.chorusMix,
      sampleR * (1 - this.chorusMix) + wetR * this.chorusMix
    ];
  }

  _processDelay(sampleL, sampleR) {
    if (!this.delayEnabled) return [sampleL, sampleR];
    const bufSize = this.delayBufL.length;
    const rpos = (this.delayWritePos - this.delayLength + bufSize) % bufSize;
    const wetL = this.delayBufL[rpos];
    const wetR = this.delayBufR[rpos];
    this.delayBufL[this.delayWritePos] = sampleL + wetL * this.delayFeedback;
    this.delayBufR[this.delayWritePos] = sampleR + wetR * this.delayFeedback;
    this.delayWritePos = (this.delayWritePos + 1) % bufSize;
    return [
      sampleL + wetL * this.delayMix,
      sampleR + wetR * this.delayMix
    ];
  }

  _processReverb(sampleL, sampleR) {
    if (!this.reverbEnabled) return [sampleL, sampleR];
    const input = (sampleL + sampleR) * 0.5 * 0.06;
    let outL = 0, outR = 0;

    for (let c = 0; c < 4; c++) {
      const lenL = this.reverbCombBufL[c].length;
      const lenR = this.reverbCombBufR[c].length;
      const storeL = this.reverbCombStoreL[c];
      const storeR = this.reverbCombStoreR[c];

      const outCombL = this.reverbCombBufL[c][this.reverbCombPosL[c]];
      const outCombR = this.reverbCombBufR[c][this.reverbCombPosR[c]];

      const newStoreL = outCombL + (storeL - outCombL) * this.reverbCombDamp[c];
      const newStoreR = outCombR + (storeR - outCombR) * this.reverbCombDamp[c];
      this.reverbCombStoreL[c] = newStoreL;
      this.reverbCombStoreR[c] = newStoreR;

      this.reverbCombBufL[c][this.reverbCombPosL[c]] = input + newStoreL * this.reverbCombFb[c];
      this.reverbCombBufR[c][this.reverbCombPosR[c]] = input + newStoreR * this.reverbCombFb[c];

      this.reverbCombPosL[c] = (this.reverbCombPosL[c] + 1) % lenL;
      this.reverbCombPosR[c] = (this.reverbCombPosR[c] + 1) % lenR;

      outL += outCombL;
      outR += outCombR;
    }

    for (let a = 0; a < 2; a++) {
      const lenL = this.reverbApBufL[a].length;
      const lenR = this.reverbApBufR[a].length;
      const apL = this.reverbApBufL[a][this.reverbApPosL[a]];
      const apR = this.reverbApBufR[a][this.reverbApPosR[a]];
      this.reverbApBufL[a][this.reverbApPosL[a]] = outL + apL * 0.5;
      this.reverbApBufR[a][this.reverbApPosR[a]] = outR + apR * 0.5;
      outL = apL - outL;
      outR = apR - outR;
      this.reverbApPosL[a] = (this.reverbApPosL[a] + 1) % lenL;
      this.reverbApPosR[a] = (this.reverbApPosR[a] + 1) % lenR;
    }

    return [
      sampleL + outL * this.reverbMix,
      sampleR + outR * this.reverbMix
    ];
  }

  _updateLFO() {
    this.lfoPhase += this.lfoRate / this.SAMPLE_RATE * this.CONTROL_RATE;
    if (this.lfoPhase > 1) this.lfoPhase -= 1;
    const p = this.lfoPhase;
    switch (this.lfoWave) {
      case 0: this.lfoValue = Math.sin(p * Math.PI * 2); break;
      case 1: this.lfoValue = p < 0.5 ? p * 4 - 1 : 3 - p * 4; break;
      case 2: this.lfoValue = p < 0.5 ? 1 : -1; break;
      case 3:
        this.lfoRandCounter++;
        if (this.lfoRandCounter >= this.lfoRandPeriod) {
          this.lfoRandPrev = this.lfoRandNext;
          this.lfoRandNext = Math.random() * 2 - 1;
          this.lfoRandCounter = 0;
        }
        this.lfoValue = this.lfoRandPrev + (this.lfoRandNext - this.lfoRandPrev) * (this.lfoRandCounter / this.lfoRandPeriod);
        break;
    }
  }

  process(inputs, outputs, parameters) {
    const outL = outputs[0][0];
    const outR = outputs[0][1] || outputs[0][0];
    const blockSize = outL ? outL.length : 128;

    if (!outL) return true;

    this.samplesSinceExcitation += blockSize;

    for (let i = 0; i < blockSize; i++) {
      this.mixL[i] = 0;
      this.mixR[i] = 0;
    }

    const brightness = parameters.brightness[0];
    const sustainEnergy = parameters.sustainEnergy[0];

    this.controlCounter += blockSize;
    if (this.controlCounter >= this.CONTROL_RATE) {
      this.controlCounter = 0;
      this._updateLFO();
      this._updateFilters();
    }

    for (let vi = 0; vi < this.MAX_VOICES; vi++) {
      const v = this.voices[vi];
      if (!v.active) continue;
      v.age += blockSize;

      this._updateADSR(v, blockSize);

      v.driftPhase += v.driftRate * 0.01;
      const drift = Math.sin(v.driftPhase) * this.params.driftAmount * 0.02;
      const driftedLen = Math.max(4, Math.min(this.DELAY_BUFFER_SIZE - 2,
        v.delayLength * (1 + drift)));

      const panAngle = (v.pan + 1) * Math.PI * 0.25;
      const panL = Math.cos(panAngle);
      const panR = Math.sin(panAngle);

      // Sustain injection for drone modes — small continuous noise energy
      const sustain = sustainEnergy * 0.015;

      // ── CORRECTED Karplus-Strong one-pole lowpass ────────────────────────
      // lpCoeff: higher = darker (more filtering), lower = brighter (less filtering)
      // Per-voice lpCoeff set at trigger time from brightness param
      // But also modulate by the brightness AudioParam for real-time control
      const lpCoeff = Math.max(0.02, Math.min(0.95, v.lpCoeff + (0.5 - brightness) * 0.3));

      const delayLen = Math.floor(driftedLen);

      for (let n = 0; n < blockSize; n++) {
        const rp = ((v.writePos - delayLen + this.DELAY_BUFFER_SIZE) % this.DELAY_BUFFER_SIZE);
        const rpInt = Math.floor(rp);
        const rpFrac = rp - rpInt;
        const rp0 = rpInt % this.DELAY_BUFFER_SIZE;
        const rp1 = (rpInt + 1) % this.DELAY_BUFFER_SIZE;

        // Interpolated read from delay line
        let sL = v.delayBufferL[rp0] * (1 - rpFrac) + v.delayBufferL[rp1] * rpFrac;
        let sR = v.delayBufferR[rp0] * (1 - rpFrac) + v.delayBufferR[rp1] * rpFrac;

        // ── One-pole lowpass inside loop (Karplus-Strong tone shaping)
        // y[n] = (1 - a) * x[n] + a * y[n-1]
        // where a = lpCoeff (0 = bypass, 1 = max filtering)
        const fL = (1 - lpCoeff) * sL + lpCoeff * v.lpStateL;
        const fR = (1 - lpCoeff) * sR + lpCoeff * v.lpStateR;
        v.lpStateL = fL;
        v.lpStateR = fR;

        // Feedback with decay coefficient + optional sustain noise
        const fbL = fL * v.feedbackCoeff + sustain * (Math.random() * 2 - 1);
        const fbR = fR * v.feedbackCoeff + sustain * (Math.random() * 2 - 1);

        v.delayBufferL[v.writePos] = Math.max(-1, Math.min(1, fbL));
        v.delayBufferR[v.writePos] = Math.max(-1, Math.min(1, fbR));
        v.writePos = (v.writePos + 1) % this.DELAY_BUFFER_SIZE;

        // Body resonance on output
        sL = this._applyBody(v, fL, true);
        sR = this._applyBody(v, fR, false);

        const level = v.adsrLevel * v.amplitude;
        this.mixL[n] += sL * panL * level;
        this.mixR[n] += sR * panR * level;
      }
    }

    // Mix voices with perceptual gain, then apply effects
    const voiceGain = 2.5 / Math.max(1, Math.sqrt(this.MAX_VOICES));
    for (let i = 0; i < blockSize; i++) {
      let l = this.mixL[i] * voiceGain;
      let r = this.mixR[i] * voiceGain;

      // Soft clip
      l = Math.tanh(l * 2.0) * 0.95;
      r = Math.tanh(r * 2.0) * 0.95;

      [l, r] = this._processChorus(l, r);
      [l, r] = this._processDelay(l, r);
      [l, r] = this._processReverb(l, r);

      outL[i] = Math.max(-1, Math.min(1, l));
      outR[i] = Math.max(-1, Math.min(1, r));
    }

    return true;
  }
}

registerProcessor('spectral-paint-processor', SpectralPaintProcessor);
