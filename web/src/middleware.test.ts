import { describe, expect, it } from "vitest";

import { contentSecurityPolicy } from "./middleware";

describe("CSP", () => {
  it("n'autorise que le domaine CSM en production", () => {
    const csp = contentSecurityPolicy("abc", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("connect-src 'self';");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/supabase|8090|ws:/);
  });
});
