import { NextResponse } from "next/server";

const JSON_HEADERS = {
  "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff"
};

export function ok(data, message = "Berhasil") {
  return NextResponse.json({ success: true, message, data }, { headers: JSON_HEADERS });
}

export function fail(message = "Permintaan tidak dapat diproses", status = 400, errors = null) {
  return NextResponse.json({ success: false, message, errors }, { status, headers: JSON_HEADERS });
}
