import assert from "node:assert/strict";
import { describe, it } from "node:test";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { verifyStoredPassword } from "../src/lib/auth/passwordVerifier.js";
import { canAccessPegawaiRecord, filterRecordsByPegawaiScope } from "../src/lib/rbac/scope.js";

describe("auth password verifier", () => {
  it("accepts bcrypt hashes", async () => {
    const hash = await bcrypt.hash("password-kuat-123", 10);
    assert.equal(await verifyStoredPassword("password-kuat-123", hash), true);
    assert.equal(await verifyStoredPassword("salah", hash), false);
  });

  it("accepts legacy sha256 hashes", async () => {
    const hash = crypto.createHash("sha256").update("legacy-password").digest("hex");
    assert.equal(await verifyStoredPassword("legacy-password", hash), true);
    assert.equal(await verifyStoredPassword("legacy-salah", hash), false);
  });
});

describe("pegawai RBAC scope", () => {
  const ukpdList = [
    { nama_ukpd: "Puskesmas A", wilayah: "Jakarta Selatan" },
    { nama_ukpd: "Puskesmas B", wilayah: "Jakarta Timur" }
  ];

  it("allows super admin to access all records", () => {
    const user = { role: "SUPER_ADMIN" };
    assert.equal(canAccessPegawaiRecord(user, { nama_ukpd: "Puskesmas B" }, ukpdList), true);
  });

  it("limits admin UKPD to own UKPD", () => {
    const user = { role: "ADMIN_UKPD", nama_ukpd: "Puskesmas A" };
    assert.equal(canAccessPegawaiRecord(user, { nama_ukpd: "Puskesmas A" }, ukpdList), true);
    assert.equal(canAccessPegawaiRecord(user, { nama_ukpd: "Puskesmas B" }, ukpdList), false);
  });

  it("limits admin wilayah to matching wilayah", () => {
    const user = { role: "ADMIN_WILAYAH", wilayah: "Jakarta Selatan" };
    const rows = filterRecordsByPegawaiScope([
      { nama: "A", nama_ukpd: "Puskesmas A" },
      { nama: "B", nama_ukpd: "Puskesmas B" }
    ], user, ukpdList);
    assert.deepEqual(rows.map((row) => row.nama), ["A"]);
  });
});
