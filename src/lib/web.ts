/**
 * Web search (DuckDuckGo) and URL fetching utilities.
 * No API keys required.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Validate a URL to prevent SSRF attacks.
 * Blocks internal/private addresses and non-http(s) protocols.
 */
export function validateUrl(url: string): { valid: boolean; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Must have a hostname
  if (!hostname) {
    return { valid: false, reason: "URL has no hostname" };
  }

  // Block localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return { valid: false, reason: `Blocked host: ${hostname}` };
  }

  // Block private/internal IP ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number) as [number, number, number, number, number];
    // 10.0.0.0/8
    if (a === 10) {
      return { valid: false, reason: "Blocked private IP range (10.x.x.x)" };
    }
    // 172.16.0.0/12
    if (a === 172 && b! >= 16 && b! <= 31) {
      return { valid: false, reason: "Blocked private IP range (172.16-31.x.x)" };
    }
    // 192.168.0.0/16
    if (a === 192 && b === 168) {
      return { valid: false, reason: "Blocked private IP range (192.168.x.x)" };
    }
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) {
      return { valid: false, reason: "Blocked link-local IP range (169.254.x.x)" };
    }
    // 0.x.x.x
    if (a === 0) {
      return { valid: false, reason: "Blocked IP range (0.x.x.x)" };
    }
  }

  return { valid: true, reason: "" };
}

/**
 * Search DuckDuckGo and return parsed results.
 */
export async function webSearch(
  query: string,
  maxResults: number = 8
): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo returned ${res.status}`);
  }

  const html = await res.text();
  return parseDDGResults(html, maxResults);
}

function parseDDGResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DDG HTML results have <a class="result__a" href="...">title</a>
  // and <a class="result__snippet">snippet text</a>
  const resultBlocks = html.split(/class="result\s/g).slice(1);

  for (const block of resultBlocks) {
    if (results.length >= max) break;

    // Extract URL from result__a href
    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    if (!urlMatch) continue;

    let url = urlMatch[1]!;
    // DDG wraps URLs in a redirect — extract the actual URL
    const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]!);
    }

    // Extract title text
    const titleMatch = block.match(
      /class="result__a"[^>]*>([\s\S]*?)<\/a>/
    );
    const title = titleMatch
      ? stripHtml(titleMatch[1]!).trim()
      : "";

    // Extract snippet
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|span)>/
    );
    const snippet = snippetMatch
      ? stripHtml(snippetMatch[1]!).trim()
      : "";

    if (url && title) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Fetch a URL and return its text content (HTML stripped).
 */
export async function webFetch(
  url: string,
  maxLength: number = 8000
): Promise<string> {
  const validation = validateUrl(url);
  if (!validation.valid) {
    throw new Error(`SSRF protection: ${validation.reason} — ${url}`);
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // Return raw text for non-HTML
  if (!contentType.includes("html")) {
    const text = await res.text();
    return text.slice(0, maxLength);
  }

  const html = await res.text();
  return htmlToText(html, maxLength);
}

/** Strip HTML tags from a string */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

/** Convert HTML to readable text — extracts main content */
function htmlToText(html: string, maxLength: number): string {
  // Remove script and style blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Convert block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, "\n")
    .replace(/<(?:p|div|h[1-6]|li|tr|blockquote|pre|section|article)[^>]*>/gi, "\n");

  // Strip remaining tags
  text = stripHtml(text);

  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n /g, "\n")
    .replace(/ \n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + "\n\n[truncated]";
  }

  return text;
}
