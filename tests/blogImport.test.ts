import { describe, expect, it } from "vitest";
import {
  cleanHeading,
  extractCandidates,
  extractHeadings,
  stripMarkup,
  validateBlogUrl,
} from "@/lib/blogImport";

describe("stripMarkup", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripMarkup("<p>Hello   <b>world</b></p>")).toBe("Hello world");
  });

  it("drops script contents entirely", () => {
    expect(stripMarkup("<p>Keep</p><script>var evil = 1;</script>")).toBe(
      "Keep"
    );
  });

  it("drops style contents entirely", () => {
    expect(stripMarkup("<style>.a{color:red}</style><p>Keep</p>")).toBe("Keep");
  });

  it("drops HTML comments", () => {
    expect(stripMarkup("<!-- hidden -->Visible")).toBe("Visible");
  });

  it("decodes named and numeric entities", () => {
    expect(stripMarkup("Fish &amp; Co &#39;s")).toBe("Fish & Co 's");
  });
});

describe("extractHeadings", () => {
  it("collects h2 and h3 text", () => {
    const html = "<h2>Tian Tian</h2><h3>Maxwell</h3><h4>Ignored</h4>";
    const headings = extractHeadings(html);

    expect(headings).toContain("Tian Tian");
    expect(headings).toContain("Maxwell");
    expect(headings).not.toContain("Ignored");
  });

  it("picks up the og:title", () => {
    const html =
      '<meta property="og:title" content="Best Lunch in Bugis"><h2>A Place</h2>';

    expect(extractHeadings(html)[0]).toBe("Best Lunch in Bugis");
  });

  it("strips nested markup inside a heading", () => {
    expect(extractHeadings("<h2><span>Kok</span> Sen</h2>")).toContain(
      "Kok Sen"
    );
  });
});

describe("cleanHeading", () => {
  it("strips a leading list number", () => {
    expect(cleanHeading("1. Tian Tian")).toBe("Tian Tian");
    expect(cleanHeading("10 — Maxwell Food Centre")).toBe("Maxwell Food Centre");
    expect(cleanHeading("3) Ah Chiang")).toBe("Ah Chiang");
  });

  it("strips a leading emoji", () => {
    expect(cleanHeading("🍜 Hokkien Mee Stall")).toBe("Hokkien Mee Stall");
  });

  it("keeps a leading year, which is not list numbering", () => {
    // The numbering rule requires a separator, so this survives.
    expect(cleanHeading("2026 Bistro")).toBe("2026 Bistro");
  });

  it("strips a trailing separator", () => {
    expect(cleanHeading("Zam Zam —")).toBe("Zam Zam");
  });

  it("rejects blog furniture", () => {
    expect(cleanHeading("Leave a Reply")).toBeNull();
    expect(cleanHeading("Subscribe to our newsletter")).toBeNull();
    expect(cleanHeading("Related Posts")).toBeNull();
  });

  it("rejects generic section headings", () => {
    expect(cleanHeading("Conclusion")).toBeNull();
    expect(cleanHeading("Opening Hours")).toBeNull();
    expect(cleanHeading("FAQ")).toBeNull();
  });

  it("rejects anything too long to be a name", () => {
    expect(
      cleanHeading(
        "Here is a very long sentence that is clearly a paragraph heading and not the name of a restaurant"
      )
    ).toBeNull();
  });

  it("rejects a heading with no letters in it", () => {
    expect(cleanHeading("12345")).toBeNull();
  });

  it("passes an ordinary name through unchanged", () => {
    expect(cleanHeading("Hill Street Tai Hwa Pork Noodle")).toBe(
      "Hill Street Tai Hwa Pork Noodle"
    );
  });
});

describe("extractCandidates", () => {
  it("de-duplicates case-insensitively and keeps document order", () => {
    const html =
      "<h2>1. Zam Zam</h2><h2>2. Kok Sen</h2><h3>ZAM ZAM</h3><h2>Conclusion</h2>";

    expect(extractCandidates(html)).toEqual(["Zam Zam", "Kok Sen"]);
  });
});

