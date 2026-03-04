import { Track, Mood, GeneratedMetadata } from "../types.js";

interface KeywordTheme {
  mood: Mood;
  hook: string;
  subtitle: string;
  mixDescription: string;
  sonicDescription: string;
  qualities: string;
  perfectFor: string[];
  cta: string;
  hashtags: string[];
}

const KEYWORD_THEMES: Record<string, KeywordTheme> = {
  "build the system": {
    mood: "focus",
    hook: "Stop chasing motivation. Build the system.",
    subtitle: "Deep Focus Ambient for Discipline, Coding & Long Work Sessions (2 Hours)",
    mixDescription: "This deep ambient focus mix is designed for long, distraction-free work sessions — coding, studying, writing, or building something that matters.",
    sonicDescription: "Slow evolving textures, warm atmospheric pads, and minimal movement create a stable mental environment for sustained concentration and flow.",
    qualities: "structure, clarity, and momentum",
    perfectFor: [
      "Deep work & long focus sessions",
      "Programming & creative building",
      "Studying & learning",
      "Strategic thinking & planning",
      "Daily discipline routines",
    ],
    cta: "Put it on. Remove the noise.\nConsistency builds results.",
    hashtags: ["#buildthesystem", "#productivitymusic", "#workmusic", "#studymusic", "#codingmusic"],
  },
};

const BASE_HASHTAGS = [
  "#deepfocus",
  "#ambientmusic",
  "#focusmusic",
  "#deepwork",
  "#concentrationmusic",
  "#flowstate",
  "#distractionfree",
  "#ambientfocus",
  "#longfocus",
];

const BASE_TAGS = [
  "lofi", "lofi music", "ambient music", "focus music", "deep focus",
  "study music", "coding music", "work music", "productivity music",
  "concentration music", "lofi beats", "ambient focus", "flow state",
  "distraction free", "lofi mix", "2 hour mix", "long mix",
  "background music", "chill beats", "programming music",
];

// --- Hash-based deterministic combinator ---

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFrom<T>(arr: T[], hash: number, salt: number): T {
  return arr[((hash + salt * 2654435761) >>> 0) % arr.length];
}

// --- Subtitle components ---

const SUBTITLE_GENRES: Record<Mood, string[]> = {
  focus: [
    "Deep Focus Lo-Fi Ambient",
    "Deep Focus Music",
    "Luxury Deep Focus Mix",
    "Lo-Fi Focus Ambient",
    "Deep Focus Ambient",
    "Lo-Fi Focus Music",
    "Deep Focus Lo-Fi Mix",
  ],
  relax: [
    "Soft Ambient Lo-Fi Music",
    "Gentle Lo-Fi Ambient",
    "Calm Ambient Mix",
    "Soft Lo-Fi Ambient",
    "Lo-Fi Ambient",
  ],
  ambient: [
    "Deep Ambient Soundscapes",
    "Immersive Lo-Fi Ambient",
    "Atmospheric Lo-Fi Mix",
    "Deep Lo-Fi Ambient",
    "Lo-Fi Ambient Mix",
  ],
};

const SUBTITLE_USE_CASES: Record<Mood, string[]> = {
  focus: [
    "Work, Coding & Study",
    "Calm Productivity, Coding & Deep Work",
    "Productivity, Coding & Peak Performance",
    "Work, Programming & Flow State",
    "Long Work Sessions, Study & Concentration",
    "Deep Work, Coding & Productive Flow",
    "Coding, Writing & Study Sessions",
    "Productivity, Focus & Deep Work",
    "Work, Study & Concentration",
    "Programming, Deep Work & Focus",
  ],
  relax: [
    "Deep Calm & Rest",
    "Relaxation, Unwinding & Evening Comfort",
    "Rest & Peaceful Evenings",
    "Calm, Comfort & Stillness",
    "Quiet Evenings & Deep Rest",
  ],
  ambient: [
    "Contemplation & Creative Flow",
    "Atmosphere, Depth & Presence",
    "Creative Thinking & Reflection",
    "Deep Thought & Inner Focus",
    "Presence, Creativity & Flow",
  ],
};

const SUBTITLE_SUFFIXES: Record<Mood, string[]> = {
  focus: ["", "", "", "(No Distractions)", "(2 Hours)"],
  relax: ["", "", ""],
  ambient: ["", "", ""],
};

