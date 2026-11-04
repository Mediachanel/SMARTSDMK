import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectContentSafety } from "../src/lib/security/contentSafety.js";
import { validatePasswordPolicy } from "../src/lib/auth/passwordPolicy.js";

describe("production hardening content safety", () => {
  it("blocks raw SQL and secret-like prompts", () => {
    assert.equal(inspectContentSafety("DROP TABLE pegawai").allowed, false);
    assert.equal(inspectContentSafety("gunakan API key berikut").category, "unsafe_instruction");
  });

  it("blocks personal data unless explicitly allowed for local-only tools", () => {
    assert.equal(inspectContentSafety("NIP 199901012026010001").allowed, false);
    assert.equal(inspectContentSafety("NIP 199901012026010001", { allowPersonalData: true }).allowed, true);
  });
});

describe("production hardening password policy", () => {
  it("rejects weak/default passwords", () => {
    const result = validatePasswordPolicy("admin123", { username: "superadmin" });
    assert.equal(result.valid, false);
  });

  it("accepts strong passwords that do not contain identity terms", () => {
    const result = validatePasswordPolicy("Sehat#2026Aman", { username: "ukpd01", namaUkpd: "Puskesmas Tebet" });
    assert.equal(result.valid, true);
  });
});
