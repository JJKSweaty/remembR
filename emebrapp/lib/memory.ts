// ── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  name: string;
  address: string;
  medications: { name: string; dose: string; time: string }[];
  schedule: { time: string; label: string; section: "Morning" | "Afternoon" | "Evening" }[];
}

export interface ItemLocation {
  location: string;
  date: string;
}

export interface MedLog {
  date: string;
  name: string;
  dose: string;
  taken: boolean;
  time: string;
}

export interface ChatEntry {
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export interface ConfusedEpisode {
  date: string;
  time: string;
  resolved: boolean;
}

export interface MoodLog {
  date: string;
  time: string;
  mood: "happy" | "tired" | "sad" | "anxious" | "calm";
}

export interface MealLog {
  meal: string;
  time: string;
  date: string;
}

export interface MemoryStore {
  lastSeenItems: Record<string, ItemLocation>;
  medicationHistory: MedLog[];
  chatHistory: ChatEntry[];
  routinePatterns: {
    wakeTime?: string;
    sleepTime?: string;
    mealsLogged: MealLog[];
  };
  confusedEpisodes: ConfusedEpisode[];
  moodHistory: MoodLog[];
  wellnessNotes: { author: string; content: string; date: string }[];
}

// ── User Profile ─────────────────────────────────────────────────────────────

const PROFILE_KEY = "ember_profile";

const defaultProfile: UserProfile = {
  name: "",
  address: "",
  medications: [],
  schedule: [
    { time: "8:00 AM",  label: "Breakfast",        section: "Morning" },
    { time: "12:00 PM", label: "Lunch",             section: "Afternoon" },
    { time: "6:00 PM",  label: "Dinner",            section: "Evening" },
    { time: "9:00 PM",  label: "Wind down",         section: "Evening" },
  ],
};

export function getUserProfile(): UserProfile {
  if (typeof window === "undefined") return defaultProfile;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile;
    return { ...defaultProfile, ...JSON.parse(raw) } as UserProfile;
  } catch {
    return defaultProfile;
  }
}

export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getUserName(): string {
  const profile = getUserProfile();
  return profile.name || "there";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const KEY = "ember_memory";

function loadStore(): MemoryStore {
  const defaults = emptyStore();
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // Merge defaults to handle missing keys in older data
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function emptyStore(): MemoryStore {
  return {
    lastSeenItems: {},
    medicationHistory: [],
    chatHistory: [],
    routinePatterns: { mealsLogged: [] },
    confusedEpisodes: [],
    moodHistory: [],
    wellnessNotes: [
      { author: "Sarah", content: "Thinking of you today! Can't wait to see you for dinner tonight. Love you!", date: new Date().toISOString() }
    ],
  };
}

function saveStore(store: MemoryStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
}

// ── Public API ───────────────────────────────────────────────────────────────

export function saveMemory<K extends keyof MemoryStore>(key: K, value: MemoryStore[K]): void {
  const store = loadStore();
  store[key] = value;
  saveStore(store);
}

export function getMemory<K extends keyof MemoryStore>(key: K): MemoryStore[K] {
  return loadStore()[key];
}

export function logItemFound(itemName: string, location: string): void {
  const store = loadStore();
  store.lastSeenItems[itemName.toLowerCase()] = {
    location,
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  };
  saveStore(store);
}

export function logMedication(entry: Omit<MedLog, "date">): void {
  const store = loadStore();
  store.medicationHistory.push({
    ...entry,
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  });
  // Keep last 30 entries
  if (store.medicationHistory.length > 30) {
    store.medicationHistory = store.medicationHistory.slice(-30);
  }
  saveStore(store);
}

export function logChatMessage(entry: Omit<ChatEntry, "timestamp">): void {
  const store = loadStore();
  store.chatHistory.push({ ...entry, timestamp: new Date().toISOString() });
  // Keep last 50 messages
  if (store.chatHistory.length > 50) {
    store.chatHistory = store.chatHistory.slice(-50);
  }
  saveStore(store);
}

export function logConfusedEpisode(): void {
  const store = loadStore();
  store.confusedEpisodes.push({
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    resolved: false,
  });
  saveStore(store);
}

export function resolveLastConfusedEpisode(): void {
  const store = loadStore();
  const last = store.confusedEpisodes.findLast(e => !e.resolved);
  if (last) last.resolved = true;
  saveStore(store);
}

export function logMood(mood: MoodLog["mood"]): void {
  const store = loadStore();
  store.moodHistory.push({
    date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" }),
    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    mood,
  });
  // Keep last 30 entries
  if (store.moodHistory.length > 30) {
    store.moodHistory = store.moodHistory.slice(-30);
  }
  saveStore(store);
}

export function getWellnessNotes() {
  const store = loadStore();
  return store.wellnessNotes;
}

export function addWellnessNote(author: string, content: string): void {
  const store = loadStore();
  store.wellnessNotes.unshift({
    author,
    content,
    date: new Date().toISOString(),
  });
  // Keep last 5 notes
  if (store.wellnessNotes.length > 5) {
    store.wellnessNotes = store.wellnessNotes.slice(0, 5);
  }
  saveStore(store);
}

export function getFullContext(): string {
  const store = loadStore();
  const profile = getUserProfile();
  const name = profile.name || "the user";
  const parts: string[] = [];

  // Routine
  if (store.routinePatterns.wakeTime) {
    parts.push(`${name} usually wakes around ${store.routinePatterns.wakeTime}.`);
  }

  // Today's meds
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const todayMeds = store.medicationHistory.filter(m => m.date === today);
  if (todayMeds.length > 0) {
    const takenToday = todayMeds.filter(m => m.taken).map(m => m.name);
    const notTaken = todayMeds.filter(m => !m.taken).map(m => m.name);
    if (takenToday.length > 0) parts.push(`They took ${takenToday.join(", ")} today.`);
    if (notTaken.length > 0) parts.push(`They have not yet taken ${notTaken.join(", ")}.`);
  }

  // Item locations
  const items = Object.entries(store.lastSeenItems);
  if (items.length > 0) {
    const recent = items.slice(-3);
    for (const [item, data] of recent) {
      parts.push(`They last found their ${item} at ${data.location} on ${data.date}.`);
    }
  }

  // Confused episodes
  const recentConfused = store.confusedEpisodes.filter(e => e.date === today);
  if (recentConfused.length > 0) {
    parts.push(`They had ${recentConfused.length} confused episode${recentConfused.length > 1 ? "s" : ""} today.`);
  } else {
    const yesterday = store.confusedEpisodes.slice(-3);
    if (yesterday.length > 0) {
      const last = yesterday[yesterday.length - 1];
      parts.push(`They had a confused episode at ${last.time} on ${last.date}.`);
    }
  }

  // Moods
  const todayMoods = store.moodHistory.filter(m => m.date === today);
  if (todayMoods.length > 0) {
    const lastMood = todayMoods[todayMoods.length - 1].mood;
    parts.push(`They felt ${lastMood} recently.`);
  }

  if (parts.length === 0) return "No activity recorded yet today.";
  return `User's name: ${name}. ` + parts.join(" ");
}
