// ── Ember Speech Helper ──────────────────────────────────────────────────────
// Picks a warm, natural-sounding voice and provides a single speak() function.

const PREFERRED_VOICES = [
  "Samantha",       // iOS/macOS — warm, natural
  "Karen",          // iOS/macOS — Australian, friendly
  "Moira",          // iOS/macOS — Irish, gentle
  "Tessa",          // iOS/macOS — South African, calm
  "Google UK English Female",
  "Google US English",
  "Microsoft Zira",  // Windows — female, natural
  "Microsoft Jenny", // Windows — newer, nicer
];

let cachedVoice: SpeechSynthesisVoice | null = null;

function getBestVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof window === "undefined" || !window.speechSynthesis) return null;

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Try preferred voices first
  for (const preferred of PREFERRED_VOICES) {
    const match = voices.find(
      (v) => v.name.includes(preferred) && v.lang.startsWith("en")
    );
    if (match) {
      cachedVoice = match;
      return match;
    }
  }

  // Fallback: pick any English female-sounding voice (heuristic: name contains common female names)
  const femaleNames = ["female", "woman", "zira", "hazel", "susan", "jenny", "samantha", "karen", "fiona"];
  const femaleFallback = voices.find(
    (v) =>
      v.lang.startsWith("en") &&
      femaleNames.some((n) => v.name.toLowerCase().includes(n))
  );
  if (femaleFallback) {
    cachedVoice = femaleFallback;
    return femaleFallback;
  }

  // Last resort: any English voice
  const anyEnglish = voices.find((v) => v.lang.startsWith("en"));
  if (anyEnglish) {
    cachedVoice = anyEnglish;
    return anyEnglish;
  }

  return null;
}

/**
 * Speak text aloud using a warm, natural voice.
 * Automatically picks the best available voice for the platform.
 */
export function speak(text: string, rate = 0.88): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.pitch = 1.05; // Slightly higher pitch = warmer

  const voice = getBestVoice();
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop all speech immediately.
 */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Preload voices (call early so they're ready when needed).
 * Safari sometimes needs a small delay before voices are available.
 */
export function preloadVoices(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  // Force voice loading
  window.speechSynthesis.getVoices();

  // Safari fires voiceschanged event when voices are loaded
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null; // Reset cache so we pick from full list
    getBestVoice();
  };
}
