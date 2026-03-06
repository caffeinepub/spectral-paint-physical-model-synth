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
    this.MAX_VOICES = 6;
    this.DELAY_BUFFER_SIZE = 4096;
    this.BINS = 32;
    this.CONTROL_RATE = 128;
    this.controlCounter = 0;

    // Pre-allocate all voice buffers
    this.voices = [];
    for (let i = 0; i < this.MAX_VOICES; i++) {
      const voice = {
        delayBufferL: new Float32Array(this.DELAY_BUFFER_SIZE),
        delayBufferR: new Float32Array(this.DELAY_BUFFER_SIZE),
        writePos: 0,
        delayLength: 200,
        feedbackCoeff: 0.99,
        dampingCoeff: 0.5,
        active: false,
        age: 0,
        pan: 0,
        excitationType: 0,
        // Biquad filter state per voice
        bqx1L: 0, bqx2L: 0, bqy1L: 0, bqy2L: 0,
        bqx1R: 0, bqx2R: 0, bqy1R: 0, bqy2R: 0,
        bqb0: 1, bqb1: 0, bqb2: 0, bqa1: 0, bqa2: 0,
        // Body resonance (2-pole)
        bodyY1L: 0, bodyY2L: 0,
        bodyY1R: 0, bodyY2R: 0,
        bodyB0: 1, bodyB1: 0, bodyB2: 0, bodyA1: 0, bodyA2: 0,
        // ADSR
        adsrPhase: 0,
        adsrLevel: 0,
        adsrAttack: 0.01,
        adsrDecay: 0.1,
        adsrSustain: 0.7,
        adsrRelease: 0.3,
        // Drift
        driftPhase: Math.random() * Math.PI * 2,
        driftRate: 0.3 + Math.random() * 0.5,
        driftAmount: 0,
        // Amplitude
        amplitude: 1.0,
        note: 0,
      };
      this.voices.push(voice);
    }

    // Scratch buffers for mixing (pre-allocated)
    this.mixL = new Float32Array(128);
    this.mixR = new Float32Array(128);

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
    this.delayBufferL = new Float32Array(65536);
    this.delayBufferR = new Float32Array(65536);
    this.delayWritePos = 0;
    this.delayLength = Math.floor(0.35 * sampleRate);
    this.delayFeedback = 0.4;

    // Effects: Reverb (Schroeder: 4 comb + 2 allpass)
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
    };

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'triggerVoice') {
        this._triggerVoice(msg.bins, msg.pan, msg.excitationType, msg.amplitude, msg.note);
      } else if (msg.type === 'stopAll') {
        for (let i = 0; i < this.MAX_VOICES; i++) {
          this.voices[i].active = false;
          this.voices[i].adsrPhase = 4;
        }
      } else if (msg.type === 'updateParams') {
        Object.assign(this.params, msg.params);
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

  _findFreeVoice() {
    for (let i = 0; i < this.MAX_VOICES; i++) {
      if (!this.voices[i].active) return i;
    }
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
    v.writePos = 0;
    v.pan = pan || 0;
    v.excitationType = excitationType || 0;
    v.amplitude = amplitude || 1.0;
    v.note = note || 0;
    v.age = 0;
    v.active = true;
    v.adsrPhase = 0;
    v.adsrLevel = 0;
    v.bqx1L = 0; v.bqx2L = 0; v.bqy1L = 0; v.bqy2L = 0;
    v.bqx1R = 0; v.bqx2R = 0; v.bqy1R = 0; v.bqy2R = 0;
    v.bodyY1L = 0; v.bodyY2L = 0;
    v.bodyY1R = 0; v.bodyY2R = 0;

    const freq = 55 * Math.pow(2, (note + 24) / 12.0);
    const morphedFreq = freq * (1 + this.params.resonatorMorph * 0.5);
    const baseTension = 0.1 + this.params.tension * 0.9;
    v.delayLength = Math.max(4, Math.min(this.DELAY_BUFFER_SIZE - 2,
      Math.floor(this.SAMPLE_RATE / (morphedFreq * (0.5 + baseTension * 0.5)))
    ));

    const decayFactor = 0.95 + this.params.decayTime * 0.049;
    const dampStrength = 1.0 - this.params.damping * 0.8;
    v.feedbackCoeff = decayFactor;
    v.dampingCoeff = dampStrength;

    this._generateExcitation(v, bins, excitationType);

    v.adsrAttack = Math.max(0.001, this.params.attack * 2.0);
    v.adsrDecay = Math.max(0.01, this.params.decay * 1.0);
    v.adsrSustain = this.params.sustain;
    v.adsrRelease = Math.max(0.01, this.params.release * 3.0);

    this._updateVoiceFilter(v);
    this._updateVoiceBody(v);
  }

  _generateExcitation(v, bins, excitationType) {
    const len = v.delayLength;
    if (!bins || bins.length === 0) {
      for (let i = 0; i < len; i++) {
        const noise = (Math.random() * 2 - 1) * 0.5;
        v.delayBufferL[i] = noise;
        v.delayBufferR[i] = noise;
      }
      return;
    }

    const harmonics = Math.min(bins.length, this.BINS);
    for (let i = 0; i < len; i++) {
      let sampleL = 0;
      let sampleR = 0;
      const t = i / len;

      for (let b = 0; b < harmonics; b++) {
        const { bin, amplitude: amp, hue } = bins[b];
        if (amp < 0.001) continue;
        const freqMult = bin + 1;
        const phase = t * freqMult * Math.PI * 2;

        let sample = 0;
        const etype = excitationType !== undefined ? excitationType : (hue !== undefined ? Math.floor(hue / 45) : 0);
        switch (etype) {
          case 0:
            sample = Math.sin(phase) * Math.exp(-t * 3);
            break;
          case 1:
            sample = Math.sin(phase) * (t < 0.1 ? t * 10 : Math.exp(-(t - 0.1) * 5));
            break;
          case 2:
            sample = (2 * (t * freqMult % 1) - 1) * Math.exp(-t * 2);
            break;
          case 3:
            sample = (Math.sin(phase) * 0.7 + (Math.random() * 2 - 1) * 0.3) * Math.exp(-t * 2);
            break;
          case 4: {
            const inharm = 1 + b * 0.015;
            sample = Math.sin(phase * inharm) * Math.exp(-t * (1 + b * 0.3));
            break;
          }
          case 5: {
            const ratio = Math.sqrt(freqMult) * 1.2;
            sample = Math.sin(t * ratio * Math.PI * 2) * Math.exp(-t * (0.5 + b * 0.1));
            break;
          }
          case 6:
            sample = (Math.random() * 2 - 1);
            break;
          default:
            sample = Math.sin(phase) * Math.exp(-t * 2);
        }

        sampleL += sample * amp;
        sampleR += sample * amp;
      }

      sampleL /= Math.max(1, harmonics * 0.5);
      sampleR /= Math.max(1, harmonics * 0.5);

      const noise = (Math.random() * 2 - 1) * this.params.sustainEnergy * 0.1;
      v.delayBufferL[i] = Math.max(-1, Math.min(1, sampleL + noise));
      v.delayBufferR[i] = Math.max(-1, Math.min(1, sampleR + noise));
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

  _applyBiquad(v, x, isL) {
    let y;
    if (isL) {
      y = v.bqb0 * x + v.bqb1 * v.bqx1L + v.bqb2 * v.bqx2L
          - v.bqa1 * v.bqy1L - v.bqa2 * v.bqy2L;
      v.bqx2L = v.bqx1L; v.bqx1L = x;
      v.bqy2L = v.bqy1L; v.bqy1L = y;
    } else {
      y = v.bqb0 * x + v.bqb1 * v.bqx1R + v.bqb2 * v.bqx2R
          - v.bqa1 * v.bqy1R - v.bqa2 * v.bqy2R;
      v.bqx2R = v.bqx1R; v.bqx1R = x;
      v.bqy2R = v.bqy1R; v.bqy1R = y;
    }
    return isNaN(y) ? 0 : y;
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
    switch (v.adsrPhase) {
      case 0:
        v.adsrLevel += attackRate;
        if (v.adsrLevel >= 1) { v.adsrLevel = 1; v.adsrPhase = 1; }
        break;
      case 1:
        v.adsrLevel -= decayRate;
        if (v.adsrLevel <= v.adsrSustain) { v.adsrLevel = v.adsrSustain; v.adsrPhase = 2; }
        break;
      case 2:
        v.adsrLevel = v.adsrSustain;
        break;
      case 3:
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
    const bufSize = this.delayBufferL.length;
    const rpos = (this.delayWritePos - this.delayLength + bufSize) % bufSize;
    const wetL = this.delayBufferL[rpos];
    const wetR = this.delayBufferR[rpos];
    this.delayBufferL[this.delayWritePos] = sampleL + wetL * this.delayFeedback;
    this.delayBufferR[this.delayWritePos] = sampleR + wetR * this.delayFeedback;
    this.delayWritePos = (this.delayWritePos + 1) % bufSize;
    return [
      sampleL + wetL * this.delayMix,
      sampleR + wetR * this.delayMix
    ];
  }

  _processReverb(sampleL, sampleR) {
    if (!this.reverbEnabled) return [sampleL, sampleR];
    const input = (sampleL + sampleR) * 0.5 * 0.015;
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

    for (let i = 0; i < blockSize; i++) {
      this.mixL[i] = 0;
      this.mixR[i] = 0;
    }

    const tension = parameters.tension[0];
    const damping = parameters.damping[0];
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

      const sustain = sustainEnergy * 0.001;
      const brightCoeff = 0.5 - brightness * 0.4;
      const delayLen = Math.floor(driftedLen);

      for (let n = 0; n < blockSize; n++) {
        const readPosFrac = ((v.writePos - delayLen + this.DELAY_BUFFER_SIZE) % this.DELAY_BUFFER_SIZE);
        const readPosInt = Math.floor(readPosFrac);
        const readPosFracPart = readPosFrac - readPosInt;
        const rp0 = readPosInt % this.DELAY_BUFFER_SIZE;
        const rp1 = (readPosInt + 1) % this.DELAY_BUFFER_SIZE;

        let sL = v.delayBufferL[rp0] * (1 - readPosFracPart) + v.delayBufferL[rp1] * readPosFracPart;
        let sR = v.delayBufferR[rp0] * (1 - readPosFracPart) + v.delayBufferR[rp1] * readPosFracPart;

        sL = sL * (1 - brightCoeff) + (v.bqy1L * brightCoeff);
        sR = sR * (1 - brightCoeff) + (v.bqy1R * brightCoeff);
        v.bqy1L = sL;
        v.bqy1R = sR;

        const injL = sL * v.feedbackCoeff + sustain * (Math.random() * 2 - 1);
        const injR = sR * v.feedbackCoeff + sustain * (Math.random() * 2 - 1);

        v.delayBufferL[v.writePos] = Math.max(-1, Math.min(1, injL));
        v.delayBufferR[v.writePos] = Math.max(-1, Math.min(1, injR));
        v.writePos = (v.writePos + 1) % this.DELAY_BUFFER_SIZE;

        const level = v.adsrLevel * v.amplitude;
        this.mixL[n] += sL * panL * level;
        this.mixR[n] += sR * panR * level;
      }
    }

    for (let i = 0; i < blockSize; i++) {
      let l = this.mixL[i];
      let r = this.mixR[i];

      l = Math.tanh(l * 0.8);
      r = Math.tanh(r * 0.8);

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
