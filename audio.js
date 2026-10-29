/**
 * Canopy Dash: Dual-Ladder Monkey Climb — Web Audio API Synthesizer (`window.MonkeyAudio`)
 * Zero external MP3 dependencies. Auto-resumes AudioContext on first user interaction.
 */
(function () {
  'use strict';

  class MonkeyAudioEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.initialized = false;
      this.masterGain = null;
      this._noiseBuffer = null;
      this._bindAutoResume();
    }

    _bindAutoResume() {
      const resumeHandler = () => {
        if (!this.initialized) {
          this.init();
        } else if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      ['pointerdown', 'keydown', 'touchstart', 'click'].forEach((evt) => {
        window.addEventListener(evt, resumeHandler, { passive: true });
      });
    }

    init() {
      if (this.initialized && this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return this;
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return this;
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : 0.75;
        this.masterGain.connect(this.ctx.destination);
        this._buildNoiseBuffer();
        this.initialized = true;
      } catch (e) {
        // Ignore audio context restrictions in headless environments
      }
      return this;
    }

    _ensureCtx() {
      if (!this.initialized) this.init();
      if (!this.ctx || this.muted) return false;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    _buildNoiseBuffer() {
      if (!this.ctx) return;
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 1.5;
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this._noiseBuffer = buffer;
    }

    setMuted(bool) {
      this.muted = Boolean(bool);
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : 0.75, this.ctx.currentTime);
      }
      const btn = document.getElementById('btn-mute');
      if (btn) {
        btn.setAttribute('aria-pressed', String(this.muted));
        btn.classList.toggle('is-muted', this.muted);
        const labelEl = btn.querySelector('.mute-label');
        if (labelEl) {
          labelEl.textContent = this.muted ? 'MUTED' : 'AUDIO ON';
        }
      }
      return this.muted;
    }

    toggleMute() {
      return this.setMuted(!this.muted);
    }

    isMuted() {
      return this.muted;
    }

    /**
     * Subtle woody bamboo rung tap when climbing
     * @param {number} [pitchMod=1.0] - multiplier for speed/alternating hands
     */
    playClimbStep(pitchMod = 1.0) {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        const baseFreq = 165 * Math.max(0.7, Math.min(1.6, pitchMod || 1.0));
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.45, now + 0.025);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.065);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.075);
      } catch (e) {}
    }

    /**
     * Crisp whoosh/leap sound when jumping between Left and Right ladders
     */
    playSwitchLadder() {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        // Tonal swoop
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.13);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.135);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.14);

        // Airy wind brush
        if (this._noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this._noiseBuffer;
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(900, now);
          filter.frequency.exponentialRampToValueAtTime(2400, now + 0.11);
          filter.Q.value = 2.2;

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.08, now);
          nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

          noise.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.masterGain);
          noise.start(now);
          noise.stop(now + 0.125);
        }
      } catch (e) {}
    }

    /**
     * Bright ascending marimba/chime on banana or idol pickup
     * @param {number} [combo=1]
     */
    playBananaPickup(combo = 1) {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        const c = Math.max(1, Math.min(12, Number(combo) || 1));
        const semitoneShift = Math.pow(2, (c - 1) / 12);
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

        notes.forEach((freq, idx) => {
          const start = now + idx * 0.042;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq * semitoneShift, start);

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.24, start + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);

          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(start);
          osc.stop(start + 0.17);
        });
      } catch (e) {}
    }

    /**
     * Power-up pickup or shield break sound ('SHIELD' | 'CHILI' | 'SHIELD_BREAK' | 'CLOSE_CALL')
     * @param {string} [type='SHIELD']
     */
    playPowerup(type = 'SHIELD') {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        const kind = String(type || 'SHIELD').toUpperCase();

        if (kind.includes('CHILI')) {
          // Rising flame roar + energetic synth chord
          const freqs = [293.66, 440, 587.33, 880];
          freqs.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f * 0.8, now + i * 0.03);
            osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.35);

            gain.gain.setValueAtTime(0.001, now + i * 0.03);
            gain.gain.linearRampToValueAtTime(0.11, now + i * 0.03 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + i * 0.03);
            osc.stop(now + 0.44);
          });
        } else {
          // Emerald vine shield shimmer
          const freqs = [392.0, 493.88, 587.33, 783.99, 987.77];
          freqs.forEach((f, i) => {
            const t = now + i * 0.045;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);

            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.3);
          });
        }
      } catch (e) {}
    }

    /**
     * Metallic mechanical schwing! when retracting spikes snap out
     */
    playSpikeSnap() {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        // High metallic ring
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'square';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(1150, now);
        osc1.frequency.exponentialRampToValueAtTime(2400, now + 0.04);
        osc1.frequency.exponentialRampToValueAtTime(680, now + 0.16);

        osc2.frequency.setValueAtTime(1680, now);
        osc2.frequency.exponentialRampToValueAtTime(890, now + 0.16);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.18);
        osc2.stop(now + 0.18);
      } catch (e) {}
    }

    /**
     * Sputtering fuse hiss when dynamite ignites or ticks
     */
    playDynamiteFuse() {
      if (!this._ensureCtx() || !this._noiseBuffer) return;
      try {
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3200, now);
        filter.frequency.linearRampToValueAtTime(4800, now + 0.14);
        filter.Q.value = 3.5;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.16);
      } catch (e) {}
    }

    /**
     * Deep punchy explosion when dynamite detonates
     */
    playDynamiteBoom() {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        // Sub-bass impact drop
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(140, now);
        sub.frequency.exponentialRampToValueAtTime(28, now + 0.45);

        subGain.gain.setValueAtTime(0.45, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

        sub.connect(subGain);
        subGain.connect(this.masterGain);
        sub.start(now);
        sub.stop(now + 0.5);

        // White-noise blast wave
        if (this._noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          noise.buffer = this._noiseBuffer;

          const filter = this.ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, now);
          filter.frequency.exponentialRampToValueAtTime(180, now + 0.52);

          const nGain = this.ctx.createGain();
          nGain.gain.setValueAtTime(0.38, now);
          nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

          noise.connect(filter);
          filter.connect(nGain);
          nGain.connect(this.masterGain);
          noise.start(now);
          noise.stop(now + 0.56);
        }
      } catch (e) {}
    }

    /**
     * Sibilant warning hiss when approaching a hungry tree viper
     */
    playSnakeHiss() {
      if (!this._ensureCtx() || !this._noiseBuffer) return;
      try {
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this._noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(3800, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.28);
      } catch (e) {}
    }

    /**
     * Cartoon snap + comical gulp when the snake eats the monkey!
     */
    playSnakeChomp() {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        // 1. Jaw snap crunch
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();
        snap.type = 'sawtooth';
        snap.frequency.setValueAtTime(320, now);
        snap.frequency.exponentialRampToValueAtTime(65, now + 0.11);

        snapGain.gain.setValueAtTime(0.32, now);
        snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        snap.connect(snapGain);
        snapGain.connect(this.masterGain);
        snap.start(now);
        snap.stop(now + 0.13);

        // 2. Comical cartoon gulp ("glug-glug!")
        const gulpStart = now + 0.18;
        const gulp = this.ctx.createOscillator();
        const gulpGain = this.ctx.createGain();
        gulp.type = 'sine';
        gulp.frequency.setValueAtTime(160, gulpStart);
        gulp.frequency.exponentialRampToValueAtTime(480, gulpStart + 0.14);
        gulp.frequency.exponentialRampToValueAtTime(190, gulpStart + 0.28);

        gulpGain.gain.setValueAtTime(0.001, gulpStart);
        gulpGain.gain.linearRampToValueAtTime(0.3, gulpStart + 0.04);
        gulpGain.gain.exponentialRampToValueAtTime(0.001, gulpStart + 0.3);

        gulp.connect(gulpGain);
        gulpGain.connect(this.masterGain);
        gulp.start(gulpStart);
        gulp.stop(gulpStart + 0.32);
      } catch (e) {}
    }

    /**
     * Dramatic game-over sad jungle trombone / descending marimba
     * @param {string} [cause]
     */
    playGameOver(cause = '') {
      if (!this._ensureCtx()) return;
      try {
        const now = this.ctx.currentTime;
        const notes = [392.0, 369.99, 349.23, 261.63]; // G4, F#4, F4, C4
        notes.forEach((freq, idx) => {
          const start = now + idx * 0.14;
          const dur = idx === notes.length - 1 ? 0.45 : 0.13;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, start);
          if (idx === notes.length - 1) {
            osc.frequency.exponentialRampToValueAtTime(freq * 0.88, start + dur);
          }

          gain.gain.setValueAtTime(0.001, start);
          gain.gain.linearRampToValueAtTime(0.24, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

          osc.connect(gain);
          gain.connect(this.masterGain);
          osc.start(start);
          osc.stop(start + dur + 0.02);
        });
      } catch (e) {}
    }
  }

  window.MonkeyAudio = new MonkeyAudioEngine();
})();