function buildSubtitle(keyword: string, mood: Mood): string {
  const h = hashCode(keyword.toLowerCase().trim());
  const genre = pickFrom(SUBTITLE_GENRES[mood], h, 1);
  const useCase = pickFrom(SUBTITLE_USE_CASES[mood], h, 2);
  const suffix = pickFrom(SUBTITLE_SUFFIXES[mood], h, 3);
  let result = `${genre} for ${useCase}`;
  if (suffix) result += ` ${suffix}`;
  return result;
}

// --- Hook components ---

const HOOK_TEMPLATES: Record<Mood, string[]> = {
  focus: [
    "{kw}. Let everything else fade.",
    "{kw}. Block out the world.",
    "{kw}. No shortcuts. No noise.",
    "{kw}. This is your signal.",
    "Find your {kw}. Let everything else disappear.",
    "This is {kw}. Nothing else matters right now.",
    "{kw}. Tune in. Lock in. Build.",
    "Enter {kw}. Leave distractions behind.",
    "{kw}. The only mode that matters.",
  ],
  relax: [
    "{kw}. Let the world slow down.",
    "{kw}. Breathe. Settle. Be still.",
    "Sink into {kw}. The day is done.",
    "{kw}. Nothing to chase. Nowhere to be.",
    "This is {kw}. Let it carry you.",
  ],
  ambient: [
    "{kw}. Fill the space.",
    "{kw}. Let the sound do the thinking.",
    "Enter {kw}. Drift through layers of sound.",
    "{kw}. Atmosphere is everything.",
    "This is {kw}. Immerse yourself.",
  ],
};

// --- Mix description components ---

const MIX_OPENINGS: Record<Mood, string[]> = {
  focus: [
    "This deep ambient focus mix",
    "A carefully crafted ambient soundscape",
    "This immersive lo-fi ambient mix",
    "A deep sonic environment",
    "This ambient focus session",
    "An extended lo-fi ambient experience",
  ],
  relax: [
    "This gentle ambient mix",
    "A soothing lo-fi ambient experience",
    "This warm ambient session",
    "A calming sonic journey",
    "This peaceful ambient mix",
  ],
  ambient: [
    "This deep atmospheric mix",
    "An immersive ambient experience",
    "This layered ambient soundscape",
    "A rich sonic journey",
    "This expansive ambient session",
  ],
};

const MIX_PURPOSES: Record<Mood, string[]> = {
  focus: [
    "is designed for long, distraction-free work sessions",
    "is built for sustained mental performance",
    "provides the perfect backdrop for deep, uninterrupted work",
    "is engineered for hours of focused concentration",
    "creates the ideal conditions for deep work",
    "is shaped for total immersion in your craft",
  ],
  relax: [
    "is designed for winding down after a long day",
    "creates a peaceful space for rest and recovery",
    "is built for moments of quiet and calm",
    "provides a gentle backdrop for relaxation",
    "is crafted for evenings of stillness and comfort",
  ],
  ambient: [
    "transforms your space with rich atmospheric depth",
    "creates an immersive sonic environment",
    "fills your room with layered textures and presence",
    "is designed for atmosphere and contemplation",
    "builds a deep, enveloping sonic world",
  ],
};

const MIX_ACTIVITIES: Record<Mood, string[]> = {
  focus: [
    "coding, studying, writing, or building something that matters",
    "programming, creative work, or any task that demands full attention",
    "deep study, focused coding, or long creative sessions",
    "writing, research, or any work that requires total immersion",
    "coding, learning, or building with purpose",
    "work that moves the needle — one session at a time",
  ],
  relax: [
    "reading, journaling, or simply doing nothing",
    "meditation, gentle stretching, or quiet evenings",
    "decompressing, reflecting, or drifting off to sleep",
    "unwinding, breathing, or letting go of the day",
  ],
  ambient: [
    "thinking, creating, or simply being present",
    "contemplation, creative exploration, or quiet focus",
    "deep listening, reflection, or atmospheric background",
    "presence, creativity, or moments of quiet thought",
  ],
};

function buildMixDescription(mood: Mood, hash: number): string {
  const opening = pickFrom(MIX_OPENINGS[mood], hash, 11);
  const purpose = pickFrom(MIX_PURPOSES[mood], hash, 12);
  const activities = pickFrom(MIX_ACTIVITIES[mood], hash, 13);
  return `${opening} ${purpose} — ${activities}.`;
}

// --- Sonic description components ---

