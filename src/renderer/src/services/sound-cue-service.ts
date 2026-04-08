type OscillatorTone = {
  frequency: number;
  durationMs: number;
  gain: number;
  type?: OscillatorType;
  glideToFrequency?: number;
  glideMs?: number;
  pauseAfterMs?: number;
  overtoneFrequency?: number;
  overtoneGainRatio?: number;
  filterFrequency?: number;
};

class SoundCueService {
  private audioContext: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  private enabled = true;

  public configure(options: { enabled: boolean }): void {
    this.enabled = options.enabled;
  }

  public prime(): void {
    if (!this.enabled) {
      return;
    }

    const context = this.getAudioContext();
    if (!context) {
      return;
    }

    void context.resume().catch(() => undefined);
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (this.audioContext) {
      return this.audioContext;
    }

    const Ctx =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!Ctx) {
      return null;
    }

    this.audioContext = new Ctx();
    return this.audioContext;
  }

  private getOutputNode(context: AudioContext): AudioNode {
    if (this.outputNode) {
      return this.outputNode;
    }

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, context.currentTime);
    compressor.knee.setValueAtTime(22, context.currentTime);
    compressor.ratio.setValueAtTime(3.2, context.currentTime);
    compressor.attack.setValueAtTime(0.004, context.currentTime);
    compressor.release.setValueAtTime(0.16, context.currentTime);

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.48, context.currentTime);

    compressor.connect(masterGain);
    masterGain.connect(context.destination);
    this.outputNode = compressor;
    return compressor;
  }

  private playPattern(pattern: OscillatorTone[]): void {
    const context = this.getAudioContext();
    if (!this.enabled || !context || pattern.length === 0) {
      return;
    }

    const outputNode = this.getOutputNode(context);
    void context.resume().catch(() => undefined);

    const now = context.currentTime;
    let cursor = now;

    for (const tone of pattern) {
      const oscillatorMain = context.createOscillator();
      const oscillatorOvertone = context.createOscillator();
      const gain = context.createGain();
      const filter = context.createBiquadFilter();

      oscillatorMain.type = tone.type ?? "sine";
      oscillatorMain.frequency.setValueAtTime(tone.frequency, cursor);
      oscillatorOvertone.type = "sine";
      oscillatorOvertone.frequency.setValueAtTime(
        tone.overtoneFrequency ?? tone.frequency * 2,
        cursor,
      );

      if (
        typeof tone.glideToFrequency === "number" &&
        Number.isFinite(tone.glideToFrequency)
      ) {
        oscillatorMain.frequency.exponentialRampToValueAtTime(
          Math.max(1, tone.glideToFrequency),
          cursor +
            Math.max(0.01, (tone.glideMs ?? tone.durationMs * 0.65) / 1000),
        );

        oscillatorOvertone.frequency.exponentialRampToValueAtTime(
          Math.max(1, (tone.overtoneFrequency ?? tone.frequency * 2) * 0.95),
          cursor +
            Math.max(0.01, (tone.glideMs ?? tone.durationMs * 0.65) / 1000),
        );
      }

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(tone.filterFrequency ?? 1500, cursor);
      filter.Q.setValueAtTime(0.5, cursor);

      gain.gain.setValueAtTime(0.0001, cursor);
      const attackSeconds = Math.min(0.026, (tone.durationMs / 1000) * 0.3);
      const sustainEndAt = cursor + tone.durationMs / 1000;
      const releaseStartAt = Math.max(
        cursor + attackSeconds + 0.016,
        sustainEndAt - 0.03,
      );

      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain),
        cursor + attackSeconds,
      );
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, tone.gain * 0.68),
        releaseStartAt,
      );

      const endAt = sustainEndAt;
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

      const overtoneGain = context.createGain();
      overtoneGain.gain.setValueAtTime(
        Math.max(0.0001, tone.gain * (tone.overtoneGainRatio ?? 0.16)),
        cursor,
      );

      oscillatorMain.connect(filter);
      oscillatorOvertone.connect(overtoneGain);
      overtoneGain.connect(filter);
      filter.connect(gain);
      gain.connect(outputNode);
      oscillatorMain.start(cursor);
      oscillatorOvertone.start(cursor);
      oscillatorMain.stop(endAt + 0.04);
      oscillatorOvertone.stop(endAt + 0.04);

      cursor = endAt + (tone.pauseAfterMs ?? 22) / 1000;
    }
  }

  public playMemberJoined(): void {
    this.playPattern([
      {
        frequency: 494,
        glideToFrequency: 554,
        durationMs: 88,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1420,
        overtoneGainRatio: 0.12,
      },
      {
        frequency: 659,
        glideToFrequency: 740,
        durationMs: 102,
        gain: 0.022,
        type: "triangle",
        filterFrequency: 1680,
        overtoneGainRatio: 0.1,
      },
    ]);
  }

  public playMemberLeft(): void {
    this.playPattern([
      {
        frequency: 587,
        glideToFrequency: 520,
        durationMs: 86,
        gain: 0.019,
        type: "triangle",
        filterFrequency: 1380,
      },
      {
        frequency: 440,
        glideToFrequency: 370,
        durationMs: 112,
        gain: 0.021,
        type: "sine",
        filterFrequency: 1280,
      },
    ]);
  }

  public playCameraEnabled(): void {
    this.playPattern([
      {
        frequency: 740,
        glideToFrequency: 820,
        durationMs: 78,
        gain: 0.018,
        type: "sine",
        filterFrequency: 1900,
        overtoneGainRatio: 0.08,
      },
      {
        frequency: 932,
        glideToFrequency: 988,
        durationMs: 90,
        gain: 0.019,
        type: "triangle",
        filterFrequency: 2100,
        overtoneGainRatio: 0.07,
      },
    ]);
  }

  public playScreenEnabled(): void {
    this.playPattern([
      {
        frequency: 392,
        glideToFrequency: 430,
        durationMs: 92,
        gain: 0.02,
        type: "triangle",
        filterFrequency: 1320,
      },
      {
        frequency: 523,
        glideToFrequency: 580,
        durationMs: 108,
        gain: 0.021,
        type: "sine",
        filterFrequency: 1480,
      },
    ]);
  }

  public playMicToggle(enabled: boolean): void {
    if (enabled) {
      this.playPattern([
        {
          frequency: 680,
          glideToFrequency: 740,
          durationMs: 86,
          gain: 0.02,
          type: "triangle",
          filterFrequency: 1720,
          overtoneGainRatio: 0.08,
        },
      ]);
      return;
    }

    this.playPattern([
      {
        frequency: 440,
        glideToFrequency: 360,
        durationMs: 105,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1240,
      },
    ]);
  }

  public playHeadphoneToggle(enabled: boolean): void {
    if (enabled) {
      this.playPattern([
        {
          frequency: 554,
          glideToFrequency: 620,
          durationMs: 86,
          gain: 0.019,
          type: "triangle",
          filterFrequency: 1540,
          overtoneGainRatio: 0.08,
        },
      ]);
      return;
    }

    this.playPattern([
      {
        frequency: 392,
        glideToFrequency: 320,
        durationMs: 108,
        gain: 0.02,
        type: "sine",
        filterFrequency: 1180,
      },
    ]);
  }
}

export const soundCueService = new SoundCueService();
