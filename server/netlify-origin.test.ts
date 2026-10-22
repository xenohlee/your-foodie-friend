import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, assertOrigin } from "../netlify/functions/lib/http.js";
import {
  expiredSessionCookie,
  sessionCookie,
} from "../netlify/functions/lib/auth.js";

const ORIGINAL_ADMIN_ORIGIN = process.env.ADMIN_ORIGIN;

beforeEach(() => {
  process.env.ADMIN_ORIGIN = "https://owner.example";
});
afterEach(() => {
  if (ORIGINAL_ADMIN_ORIGIN === undefined) delete process.env.ADMIN_ORIGIN;
  else process.env.ADMIN_ORIGIN = ORIGINAL_ADMIN_ORIGIN;
});

describe("admin request origin checks", () => {
  it("allows a same-origin dashboard GET when the browser omits Origin", () => {
    const request = new Request("https://owner.example/api/admin/dashboard", {
      method: "GET",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(() => assertOrigin(request, "ADMIN_ORIGIN")).not.toThrow();
  });

  it("rejects a cross-site request even when it targets a safe GET route", () => {
    const request = new Request("https://owner.example/api/admin/dashboard", {
      method: "GET",
      headers: { "Sec-Fetch-Site": "cross-site" },
    });
    expect(() => assertOrigin(request, "ADMIN_ORIGIN")).toThrowError(ApiError);
  });

  it("does not treat a sibling Netlify subdomain as the admin origin", () => {
    const request = new Request("https://owner.example/api/admin/dashboard", {
      method: "GET",
      headers: { "Sec-Fetch-Site": "same-site" },
    });
    expect(() => assertOrigin(request, "ADMIN_ORIGIN")).toThrowError(ApiError);
  });

  it("requires an exact Origin for every mutation", () => {
    const missing = new Request("https://owner.example/api/admin/settings", {
      method: "PUT",
    });
    const wrong = new Request("https://owner.example/api/admin/settings", {
      method: "PUT",
      headers: { Origin: "https://attacker.example" },
    });
    const valid = new Request("https://owner.example/api/admin/settings", {
      method: "PUT",
      headers: { Origin: "https://owner.example" },
    });
    expect(() => assertOrigin(missing, "ADMIN_ORIGIN")).toThrowError(ApiError);
    expect(() => assertOrigin(wrong, "ADMIN_ORIGIN")).toThrowError(ApiError);
    expect(() => assertOrigin(valid, "ADMIN_ORIGIN")).not.toThrow();
  });
});

describe("admin session cookie attributes", () => {
  const original = process.env.COOKIE_SECURE;
  afterEach(() => {
    if (original === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = original;
  });

  it("uses a Secure, host-only, cross-site-compatible cookie on HTTPS", () => {
    delete process.env.COOKIE_SECURE;
    const cookie = sessionCookie("opaque-token");
    expect(cookie).toContain("__Host-yff_admin=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
    expect(cookie).not.toMatch(/(?:^|; )Domain=/i);
    expect(expiredSessionCookie()).toContain(
      "SameSite=None; Max-Age=0; Secure"
    );
  });

  it("uses a non-secure Lax cookie only for explicit local HTTP development", () => {
    process.env.COOKIE_SECURE = "false";
    const cookie = sessionCookie("opaque-token");
    expect(cookie).toContain("yff_admin=");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("; Secure");
    expect(expiredSessionCookie()).toContain("SameSite=Lax; Max-Age=0");
    expect(expiredSessionCookie()).not.toContain("; Secure");
  });
});
