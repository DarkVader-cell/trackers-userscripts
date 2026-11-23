export interface DesiRelease {
  name: string;
  type?: string;
}

type Family = "web-dl" | "webrip" | "encode" | "dvd" | "other";

const familyOf = ({ name, type }: DesiRelease): Family | undefined => {
  if (
    /^(?:UHD(?: Remux)?|BD (?:25|50|Remux)|DVD (?:5|9|Remux)|CD|FLAC)$/i.test(
      type ?? ""
    ) ||
    /\b(?:remux|untouched|complete[ ._-]+(?:uhd|blu[ ._-]*ray)|BD(?:25|50|66|100)|DVD[59])\b/i.test(
      name
    )
  )
    return "other";
  if (/\bweb[ ._-]*rip\b/i.test(name) || /^webrip$/i.test(type ?? ""))
    return "webrip";
  if (/\bweb[ ._-]*dl\b/i.test(name) || /^web[ -]?dl$/i.test(type ?? ""))
    return "web-dl";
  if (/\bdvd(?:rip)?\b/i.test(name)) return "dvd";
  if (
    /^encode$/i.test(type ?? "") ||
    /\b(?:blu[ ._-]*ray|bdrip|hdtv)\b/i.test(name)
  )
    return "encode";
};

const resolutionOf = (name: string) =>
  /\b(\d{3,4}[pi])\b/i.exec(name)?.[1]?.toLowerCase();
const codecOf = (name: string) =>
  /\b(?:x265|h[ ._-]?265|hevc)\b/i.test(name)
    ? "hevc"
    : /\b(?:x264|h[ ._-]?264|avc)\b/i.test(name)
    ? "avc"
    : /\bav1\b/i.test(name)
    ? "av1"
    : undefined;
const cutOf = (name: string) =>
  /\b(extended|theatrical|unrated|director'?s[ ._-]+cut)\b/i
    .exec(name)?.[1]
    .toLowerCase()
    .replace(/[ ._'-]/g, "");
const audioOf = (name: string) =>
  /\b(?:multi(?:[ ._-]*audio)?|dubbed|dual[ ._-]+audio)\b/i.test(name)
    ? "dubbed"
    : undefined;
const providerOf = (name: string) => {
  const token =
    /\b(AMZN|Amazon|NF|Netflix|DSNP|ATVP|HMAX|HULU|PCOK|PMTP|JIOHOTSTAR|HS)\b/i
      .exec(name)?.[1]
      .toUpperCase();
  return token === "AMAZON" ? "AMZN" : token === "NETFLIX" ? "NF" : token;
};
const hdr10Plus = (name: string) => /\bHDR10(?:\+|PLUS\b)/i.test(name);

const colourOf = (name: string) => {
  if (
    /\b(?:dv(?:he)?|dovi|dolby[ ._-]+vision)[ ._-]*(?:p(?:rofile)?[ ._-]*)?0?8\b/i.test(
      name
    )
  )
    return "hdr";
  if (
    /\b(?:dv(?:he)?|dovi|dolby[ ._-]+vision)[ ._-]*(?:p(?:rofile)?[ ._-]*)?0?5\b/i.test(
      name
    )
  )
    return "dv5";
  if (/\b(?:dv|dovi|dvhe|dolby[ ._-]+vision)\b/i.test(name)) return undefined;
  if (hdr10Plus(name)) return "hdr10+";
  if (/\bHDR(?:10)?\b/i.test(name)) return "hdr";
  if (/\bSDR\b/i.test(name)) return "sdr";
};

export function possibleDesiSlot(
  candidate: DesiRelease,
  releases: DesiRelease[]
): boolean {
  const { name } = candidate;
  const family = familyOf(candidate);
  const res = resolutionOf(name);
  const codec = codecOf(name);
  const colour = colourOf(name);
  const web = family === "web-dl" || family === "webrip";
  if (!releases.length || !family || family === "other") return false;
  const normalizedName = (value: string) =>
    value
      .toLowerCase()
      .replace(/[.\s_]+/g, " ")
      .trim();
  if (
    releases.some(
      (release) => normalizedName(release.name) === normalizedName(name)
    )
  )
    return false;

  let capacity = 1;
  if (res === "2160p") {
    if (family === "dvd" || !colour || (colour === "hdr10+" && !web))
      return false;
    if (
      !web &&
      !/\b(?:true[ ._-]*hd|dts[ ._-]*hd[ ._-]*ma|flac|lpcm|pcm|dts[ ._-]*x)\b/i.test(
        name
      )
    )
      return false;
  } else if (web || family === "encode") {
    if (res !== "720p" && res !== "1080p") return false;
    // Lower-resolution HDR/DV needs proof that it is the highest available.
    if (
      web &&
      ((colour && colour !== "sdr") ||
        /\b(?:hdr|hdr10|dv|dovi|dvhe|dolby[ ._-]+vision)\b/i.test(name))
    )
      return false;
    if (!web) {
      if (
        !/\b(?:ddp|dd\+|e[ ._-]*ac[ ._-]*3|ac[ ._-]*3|aac|opus)\b/i.test(name)
      )
        return false;
      if (codec === "avc" && res === "1080p") capacity = 2;
      else if (codec === "avc" && res === "720p") capacity = 1;
      else if (!(codec === "hevc" && res === "1080p" && /\bUHD\b/i.test(name)))
        return false;
    }
  }

  const cut = cutOf(name);
  const audio = audioOf(name);
  const provider = providerOf(name);
  const blockers = releases.filter((release) => {
    const other = release.name;
    const otherFamily = familyOf(release);
    if (otherFamily && otherFamily !== family) return false;
    const otherRes = resolutionOf(other);
    if (family !== "dvd" && otherRes && otherRes !== res) return false;
    const otherCut = cutOf(other);
    if (cut && otherCut && cut !== otherCut) return false;
    // Unlabelled audio may already be multi/dubbed. Only split explicitly marked variants.
    const otherAudio = audioOf(other);
    const original = (value: string) => /\boriginal[ ._-]+audio\b/i.test(value);
    if (web && ((audio && original(other)) || (otherAudio && original(name))))
      return false;
    const otherCodec = codecOf(other);
    const otherColour = colourOf(other);
    if (res === "2160p" && otherColour && colour !== otherColour) {
      // An HDR10+ release with both primary HDR and HDR10+ fills both slots.
      if (!(colour === "hdr10+" && otherColour === "hdr" && hdr10Plus(other)))
        return false;
    }
    if (
      !web &&
      family === "encode" &&
      res !== "2160p" &&
      codec &&
      otherCodec &&
      codec !== otherCodec
    )
      return false;
    const otherProvider = providerOf(other);
    // Provider differences only suggest a slot, not proof of best quality.
    if (
      family === "web-dl" &&
      provider &&
      otherProvider &&
      provider !== otherProvider &&
      codec &&
      codec === otherCodec &&
      (res !== "2160p" || colour === otherColour)
    )
      return false;
    return true;
  });
  return blockers.length < capacity;
}
