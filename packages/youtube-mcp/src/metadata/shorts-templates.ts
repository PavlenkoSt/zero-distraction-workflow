import { GeneratedMetadata } from "../types.js";

const SHORTS_BASE_TAGS = [
  "lofi", "ambient", "focus music", "deep focus", "shorts",
  "lofi shorts", "ambient shorts", "study music", "coding music",
  "work music", "chill beats", "background music",
];

const SHORTS_HASHTAGS = [
  "#shorts", "#lofi", "#ambient", "#focusmusic", "#deepwork",
  "#studymusic", "#codingmusic", "#chillbeats",
];

const MAX_TITLE_LENGTH = 100;

function keywordToHashtag(keyword: string): string {
  return "#" + keyword.replace(/\s+/g, "").toLowerCase();
}

function buildTitle(keyword: string): string {
  const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  const keywordHashtag = keywordToHashtag(keyword);

  const hashtags = [...SHORTS_HASHTAGS];
  if (!hashtags.includes(keywordHashtag)) hashtags.unshift(keywordHashtag);

  // Start with keyword, then add hashtags until we hit the limit
  let title = capitalized;
  for (const tag of hashtags) {
    const candidate = `${title} ${tag}`;
    if (candidate.length > MAX_TITLE_LENGTH) break;
    title = candidate;
  }

  return title;
}

export function generateShortsMetadata(
  keyword: string,
): GeneratedMetadata {
  const capitalized = keyword.charAt(0).toUpperCase() + keyword.slice(1);

  const description = [
    `${capitalized}. Let everything else fade.`,
    "",
    "Subscribe @ZeroDistractionLab for more ambient focus music.",
  ].join("\n");

  const tags = [...SHORTS_BASE_TAGS];
  const keywordTag = keyword.toLowerCase().trim();
  if (!tags.includes(keywordTag)) tags.push(keywordTag);

  return {
    title: buildTitle(keyword),
    description,
    tags,
    categoryId: "10",
  };
}
