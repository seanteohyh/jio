/**
 * Import candidate place names from a food blog post.
 *
 * The user pastes a URL, we fetch that one page and pull the headings out of
 * it. This is deliberately not a crawler: one user-initiated fetch of one page
 * the user chose, no traversal, no scheduled scraping.
 *
 * `validateBlogUrl` is the important part. Fetching a user-supplied URL from a
 * server is a textbook SSRF hole — without it, someone could point the app at
 * a cloud metadata endpoint or an internal service and read the response.
 */

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&ldquo;": '"',
  "&rdquo;": '"',
};

export function decodeEntities(text: string): string {
  let out = text;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }
  out = out.replace(/&#(\d+);/g, (_m, code) =>
    String.fromCharCode(Number(code))
  );
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_m, code) =>
    String.fromCharCode(parseInt(code, 16))
  );
  return out;
}

export function stripMarkup(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** Collect h2/h3 text plus the og:title, in document order. */
export function extractHeadings(html: string): string[] {
  const headings: string[] = [];

  const ogMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );
  if (ogMatch) headings.push(decodeEntities(ogMatch[1]));

  const headingRe = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const text = stripMarkup(match[2]);
    if (text) headings.push(text);
  }

  return headings;
}

/** Headings that are structural furniture, not restaurant names. */
const NOISE_KEYWORDS = [
  "comment",
  "newsletter",
  "subscribe",
  "related post",
  "related article",
  "share this",
  "follow us",
  "leave a reply",
  "you may also like",
  "recent post",
  "popular post",
  "advertisement",
  "sponsored",
  "table of contents",
  "read more",
  "categories",
  "archives",
  "search",
  "tags",
];

const GENERIC_HEADINGS = [
  "conclusion",
  "introduction",
  "intro",
  "summary",
  "final thoughts",
  "tldr",
  "tl;dr",
  "verdict",
  "overview",
  "about",
  "menu",
  "location",
  "price",
  "prices",
  "hours",
  "opening hours",
  "getting there",
  "how to get there",
  "the verdict",
  "our thoughts",
  "faq",
  "faqs",
];

const MAX_NAME_LENGTH = 60;

/**
 * Turn a raw heading into a place name, or reject it.
 *
 * Blog listicles number their entries and decorate them with emoji; both have
 * to come off before the name is usable.
 */
export function cleanHeading(raw: string): string | null {
  if (!raw) return null;

  let text = raw.trim();

  // Leading emoji / pictographs / arrows / variation selectors.
  // Deliberately does NOT use \p{Emoji_Component}: that class contains the
  // ASCII digits (they are keycap components) and would eat "1." from
  // "1. Tian Tian" before the numbering rule below ever sees it.
  text = text.replace(/^(?:[\p{Extended_Pictographic}‍️←-➿]|\s)+/u, "").trim();

  // Leading list numbering: "1." / "10 —" / "3)" / "#4 "
  // A separator is required so that "2026 Bistro" keeps its name.
  text = text.replace(/^#\s*\d{1,3}\s+/, "").trim();
  text = text.replace(/^#?\s*\d{1,3}\s*[.)\-–—:]\s*/, "").trim();

  // Trailing separators left behind by the above.
  text = text.replace(/[\s\-–—:|,]+$/, "").trim();

  if (!text) return null;
  if (text.length > MAX_NAME_LENGTH) return null;
  if (text.length < 2) return null;

  const lower = text.toLowerCase();
  if (NOISE_KEYWORDS.some((kw) => lower.includes(kw))) return null;
  if (GENERIC_HEADINGS.includes(lower)) return null;

  // A heading that is only digits or punctuation is not a name.
  if (!/[a-zA-Z]/.test(text)) return null;

  return text;
}

/** Ordered, de-duplicated candidate names from a blog page. */
export function extractCandidates(html: string): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const heading of extractHeadings(html)) {
    const cleaned = cleanHeading(heading);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(cleaned);
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// SSRF guard
// ---------------------------------------------------------------------------

export interface UrlValidation {
  ok: boolean;
  url?: URL;
  reason?: string;
}

function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // Strip the brackets URL parsing leaves on IPv6 literals.
  let addr = host.toLowerCase();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  // Drop any zone id.
  addr = addr.split("%")[0];

  if (addr === "::1" || addr === "::") return true;

  // IPv4-mapped addresses reach exactly the same host as the bare IPv4
  // address, so they have to be judged on the embedded address rather than
  // waved through as "some IPv6 thing".
  //
  // Two spellings have to be handled. The dotted form `::ffff:10.0.0.1` is
  // what a person types — but `new URL()` normalises it to the hex form
  // `::ffff:a00:1`, and that is what actually arrives here. Missing the hex
  // form is a working SSRF bypass, so both are matched.
  const mappedDotted = addr.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/
  );
  if (mappedDotted) {
    const octets = parseIPv4(mappedDotted[1]);
    return octets ? isPrivateIPv4(octets) : true;
  }

  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    const octets = [
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 8) & 0xff,
      low & 0xff,
    ];
    return isPrivateIPv4(octets);
  }

  // fe80::/10 link-local
  if (/^fe[89ab][0-9a-f]?:/.test(addr)) return true;
  // fc00::/7 unique-local
  if (/^f[cd][0-9a-f]{0,2}:/.test(addr)) return true;
  // ff00::/8 multicast
  if (/^ff[0-9a-f]{0,2}:/.test(addr)) return true;

  return false;
}

/**
 * Accept only http(s) URLs pointing at a public host.
 *
 * Note the limit: a hostname that *resolves* to a private address still passes
 * here, because we do not do DNS. Deployments that care should also pin egress
 * at the network layer.
 */
export function validateBlogUrl(raw: string): UrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Only http and https URLs are allowed" };
  }

  const host = url.hostname.toLowerCase();

  if (!host) return { ok: false, reason: "Missing host" };

  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "Localhost is not allowed" };
  }

  if (host.startsWith("[") || host.includes(":")) {
    if (isPrivateIPv6(host)) {
      return { ok: false, reason: "Private IPv6 addresses are not allowed" };
    }
    return { ok: true, url };
  }

  const octets = parseIPv4(host);
  if (octets) {
    if (isPrivateIPv4(octets)) {
      return { ok: false, reason: "Private IPv4 addresses are not allowed" };
    }
    return { ok: true, url };
  }

  // A bare hostname with no dot is almost always an internal name.
  if (!host.includes(".")) {
    return { ok: false, reason: "Internal hostnames are not allowed" };
  }

  return { ok: true, url };
}

/** Fetch a blog page and return its candidate place names. */
export async function fetchBlogCandidates(
  raw: string,
  timeoutMs = 10000
): Promise<{ candidates: string[]; title: string | null }> {
  const validation = validateBlogUrl(raw);
  if (!validation.ok || !validation.url) {
    throw new Error(validation.reason || "Invalid URL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validation.url.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "JioLunchApp/1.0 (+https://github.com/)",
        Accept: "text/html",
      },
    });

    if (!response.ok) {
      throw new Error(`Blog returned ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) {
      throw new Error("That URL is not an HTML page");
    }

    const html = await response.text();
    const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);

    return {
      candidates: extractCandidates(html),
      title: titleMatch ? stripMarkup(titleMatch[1]) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}
