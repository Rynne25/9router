"use client";

import { useCallback, useSyncExternalStore } from "react";

const MOTION_STORAGE_KEY = "9router-hud-motion-paused";
const SOUND_STORAGE_KEY = "9router-hud-sound";
const CURSOR_STORAGE_KEY = "9router-hud-cursor-preset";
const PREFS_EVENT = "9router-hud-prefs-change";
const OPEN_PALETTE_EVENT = "9router-open-cmd-palette";

export const CURSOR_PRESETS = ["reticle", "fluid", "magnetic", "off"];
const DEFAULT_CURSOR_PRESET = "reticle";

let paletteOpenState = false;
const paletteListeners = new Set();
let paletteListenerAttached = false;

function notifyPaletteListeners() {
  for (const listener of paletteListeners) {
    listener();
  }
}

function ensurePaletteEventListener() {
  if (typeof window === "undefined" || paletteListenerAttached) return;
  paletteListenerAttached = true;
  window.addEventListener(OPEN_PALETTE_EVENT, () => {
    paletteOpenState = true;
    notifyPaletteListeners();
  });
}

function subscribePalette(callback) {
  ensurePaletteEventListener();
  paletteListeners.add(callback);
  return () => {
    paletteListeners.delete(callback);
  };
}

function getPaletteSnapshot() {
  return paletteOpenState;
}

function subscribePrefs(callback) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event) => {
    if (
      !event.key ||
      event.key === MOTION_STORAGE_KEY ||
      event.key === SOUND_STORAGE_KEY ||
      event.key === CURSOR_STORAGE_KEY
    ) {
      callback();
    }
  };
  window.addEventListener(PREFS_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function readBooleanStorage(key) {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBooleanStorage(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { key, value } }));
  } catch {
    // Ignore storage quota or privacy-mode failures
  }
}

function readCursorPresetStorage() {
  if (typeof window === "undefined") return DEFAULT_CURSOR_PRESET;
  try {
    const raw = window.localStorage.getItem(CURSOR_STORAGE_KEY);
    return CURSOR_PRESETS.includes(raw) ? raw : DEFAULT_CURSOR_PRESET;
  } catch {
    return DEFAULT_CURSOR_PRESET;
  }
}

function writeCursorPresetStorage(preset) {
  if (typeof window === "undefined") return;
  if (!CURSOR_PRESETS.includes(preset)) return;
  try {
    window.localStorage.setItem(CURSOR_STORAGE_KEY, preset);
    window.dispatchEvent(
      new CustomEvent(PREFS_EVENT, { detail: { key: CURSOR_STORAGE_KEY, value: preset } })
    );
  } catch {
    // Ignore storage quota or privacy-mode failures
  }
}

function getMotionPausedSnapshot() {
  return readBooleanStorage(MOTION_STORAGE_KEY);
}

function getSoundEnabledSnapshot() {
  return readBooleanStorage(SOUND_STORAGE_KEY);
}

function getCursorPresetSnapshot() {
  return readCursorPresetStorage();
}

function getDefaultCursorServerSnapshot() {
  return DEFAULT_CURSOR_PRESET;
}

function subscribeReducedMotion(callback) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getFalseServerSnapshot() {
  return false;
}

export function dispatchOpenCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT));
}

export function useHudPrefs() {
  const storedMotionPaused = useSyncExternalStore(
    subscribePrefs,
    getMotionPausedSnapshot,
    getFalseServerSnapshot
  );
  const systemReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getFalseServerSnapshot
  );
  const soundEnabled = useSyncExternalStore(
    subscribePrefs,
    getSoundEnabledSnapshot,
    getFalseServerSnapshot
  );
  const cursorPreset = useSyncExternalStore(
    subscribePrefs,
    getCursorPresetSnapshot,
    getDefaultCursorServerSnapshot
  );
  const commandPaletteOpen = useSyncExternalStore(
    subscribePalette,
    getPaletteSnapshot,
    getFalseServerSnapshot
  );

  const motionPaused = storedMotionPaused || systemReducedMotion;

  const toggleMotionPaused = useCallback(() => {
    const next = !readBooleanStorage(MOTION_STORAGE_KEY);
    writeBooleanStorage(MOTION_STORAGE_KEY, next);
  }, []);

  const toggleSoundEnabled = useCallback(() => {
    const next = !readBooleanStorage(SOUND_STORAGE_KEY);
    writeBooleanStorage(SOUND_STORAGE_KEY, next);
  }, []);

  const setCursorPreset = useCallback((preset) => {
    writeCursorPresetStorage(preset);
  }, []);

  const cycleCursorPreset = useCallback(() => {
    const current = getCursorPresetSnapshot();
    const idx = CURSOR_PRESETS.indexOf(current);
    const next = CURSOR_PRESETS[(idx + 1) % CURSOR_PRESETS.length];
    writeCursorPresetStorage(next);
    return next;
  }, []);

  const setCommandPaletteOpen = useCallback((nextValue) => {
    const resolved =
      typeof nextValue === "function" ? Boolean(nextValue(paletteOpenState)) : Boolean(nextValue);
    if (paletteOpenState !== resolved) {
      paletteOpenState = resolved;
      notifyPaletteListeners();
    }
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, [setCommandPaletteOpen]);

  const closeCommandPalette = useCallback(() => {
    setCommandPaletteOpen(false);
  }, [setCommandPaletteOpen]);

  return {
    motionPaused,
    toggleMotionPaused,
    soundEnabled,
    toggleSoundEnabled,
    cursorPreset,
    setCursorPreset,
    cycleCursorPreset,
    commandPaletteOpen,
    setCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
  };
}
