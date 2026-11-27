"use client";

const HUD_SOUND_STORAGE_KEY = "9router-hud-sound";

let sharedAudioContext = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioCtx();
  }
  if (sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
}

function playTone(ctx, startOffset, frequency, durationSec, peakGain, wave = "sine") {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + Math.min(0.008, durationSec * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + durationSec + 0.005);
}

/**
 * Play a subtle tactical HUD audio cue via Web Audio API.
 * Only plays when localStorage "9router-hud-sound" === "true".
 * @param {"click" | "toggle" | "confirm" | "alert"} type
 */
export function playHudSound(type = "click") {
  try {
    if (typeof window === "undefined") return;
    if (window.localStorage?.getItem(HUD_SOUND_STORAGE_KEY) !== "true") return;

    const ctx = getAudioContext();
    if (!ctx) return;

    switch (type) {
      case "toggle":
        playTone(ctx, 0, 520, 0.035, 0.035, "triangle");
        playTone(ctx, 0.032, 740, 0.042, 0.035, "sine");
        break;
      case "confirm":
        playTone(ctx, 0, 620, 0.035, 0.038, "sine");
        playTone(ctx, 0.035, 930, 0.045, 0.04, "sine");
        break;
      case "alert":
        playTone(ctx, 0, 420, 0.04, 0.04, "sawtooth");
        playTone(ctx, 0.04, 310, 0.04, 0.04, "triangle");
        break;
      case "click":
      default:
        playTone(ctx, 0, 760, 0.032, 0.032, "sine");
        break;
    }
  } catch {
    // Fail silently if Web Audio API or storage is unavailable
  }
}
