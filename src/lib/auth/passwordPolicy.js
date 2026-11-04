const BLOCKED_PASSWORDS = new Set([
  "admin123",
  "password123",
  "123456",
  "12345678",
  "qwerty123",
  "superadmin",
  "password"
]);

export const PASSWORD_POLICY_TEXT = [
  "Minimal 12 karakter.",
  "Memuat huruf besar, huruf kecil, angka, dan simbol.",
  "Tidak memakai spasi.",
  "Tidak memakai password umum atau mengandung username/UKPD."
];

export function validatePasswordPolicy(password, { username = "", namaUkpd = "" } = {}) {
  const value = String(password || "");
  const lowerValue = value.toLowerCase();
  const identityParts = [username, namaUkpd]
    .flatMap((item) => String(item || "").toLowerCase().split(/[^a-z0-9]+/i))
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
  const errors = [];

  if (value.length < 12) errors.push("Password minimal 12 karakter.");
  if (value.length > 128) errors.push("Password maksimal 128 karakter.");
  if (!/[a-z]/.test(value)) errors.push("Password harus memuat huruf kecil.");
  if (!/[A-Z]/.test(value)) errors.push("Password harus memuat huruf besar.");
  if (!/[0-9]/.test(value)) errors.push("Password harus memuat angka.");
  if (!/[^A-Za-z0-9]/.test(value)) errors.push("Password harus memuat simbol.");
  if (/\s/.test(value)) errors.push("Password tidak boleh memuat spasi.");
  if (BLOCKED_PASSWORDS.has(lowerValue)) errors.push("Password terlalu umum.");
  if (identityParts.some((part) => lowerValue.includes(part))) {
    errors.push("Password tidak boleh mengandung username atau nama UKPD.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
