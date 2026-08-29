import { describe, expect, it } from "vitest";
import { walkTimeVisibilityNotice } from "@/lib/walkTimeNotice";

const OPTS = { defaultMaxWalk: 30, sliderMax: 45 };

describe("walkTimeVisibilityNotice", () => {
  it("says nothing for a place within the default filter", () => {
    expect(walkTimeVisibilityNotice(20, OPTS)).toBeNull();
    expect(walkTimeVisibilityNotice(30, OPTS)).toBeNull();
  });

  it("says nothing for an unknown walk time", () => {
    expect(walkTimeVisibilityNotice(null, OPTS)).toBeNull();
    expect(walkTimeVisibilityNotice(undefined, OPTS)).toBeNull();
  });

  it("suggests widening the filter between the default and the slider's ceiling", () => {
    const notice = walkTimeVisibilityNotice(40, OPTS);
    expect(notice).toContain("40-min walk");
    expect(notice).toContain("30-min filter");
    expect(notice).toContain("widened");
  });

  it("says plainly that no filter setting would help past the slider's ceiling", () => {
    const notice = walkTimeVisibilityNotice(213, OPTS);
    expect(notice).toContain("213-min walk");
    expect(notice).toContain("too far to appear");
    expect(notice).not.toContain("widened");
  });

  it("treats exactly the slider's ceiling as still reachable by widening", () => {
    const notice = walkTimeVisibilityNotice(45, OPTS);
    expect(notice).toContain("widened");
  });
});
