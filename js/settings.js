import { STORAGE_SETTINGS } from "./constants.js";

const DEFAULTS = {
  quality: "high",
  sfx: 0.75,
  music: 0.28,
  aimSensitivity: 1,
  cameraSpeed: 1,
  cameraDistance: 1,
  language: "pt-BR",
  vibrate: true,
  fullscreen: false,
  aimAssist: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  const next = { ...DEFAULTS, ...settings };
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(next));
  return next;
}

export { DEFAULTS as DEFAULT_SETTINGS };
