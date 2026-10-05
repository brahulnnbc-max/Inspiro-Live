// Web Audio Ambient Focus Generator for Monk Mode
export type AmbientSoundType = 'none' | 'gamma40' | 'brown' | 'rain' | 'library';

class AmbientSoundEngine {
  private ctx: AudioContext | null = null;
  private activeType: AmbientSoundType = 'none';
  private masterGain: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private volume: number = 0.5;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public getCurrentType(): AmbientSoundType {
    return this.activeType;
  }

  public stop() {
    this.nodes.forEach(node => {
      try {
        if ('stop' in node && typeof (node as any).stop === 'function') {
          (node as any).stop();
        }
        node.disconnect();
      } catch (e) {
        // Ignore
      }
    });
    this.nodes = [];
    this.activeType = 'none';
  }

  public play(type: AmbientSoundType) {
    this.stop();
    if (type === 'none') return;

    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    this.activeType = type;

    if (type === 'gamma40') {
      // 40Hz Gamma Focus Binaural Beats
      // Left ear 200Hz, Right ear 240Hz (difference is 40Hz)
      const oscL = this.ctx.createOscillator();
      const oscR = this.ctx.createOscillator();
      const merger = this.ctx.createChannelMerger(2);
      const gain = this.ctx.createGain();

      oscL.type = 'sine';
      oscL.frequency.value = 196; // G3
      oscR.type = 'sine';
      oscR.frequency.value = 236; // 40Hz differential

      gain.gain.value = 0.25;

      oscL.connect(merger, 0, 0);
      oscR.connect(merger, 0, 1);
      merger.connect(gain);
      gain.connect(this.masterGain);

      oscL.start();
      oscR.start();

      this.nodes.push(oscL, oscR, merger, gain);
    } else if (type === 'brown') {
      // Deep Brown Noise Generator (integrated random walk)
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // Compensate for volume
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 350;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.4;

      whiteNoise.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(this.masterGain);

      whiteNoise.start();
      this.nodes.push(whiteNoise, lowpass, gain);
    } else if (type === 'rain') {
      // Rain on Glass Generator (pink/brown noise with high shelf)
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11;
        b6 = white * 0.115926;
      }

      const rainSource = this.ctx.createBufferSource();
      rainSource.buffer = noiseBuffer;
      rainSource.loop = true;

      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 800;
      bandpass.Q.value = 0.5;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.35;

      rainSource.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.masterGain);

      rainSource.start();
      this.nodes.push(rainSource, bandpass, gain);
    } else if (type === 'library') {
      // Warm Library Hum (gentle 120Hz + 60Hz ambient hum)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.value = 110;
      osc2.type = 'triangle';
      osc2.frequency.value = 55;

      gain1.gain.value = 0.15;

      osc1.connect(gain1);
      osc2.connect(gain1);
      gain1.connect(this.masterGain);

      osc1.start();
      osc2.start();

      this.nodes.push(osc1, osc2, gain1);
    }
  }
}

export const ambientSound = new AmbientSoundEngine();