const SONIC_TEXTURES: Record<Mood, string[]> = {
  focus: [
    "Slow evolving textures",
    "Warm layered pads",
    "Minimal ambient drones",
    "Gentle sonic layers",
    "Deep atmospheric washes",
    "Soft harmonic fields",
  ],
  relax: [
    "Gentle flowing textures",
    "Warm, unhurried tones",
    "Soft ambient washes",
    "Delicate harmonic layers",
    "Light floating textures",
  ],
  ambient: [
    "Rich evolving textures",
    "Dense atmospheric layers",
    "Expansive sonic fields",
    "Deep resonant washes",
    "Shifting tonal landscapes",
  ],
};

const SONIC_CHARACTERS: Record<Mood, string[]> = {
  focus: [
    "warm atmospheric pads, and minimal movement",
    "subtle harmonic shifts, and soft spatial depth",
    "gentle low-end warmth, and airy high frequencies",
    "delicate ambient layers, and slow rhythmic pulses",
    "rich overtones, and quiet textural detail",
    "steady tonal beds, and careful sonic spacing",
  ],
  relax: [
    "featherlight reverbs, and gentle harmonic drift",
    "smooth tonal waves, and quiet melodic hints",
    "airy pads, and slow dissolving echoes",
    "warm low frequencies, and soft high shimmer",
  ],
  ambient: [
    "complex harmonic interplay, and deep spatial reverb",
    "shifting tonal layers, and rich sonic movement",
    "broad frequency washes, and intricate detail",
    "layered resonance, and evolving harmonic depth",
  ],
};

const SONIC_EFFECTS: Record<Mood, string[]> = {
  focus: [
    "create a stable mental environment for sustained concentration and flow",
    "build a calm foundation for deep work and clarity",
    "establish a focused atmosphere for uninterrupted thought",
    "form a protective sonic space for total immersion",
    "shape a steady backdrop for hours of focused output",
  ],
  relax: [
    "create a cocoon of calm for effortless relaxation",
    "ease the mind into a state of gentle stillness",
    "build a warm sanctuary for rest and recovery",
    "guide you into deep, unhurried calm",
  ],
  ambient: [
    "create an expansive space for thought and presence",
    "fill the room with depth, texture, and atmosphere",
    "build a sonic world that rewards close listening",
    "transform ordinary space into something alive with sound",
  ],
};

function buildSonicDescription(mood: Mood, hash: number): string {
  const texture = pickFrom(SONIC_TEXTURES[mood], hash, 14);
  const character = pickFrom(SONIC_CHARACTERS[mood], hash, 15);
  const effect = pickFrom(SONIC_EFFECTS[mood], hash, 16);
  return `${texture}, ${character} ${effect}.`;
}

// --- Qualities ---

const QUALITY_SETS: Record<Mood, string[]> = {
  focus: [
    "depth, clarity, and intention",
    "structure, clarity, and momentum",
    "calm, focus, and presence",
    "stillness, depth, and flow",
    "balance, focus, and quiet strength",
    "clarity, warmth, and steady rhythm",
    "space, depth, and purpose",
  ],
  relax: [
    "warmth, stillness, and softness",
    "comfort, calm, and gentle depth",
    "peace, space, and quiet beauty",
    "ease, warmth, and slow drift",
  ],
  ambient: [
    "texture, depth, and atmosphere",
    "richness, space, and presence",
    "layers, movement, and sonic beauty",
    "depth, detail, and immersion",
  ],
};

// --- Perfect for ---

const PERFECT_FOR_SETS: Record<Mood, string[][]> = {
  focus: [
    [
      "Deep work & long focus sessions",
      "Programming & creative building",
      "Studying & learning",
      "Strategic thinking & planning",
      "Daily discipline routines",
    ],
    [
      "Coding & software development",
      "Writing & research",
      "Business planning & analysis",
      "Reading & deep study",
      "Creative projects & design work",
    ],
    [
      "Long study sessions & exam prep",
      "Programming & problem solving",
      "Strategic planning & decision making",
      "Writing & content creation",
      "Building & prototyping",
    ],
    [
      "Deep focus & flow state work",
      "Coding marathons & hackathons",
      "Academic research & writing",
      "Entrepreneurial planning & execution",
      "Any work that demands total attention",
    ],
    [
      "Extended coding & development sessions",
      "Thesis writing & academic work",
      "Product design & architecture",
      "Self-study & skill building",
      "Focused reading & note-taking",
    ],
  ],
  relax: [
    [
      "Winding down after work",
      "Evening reading & journaling",
      "Meditation & breathing exercises",
      "Gentle stretching & yoga",
      "Falling asleep peacefully",
    ],
    [
      "Quiet evenings at home",
      "Rest & recovery",
      "Reflecting on the day",
      "Calming an overactive mind",
      "Creating a peaceful atmosphere",
    ],
  ],
  ambient: [
    [
      "Atmospheric background for any space",
      "Creative exploration & brainstorming",
      "Contemplation & reflection",
      "Deep listening sessions",
      "Transforming your room into a sonic environment",
    ],
    [
      "Ambient background for work or rest",
      "Creative thinking & ideation",
      "Mindful presence & awareness",
      "Setting mood & atmosphere",
      "Immersive listening experiences",
    ],
  ],
};

