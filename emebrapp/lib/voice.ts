let audioUnlocked = false;

/** Call this inside any user gesture handler (click/touch) to unlock Safari audio. */
export const unlockAudio = () => {
  if (audioUnlocked || typeof window === "undefined") return;
  audioUnlocked = true;
  try {
    const utt = new SpeechSynthesisUtterance("");
    utt.volume = 0;
    window.speechSynthesis.speak(utt);
  } catch { /* ignore */ }
};

export interface ToastAction {
  label: string;
  type: "mark_taken";
  medId: string;
}

/** Show an Ember toast notification without speaking. */
export const showToast = (message: string, action?: ToastAction) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ember-toast", { detail: { message, action } }));
};

/** Speak text aloud (en-US female voice) and show a toast. Only speaks after audio has been unlocked. */
export const speak = (text: string, opts: { toast?: boolean } = {}) => {
  const { toast = true } = opts;
  if (typeof window === "undefined") return;
  if (toast) showToast(text);
  if (!audioUnlocked || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const doSpeak = () => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.85;
    utt.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice =
      voices.find(v => v.lang.startsWith("en") && (
        v.name.includes("Samantha") || v.name.includes("Karen") ||
        v.name.includes("Moira")    || v.name.includes("Tessa") ||
        v.name.toLowerCase().includes("female")
      )) ?? voices.find(v => v.lang.startsWith("en"));
    if (femaleVoice) utt.voice = femaleVoice;
    window.speechSynthesis.speak(utt);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      doSpeak();
    };
  }
};