describe("validateBlogUrl", () => {
  it("accepts an ordinary https URL", () => {
    expect(validateBlogUrl("https://someblog.com/post").ok).toBe(true);
  });

  it("accepts http as well as https", () => {
    expect(validateBlogUrl("http://someblog.com/post").ok).toBe(true);
  });

  it("rejects a non-http scheme", () => {
    expect(validateBlogUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateBlogUrl("ftp://example.com/x").ok).toBe(false);
  });

  it("rejects garbage that is not a URL at all", () => {
    expect(validateBlogUrl("not a url").ok).toBe(false);
  });

  it("rejects localhost and its subdomains", () => {
    expect(validateBlogUrl("http://localhost:3000/x").ok).toBe(false);
    expect(validateBlogUrl("http://app.localhost/x").ok).toBe(false);
  });

  it("rejects IPv4 loopback", () => {
    expect(validateBlogUrl("http://127.0.0.1/x").ok).toBe(false);
    expect(validateBlogUrl("http://127.1.2.3/x").ok).toBe(false);
  });

  it("rejects the RFC 1918 private ranges", () => {
    expect(validateBlogUrl("http://10.0.0.1/x").ok).toBe(false);
    expect(validateBlogUrl("http://172.16.0.1/x").ok).toBe(false);
    expect(validateBlogUrl("http://172.31.255.255/x").ok).toBe(false);
    expect(validateBlogUrl("http://192.168.1.1/x").ok).toBe(false);
  });

  it("allows 172.32.x, which is outside the private block", () => {
    expect(validateBlogUrl("http://172.32.0.1/x").ok).toBe(true);
  });

  it("rejects link-local, which is where cloud metadata lives", () => {
    // 169.254.169.254 is the AWS/GCP metadata endpoint. This is the single
    // most valuable target for an SSRF, so it gets its own test.
    expect(validateBlogUrl("http://169.254.169.254/latest/meta-data/").ok).toBe(
      false
    );
  });

  it("rejects 0.0.0.0", () => {
    expect(validateBlogUrl("http://0.0.0.0/x").ok).toBe(false);
  });

  it("accepts a public IPv4 literal", () => {
    expect(validateBlogUrl("http://8.8.8.8/x").ok).toBe(true);
  });

  it("rejects IPv6 loopback and unspecified", () => {
    expect(validateBlogUrl("http://[::1]/x").ok).toBe(false);
    expect(validateBlogUrl("http://[::]/x").ok).toBe(false);
  });

  it("rejects IPv6 link-local", () => {
    expect(validateBlogUrl("http://[fe80::1]/x").ok).toBe(false);
  });

  it("rejects IPv6 unique-local", () => {
    expect(validateBlogUrl("http://[fc00::1]/x").ok).toBe(false);
    expect(validateBlogUrl("http://[fd12:3456::1]/x").ok).toBe(false);
  });

  it("rejects IPv6 multicast", () => {
    expect(validateBlogUrl("http://[ff02::1]/x").ok).toBe(false);
  });

  it("rejects an IPv4-mapped private address", () => {
    // ::ffff:10.0.0.1 reaches the same host as 10.0.0.1, so it must be
    // judged on the embedded address rather than waved through as IPv6.
    expect(validateBlogUrl("http://[::ffff:10.0.0.1]/x").ok).toBe(false);
    expect(validateBlogUrl("http://[::ffff:127.0.0.1]/x").ok).toBe(false);
  });

  it("accepts an IPv4-mapped public address", () => {
    expect(validateBlogUrl("http://[::ffff:8.8.8.8]/x").ok).toBe(true);
  });

  it("accepts a public IPv6 literal", () => {
    expect(validateBlogUrl("http://[2606:4700:4700::1111]/x").ok).toBe(true);
  });

  it("rejects a bare internal hostname with no dot", () => {
    expect(validateBlogUrl("http://intranet/x").ok).toBe(false);
  });
});