// --- CTA components ---

const CTA_TEMPLATES: Record<Mood, string[]> = {
  focus: [
    "Put it on. Remove the noise.\n{kw}.",
    "Press play. Disappear into the work.\n{kw}.",
    "Hit play. Lock in.\n{kw}.",
    "Put it on. Let everything else fall away.\n{kw}.",
    "Plug in. Zone out. Get it done.\n{kw}.",
    "No distractions. Just depth.\n{kw}.",
    "Your space. Your rules.\n{kw}.",
  ],
  relax: [
    "Put it on. Let go.\n{kw}.",
    "Press play. Breathe.\n{kw}.",
    "Settle in. The day is over.\n{kw}.",
    "Let the sound hold you.\n{kw}.",
  ],
  ambient: [
    "Put it on. Fill the room.\n{kw}.",
    "Press play. Let the atmosphere build.\n{kw}.",
    "Immerse yourself.\n{kw}.",
    "Let the sound take shape around you.\n{kw}.",
  ],
};

// --- Utility ---

function keywordToHashtag(keyword: string): string {
  return "#" + keyword.replace(/\s+/g, "").toLowerCase();
}

function buildChapters(tracks: Track[]): string {
  return tracks.map((t) => `${t.timecode} ${t.name}`).join("\n");
}

// --- Theme builder ---

function getTheme(keyword: string): KeywordTheme {
  const key = keyword.toLowerCase().trim();

  if (KEYWORD_THEMES[key]) {
    return KEYWORD_THEMES[key];
  }

  const mood: Mood = "focus";
  const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const hashtag = keywordToHashtag(keyword);
  const h = hashCode(key);

  const hook = pickFrom(HOOK_TEMPLATES[mood], h, 10).replace(/\{kw\}/g, capitalized);
  const cta = pickFrom(CTA_TEMPLATES[mood], h, 19).replace(/\{kw\}/g, capitalized);

  return {
    mood,
    hook,
    subtitle: buildSubtitle(keyword, mood),
    mixDescription: buildMixDescription(mood, h),
    sonicDescription: buildSonicDescription(mood, h),
    qualities: pickFrom(QUALITY_SETS[mood], h, 17),
    perfectFor: pickFrom(PERFECT_FOR_SETS[mood], h, 18),
    cta,
    hashtags: [hashtag],
  };
}

export function generateMetadata(
  tracks: Track[],
  keyword: string,
  mixNumber?: number,
): GeneratedMetadata {
  const theme = getTheme(keyword);
  const chapters = buildChapters(tracks);

  const keywordHashtag = keywordToHashtag(keyword);
  const hashtags = [...BASE_HASHTAGS];
  for (const h of theme.hashtags) {
    if (!hashtags.includes(h)) hashtags.push(h);
  }
  if (!hashtags.includes(keywordHashtag)) hashtags.push(keywordHashtag);

  const description = [
    theme.hook,
    "",
    theme.mixDescription,
    "",
    theme.sonicDescription,
    "",
    "No vocals. No sharp elements. No distractions.",
    `Just ${theme.qualities}.`,
    "",
    "Perfect for:",
    ...theme.perfectFor.map((item) => `• ${item}`),
    "",
    theme.cta,
    "",
    "☕ Support via Donatello: https://donatello.to/ZeroDistractionLab",
    "",
    hashtags.join("\n"),
    "",
    "",
    chapters,
  ].join("\n");

  const tags = [...BASE_TAGS];
  const keywordTag = keyword.toLowerCase().replace(/\s+/g, " ").trim();
  if (!tags.includes(keywordTag)) tags.push(keywordTag);

  const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const title = mixNumber
    ? `${capitalized} | ${theme.subtitle} #${mixNumber}`
    : `${capitalized} | ${theme.subtitle}`;

  return {
    title,
    description,
    tags,
    categoryId: "10",
  };
}
