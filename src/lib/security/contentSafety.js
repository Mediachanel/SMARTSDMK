const BLOCKED_PATTERNS = [
  /\b(api[_\s-]?key|secret|password|token|jwt|cookie)\b/i,
  /\b(drop|truncate|alter)\s+table\b/i,
  /\bdelete\s+from\b/i,
  /\bupdate\s+\w+\s+set\b/i,
  /\bselect\s+.+\s+from\b/i
];

const PERSONAL_DATA_PATTERNS = [
  /\b\d{16}\b/,
  /\b\d{18}\b/,
  /\bNRK\s*[:.-]?\s*\d{4,12}\b/i,
  /\b08\d{8,13}\b/
];

function flattenText(value, depth = 0) {
  if (depth > 4 || value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => flattenText(item, depth + 1)).join("\n");
  if (typeof value === "object") return Object.values(value).map((item) => flattenText(item, depth + 1)).join("\n");
  return "";
}

export function inspectContentSafety(value, { allowPersonalData = false } = {}) {
  const text = flattenText(value).slice(0, 20_000);
  const blocked = BLOCKED_PATTERNS.find((pattern) => pattern.test(text));
  if (blocked) {
    return {
      allowed: false,
      reason: "Prompt mengandung instruksi berisiko atau secret.",
      category: "unsafe_instruction"
    };
  }

  if (!allowPersonalData && PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      allowed: false,
      reason: "Payload mengandung data pribadi. Masking atau review admin diperlukan sebelum diproses.",
      category: "personal_data"
    };
  }

  return { allowed: true, reason: "", category: "" };
}
