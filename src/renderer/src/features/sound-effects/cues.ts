import type { OscillatorTone } from "./types";

// The UI cues: joining, leaving, going live, opening a microphone.
//
// These were eight two-note glides in the same 400-990 Hz band, with the same
// sine/triangle timbre and the same ~90ms shape, played at a gain of 0.02. Two
// complaints, and they were the same complaint: you could barely hear them, and
// when you did you could not tell which one you had heard.
//
// Turning them up alone would only have turned a quiet beep into a loud one.
// What makes a sound soft is its TAIL, not its level — a note that stops dead is
// harsh at any volume, and one that decays over a few hundred milliseconds is
// gentle at almost any volume. So every cue here is a short body with a long
// release, which is what lets them sit two to three times louder than before and
// still read as soft.
//
// Telling them apart is a separate job, and pitch alone does not do it. Each cue
// is described by five things, and no two cues are alike in fewer than two of
// them:
//
//   cue           notes  contour  register  attack  body    timbre
//   ------------  -----  -------  --------  ------  ------  --------
//   self join       3    rising    mid      sharp   long    sine
//   self leave      3    falling   mid      sharp   long    triangle
//   member join     2    rising    high     sharp   long    sine
//   member left     2    falling   mid      sharp   long    sine
//   stream on       2    rising    mid      SWELL   long    triangle
//   camera on       2    flat      high     sharp   short   sine
//   mic on          1    flat      high     sharp   short   triangle
//   mic off         1    falling   mid      sharp   short   triangle
//   headphone on    2    rising    mid      sharp   short   triangle
//   headphone off   2    falling   low      sharp   short   triangle
//
// The note COUNT alone separates the microphone (one) from the toggles and
// person-cues (two) from arriving and leaving yourself (three); direction,
// register and length finish the job. The stream cue is the one that has to cut
// through a room that is already talking, so it is the only one that fades in —
// nothing else in the app has a slow attack, which makes it recognisable before
// the pitch even registers.
//
// The two toggle pairs are deliberately siblings rather than strangers: mic
// on/off and headphone on/off are one control in two states, so they share a
// shape and differ in direction. Every other pair of cues is two different
// events and has to be told apart on its own.
//
// Frequencies come from a C-major pentatonic (C, D, E, G, A). Cues overlap all
// the time — somebody joins while your microphone opens — so this is what makes
// any two of them consonant by construction rather than by luck.
export const CUE_PATTERNS = {
  // C5 - E5 - G5. The only cue that is a full chord: arriving somewhere is the
  // largest of these events and the only one worth three notes.
  selfJoinedLobby: [
    { frequency: 523.25, durationMs: 84, gain: 0.062, type: "sine", filterFrequency: 3200, overtoneGainRatio: 0.2, attackMs: 8, releaseMs: 300, pauseAfterMs: 0 },
    { frequency: 659.25, durationMs: 84, gain: 0.06, type: "sine", filterFrequency: 3400, overtoneGainRatio: 0.18, attackMs: 8, releaseMs: 340, pauseAfterMs: 0 },
    { frequency: 783.99, durationMs: 120, gain: 0.064, type: "sine", filterFrequency: 3600, overtoneGainRatio: 0.22, attackMs: 8, releaseMs: 620, pauseAfterMs: 0 },
  ],
  // The same three notes descending, on triangle instead of sine: woodier and
  // less bright, so it reads as a door closing rather than opening even though
  // the pitches are identical.
  selfLeftLobby: [
    { frequency: 783.99, durationMs: 84, gain: 0.056, type: "triangle", filterFrequency: 2200, overtoneGainRatio: 0.12, attackMs: 10, releaseMs: 300, pauseAfterMs: 0 },
    { frequency: 659.25, durationMs: 84, gain: 0.054, type: "triangle", filterFrequency: 2000, overtoneGainRatio: 0.1, attackMs: 10, releaseMs: 340, pauseAfterMs: 0 },
    { frequency: 523.25, durationMs: 130, gain: 0.058, type: "triangle", filterFrequency: 1800, overtoneGainRatio: 0.1, attackMs: 10, releaseMs: 620, pauseAfterMs: 0 },
  ],
  // A5 up to E6. Somebody else arriving is smaller news than arriving yourself,
  // so it is two notes rather than three — and an octave above them, where it
  // stays clear of a conversation instead of sitting in it.
  memberJoined: [
    { frequency: 880, durationMs: 64, gain: 0.056, type: "sine", filterFrequency: 4800, overtoneGainRatio: 0.24, attackMs: 6, releaseMs: 260, pauseAfterMs: 0 },
    { frequency: 1318.5, durationMs: 92, gain: 0.058, type: "sine", filterFrequency: 5200, overtoneGainRatio: 0.26, attackMs: 6, releaseMs: 460, pauseAfterMs: 0 },
  ],
  // D5 down to G4: the arrival's mirror, a fifth falling instead of rising, and
  // an octave lower so the pair cannot be confused in a noisy room.
  memberLeft: [
    { frequency: 587.33, durationMs: 84, gain: 0.058, type: "sine", filterFrequency: 2000, overtoneGainRatio: 0.18, attackMs: 10, releaseMs: 300, pauseAfterMs: 0 },
    { frequency: 392, durationMs: 124, gain: 0.062, type: "sine", filterFrequency: 1600, overtoneGainRatio: 0.2, attackMs: 10, releaseMs: 560, pauseAfterMs: 0 },
  ],
  // Going live. A low swell bending upward with a bright bell landing on its
  // tail. The slow attack is the signature — it is the only cue in the app that
  // fades in, and that is what makes it unmistakable.
  screenEnabled: [
    { frequency: 261.63, glideToFrequency: 392, glideMs: 220, durationMs: 240, gain: 0.06, type: "triangle", filterFrequency: 1500, overtoneGainRatio: 0.22, attackMs: 80, releaseMs: 420, pauseAfterMs: 30 },
    { frequency: 783.99, durationMs: 90, gain: 0.055, type: "sine", filterFrequency: 3600, overtoneGainRatio: 0.3, attackMs: 6, releaseMs: 520, pauseAfterMs: 0 },
  ],
  // Two identical high ticks. The shortest bodies in the set and the only cue
  // that does not move in pitch at all, so it reads as a shutter rather than a
  // note.
  cameraEnabled: [
    { frequency: 1318.5, durationMs: 38, gain: 0.05, type: "sine", filterFrequency: 5600, overtoneGainRatio: 0.18, attackMs: 4, releaseMs: 170, pauseAfterMs: 34 },
    { frequency: 1318.5, durationMs: 44, gain: 0.052, type: "sine", filterFrequency: 5600, overtoneGainRatio: 0.18, attackMs: 4, releaseMs: 240, pauseAfterMs: 0 },
  ],
  // One note, and the only cues in the set that are. A microphone is toggled
  // dozens of times an hour, so this has to be the most self-effacing sound
  // here while still being audible.
  micOn: [
    { frequency: 880, durationMs: 46, gain: 0.046, type: "triangle", filterFrequency: 3000, overtoneGainRatio: 0.12, attackMs: 4, releaseMs: 190 },
  ],
  micOff: [
    { frequency: 587.33, glideToFrequency: 523.25, durationMs: 56, gain: 0.044, type: "triangle", filterFrequency: 1700, overtoneGainRatio: 0.1, attackMs: 5, releaseMs: 230 },
  ],
  // Two short notes, low and dull. Deafening yourself plays the same shape
  // inverted with the filter dropped an octave — the sound equivalent of hands
  // over ears, rather than an unrelated noise to memorise.
  headphoneOn: [
    { frequency: 392, durationMs: 42, gain: 0.048, type: "triangle", filterFrequency: 1400, overtoneGainRatio: 0.12, attackMs: 6, releaseMs: 170, pauseAfterMs: 0 },
    { frequency: 523.25, durationMs: 58, gain: 0.05, type: "triangle", filterFrequency: 1500, overtoneGainRatio: 0.12, attackMs: 6, releaseMs: 260, pauseAfterMs: 0 },
  ],
  headphoneOff: [
    { frequency: 523.25, durationMs: 42, gain: 0.048, type: "triangle", filterFrequency: 900, overtoneGainRatio: 0.08, attackMs: 8, releaseMs: 170, pauseAfterMs: 0 },
    { frequency: 329.63, durationMs: 58, gain: 0.05, type: "triangle", filterFrequency: 750, overtoneGainRatio: 0.08, attackMs: 8, releaseMs: 280, pauseAfterMs: 0 },
  ],
} satisfies Record<string, OscillatorTone[]>;

/** The two controls whose on/off states are meant to sound like each other. */
export const CUE_SIBLING_PAIRS: Array<[keyof typeof CUE_PATTERNS, keyof typeof CUE_PATTERNS]> = [
  ["micOn", "micOff"],
  ["headphoneOn", "headphoneOff"],
];
