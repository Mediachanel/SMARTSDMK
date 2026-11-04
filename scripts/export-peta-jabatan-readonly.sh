#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${PETA_JABATAN_EXPORT_DIR:-${STORAGE_LOCAL_PATH:-$ROOT_DIR/storage}/exports/peta-jabatan}"
SQL_FILE="$ROOT_DIR/scripts/sql/peta-jabatan-rekap-readonly.sql"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sisdmk2-postgres}"
POSTGRES_USER="${POSTGRES_USER:-sisdmk2_user}"
POSTGRES_DATABASE="${POSTGRES_DATABASE:-si_data}"

mkdir -p "$OUT_DIR"

tmp_detail="$(mktemp)"
tmp_summary="$(mktemp)"
tmp_rekap_all="$(mktemp)"
trap 'rm -f "$tmp_detail" "$tmp_summary" "$tmp_rekap_all"' EXIT

docker exec -i "$POSTGRES_CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" \
  < "$SQL_FILE" > "$tmp_detail"

python3 - "$tmp_detail" "$tmp_summary" "$tmp_rekap_all" <<'PY'
import csv
import sys
from collections import defaultdict

detail_path, summary_path, rekap_all_path = sys.argv[1], sys.argv[2], sys.argv[3]

totals = defaultdict(lambda: {
    "JUMLAH JABATAN": 0,
    "B PNS": 0,
    "K PNS": 0,
    "S PNS": 0,
    "B NON PNS": 0,
    "K NON PNS": 0,
    "S NON PNS": 0,
})

rekap_all = defaultdict(lambda: {
    "ATASAN LANGSUNG": set(),
    "B PNS": 0,
    "K PNS": 0,
    "S PNS": 0,
    "B NON PNS": 0,
    "K NON PNS": 0,
    "S NON PNS": 0,
    "JUMLAH UNIT KERJA": set(),
})

def clean(value):
    return " ".join(str(value or "").split())

def number(value):
    try:
        return int(float(value or 0))
    except ValueError:
        return 0

with open(detail_path, newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source):
        key = row.get("JENIS PETA") or "LAINNYA"
        totals[key]["JUMLAH JABATAN"] += 1
        for field in ["B PNS", "K PNS", "S PNS", "B NON PNS", "K NON PNS", "S NON PNS"]:
            totals[key][field] += number(row.get(field))

        all_key = (
            clean(row.get("JENIS PETA")) or "LAINNYA",
            clean(row.get("NOMENKLATUR PERGUB 1 2017 (UNTUK PETA JABATAN)")),
            clean(row.get("KELAS JABATAN PERGUB 1 TAHUN 2017")),
            clean(row.get("NOMENKLATUR KEPMENPAN RB 11 TH 2024")),
            clean(row.get("KELAS JABATAN KEPMENPAN RB 11 TH 2024")),
            clean(row.get("RUMPUN JABATAN")),
        )
        if clean(row.get("ATASAN LANGSUNG")):
            rekap_all[all_key]["ATASAN LANGSUNG"].add(clean(row.get("ATASAN LANGSUNG")))
        rekap_all[all_key]["JUMLAH UNIT KERJA"].add(clean(row.get("UNIT KERJA")))
        for field in ["B PNS", "K PNS", "S PNS", "B NON PNS", "K NON PNS", "S NON PNS"]:
            rekap_all[all_key][field] += number(row.get(field))

fields = ["JENIS PETA", "JUMLAH JABATAN", "B PNS", "K PNS", "S PNS", "B NON PNS", "K NON PNS", "S NON PNS"]
with open(summary_path, "w", newline="", encoding="utf-8") as target:
    writer = csv.DictWriter(target, fieldnames=fields)
    writer.writeheader()
    for key in sorted(totals):
        writer.writerow({"JENIS PETA": key, **totals[key]})

rekap_all_fields = [
    "NO",
    "JENIS PETA",
    "NOMENKLATUR PERGUB 1 2017 (UNTUK PETA JABATAN)",
    "KELAS JABATAN PERGUB 1 TAHUN 2017",
    "NOMENKLATUR KEPMENPAN RB 11 TH 2024",
    "KELAS JABATAN KEPMENPAN RB 11 TH 2024",
    "ATASAN LANGSUNG",
    "RUMPUN JABATAN",
    "JUMLAH UNIT KERJA",
    "B PNS",
    "K PNS",
    "S PNS",
    "B NON PNS",
    "K NON PNS",
    "S NON PNS",
]
with open(rekap_all_path, "w", newline="", encoding="utf-8") as target:
    writer = csv.DictWriter(target, fieldnames=rekap_all_fields)
    writer.writeheader()
    for index, (key, values) in enumerate(sorted(rekap_all.items()), start=1):
        writer.writerow({
            "NO": index,
            "JENIS PETA": key[0],
            "NOMENKLATUR PERGUB 1 2017 (UNTUK PETA JABATAN)": key[1],
            "KELAS JABATAN PERGUB 1 TAHUN 2017": key[2],
            "NOMENKLATUR KEPMENPAN RB 11 TH 2024": key[3],
            "KELAS JABATAN KEPMENPAN RB 11 TH 2024": key[4],
            "ATASAN LANGSUNG": "; ".join(sorted(values["ATASAN LANGSUNG"])),
            "RUMPUN JABATAN": key[5],
            "JUMLAH UNIT KERJA": len(values["JUMLAH UNIT KERJA"]),
            "B PNS": values["B PNS"],
            "K PNS": values["K PNS"],
            "S PNS": values["S PNS"],
            "B NON PNS": values["B NON PNS"],
            "K NON PNS": values["K NON PNS"],
            "S NON PNS": values["S NON PNS"],
        })
PY

cp "$tmp_detail" "$OUT_DIR/rekap.csv"
cp "$tmp_rekap_all" "$OUT_DIR/rekap-all.csv"
cp "$tmp_summary" "$OUT_DIR/ringkasan.csv"

python3 - "$tmp_detail" "$OUT_DIR" <<'PY'
import csv
import os
import re
import sys

detail_path, out_dir = sys.argv[1], sys.argv[2]

sheet_map = [
    ("DINKES", "DINAS KESEHATAN"),
    ("SUDIN KOTA (2)", "SUKU DINAS KOTA"),
    ("SUDIN KEP 1000 (2)", "SUKU DINAS SERIBU"),
    ("RSUD A  (2)", "RSUD A"),
    ("RSUD B ", "RSUD B"),
    ("RSKD   (2)", "RSKD"),
    ("RSUD C (2)", "RSUD C"),
    ("RSUD D", "RSUD D"),
    ("UPT PPKP (2)", "PPKP"),
    ("UPT LABKESDA (2)", "LABKESDA"),
    ("UPT PK3D", "PK3D"),
    (" UPT PUSDATIN", "PUSDATIN"),
    ("UPT PUSLATKESDA", "PUSLATKESDA"),
    ("UPT JAMKESJAK", "JAMKESJA"),
    ("PUSKESMAS  ", "PUSKESMAS"),
]

peta_map = [
    ("PETA DINKES KEPMENPAN 11", "DINAS KESEHATAN"),
    ("PETA SUDIN KOTA KEPMENPAN 11", "SUKU DINAS KOTA"),
    ("PETA SUDIN 1000 KEPMENPAN 11", "SUKU DINAS SERIBU"),
    ("PETA RSUD A KEPMENPAN 11", "RSUD A"),
    ("PETA RSUD B KEPMEN 11", "RSUD B"),
    ("PETA RSKD KEPMENPAN 11", "RSKD"),
    ("PETA RSUD C KEPMEN  11 baru JF", "RSUD C"),
    ("PETA RSUD D KEPMENPAN 11 BRU JF", "RSUD D"),
    ("PETA UPT KEPMENPAN 11", "UPT"),
    (" PETA PUSKESMAS KEPMENPAN 11 ", "PUSKESMAS"),
]

def slug(name):
    return re.sub(r"[^A-Za-z0-9]+", "-", name.strip()).strip("-").lower() or "sheet"

with open(detail_path, newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    rows = list(reader)
    fields = reader.fieldnames or []

def write_rows(filename, selected_rows, selected_fields=None, title_rows=None):
    selected_fields = selected_fields or fields
    with open(os.path.join(out_dir, filename), "w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target)
        for title in title_rows or []:
            writer.writerow(title)
        writer.writerow(selected_fields)
        for row in selected_rows:
            writer.writerow([row.get(field, "") for field in selected_fields])

def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

identity_fields = [
    "NO",
    "NOMENKLATUR PERGUB 1 2017 (UNTUK PETA JABATAN)",
    "KELAS JABATAN PERGUB 1 TAHUN 2017",
    "NOMENKLATUR KEPMENPAN RB 11 TH 2024",
    "KELAS JABATAN KEPMENPAN RB 11 TH 2024",
    "ATASAN LANGSUNG",
    "RUMPUN JABATAN",
]

def number(value):
    try:
        return int(float(value or 0))
    except ValueError:
        return 0

def matrix_identity(row):
    return tuple(clean(row.get(field)) for field in identity_fields[1:])

def write_matrix_rows(filename, selected_rows, title):
    units = sorted({clean(row.get("UNIT KERJA")) for row in selected_rows if clean(row.get("UNIT KERJA"))})
    grouped = {}
    for row in selected_rows:
        identity = matrix_identity(row)
        if identity not in grouped:
            grouped[identity] = {
                "order": number(row.get("NO")),
                "asn": {unit: {"B": 0, "K": 0, "S": 0} for unit in units},
                "non_asn": {unit: {"B": 0, "K": 0, "S": 0} for unit in units},
            }
        unit = clean(row.get("UNIT KERJA"))
        grouped[identity]["asn"].setdefault(unit, {"B": 0, "K": 0, "S": 0})
        grouped[identity]["non_asn"].setdefault(unit, {"B": 0, "K": 0, "S": 0})
        grouped[identity]["asn"][unit]["B"] += number(row.get("B PNS"))
        grouped[identity]["asn"][unit]["K"] += number(row.get("K PNS"))
        grouped[identity]["asn"][unit]["S"] += number(row.get("S PNS"))
        grouped[identity]["non_asn"][unit]["B"] += number(row.get("B NON PNS"))
        grouped[identity]["non_asn"][unit]["K"] += number(row.get("K NON PNS"))
        grouped[identity]["non_asn"][unit]["S"] += number(row.get("S NON PNS"))

    headers = [
        "No.",
        "Nomenklatur ORB/Pergub",
        "Kelas ORB",
        "Nomenklatur Kepmenpan",
        "Kelas Kepmenpan",
        "Atasan Langsung",
        "Rumpun Jabatan",
    ]
    for unit in units:
        headers.extend([
            f"{unit} - B ASN", f"{unit} - K ASN", f"{unit} - S ASN",
            f"{unit} - B NON-ASN", f"{unit} - K NON-ASN", f"{unit} - S NON-ASN",
        ])
    headers.extend(["TOTAL - B ASN", "TOTAL - K ASN", "TOTAL - S ASN", "TOTAL - B NON-ASN", "TOTAL - K NON-ASN", "TOTAL - S NON-ASN"])

    with open(os.path.join(out_dir, filename), "w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target)
        writer.writerow([f"MATRIKS JABATAN UKPD {title}"])
        writer.writerow(headers)
        for index, (identity, value) in enumerate(sorted(grouped.items(), key=lambda item: (item[1]["order"], item[0])), start=1):
            row = [index, *identity]
            asn_total = {"B": 0, "K": 0, "S": 0}
            non_total = {"B": 0, "K": 0, "S": 0}
            for unit in units:
                asn = value["asn"].get(unit, {"B": 0, "K": 0, "S": 0})
                non_asn = value["non_asn"].get(unit, {"B": 0, "K": 0, "S": 0})
                row.extend([asn["B"], asn["K"], asn["S"], non_asn["B"], non_asn["K"], non_asn["S"]])
                for key_name in ["B", "K", "S"]:
                    asn_total[key_name] += asn[key_name]
                    non_total[key_name] += non_asn[key_name]
            row.extend([asn_total["B"], asn_total["K"], asn_total["S"], non_total["B"], non_total["K"], non_total["S"]])
            writer.writerow(row)

for sheet_name, template in sheet_map:
    selected = [row for row in rows if row.get("JENIS PETA") == template]
    write_matrix_rows(
        f"{slug(sheet_name)}.csv",
        selected,
        template,
    )

peta_fields = [
    "NO",
    "NOMENKLATUR KEPMENPAN RB 11 TH 2024",
    "KELAS JABATAN KEPMENPAN RB 11 TH 2024",
    "ATASAN LANGSUNG",
    "RUMPUN JABATAN",
    "B PNS",
    "K PNS",
    "S PNS",
    "B NON PNS",
    "K NON PNS",
    "S NON PNS",
    "UNIT KERJA",
    "JENIS PETA",
]
upt_templates = {"PPKP", "LABKESDA", "PK3D", "PUSDATIN", "PUSLATKESDA", "JAMKESJA"}

def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()

def key(value):
    return clean(value).lower()

def write_peta_rows(filename, selected_rows, title):
    by_title = {key(row.get("NOMENKLATUR KEPMENPAN RB 11 TH 2024")): row for row in selected_rows}
    levels = {}

    def level_for(row, seen=None):
        seen = seen or set()
        job_key = key(row.get("NOMENKLATUR KEPMENPAN RB 11 TH 2024"))
        if job_key in levels:
            return levels[job_key]
        if job_key in seen:
            return 1
        boss_key = key(row.get("ATASAN LANGSUNG"))
        if not boss_key or boss_key not in by_title:
            levels[job_key] = 1
        else:
            levels[job_key] = min(8, level_for(by_title[boss_key], seen | {job_key}) + 1)
        return levels[job_key]

    output_fields = [
        "LEVEL",
        "BAGAN JABATAN",
        "KELAS",
        "ATASAN LANGSUNG",
        "RUMPUN JABATAN",
        "B PNS",
        "K PNS",
        "S PNS",
        "B NON PNS",
        "K NON PNS",
        "S NON PNS",
        "UNIT KERJA",
        "JENIS PETA",
    ]
    with open(os.path.join(out_dir, filename), "w", newline="", encoding="utf-8") as target:
        writer = csv.writer(target)
        writer.writerow([title])
        writer.writerow(output_fields)
        for row in selected_rows:
            level = level_for(row)
            job = clean(row.get("NOMENKLATUR KEPMENPAN RB 11 TH 2024"))
            writer.writerow([
                level,
                f"{'  ' * (level - 1)}{job}",
                row.get("KELAS JABATAN KEPMENPAN RB 11 TH 2024", ""),
                row.get("ATASAN LANGSUNG", ""),
                row.get("RUMPUN JABATAN", ""),
                row.get("B PNS", ""),
                row.get("K PNS", ""),
                row.get("S PNS", ""),
                row.get("B NON PNS", ""),
                row.get("K NON PNS", ""),
                row.get("S NON PNS", ""),
                row.get("UNIT KERJA", ""),
                row.get("JENIS PETA", ""),
            ])

for sheet_name, template in peta_map:
    selected = [row for row in rows if row.get("JENIS PETA") in upt_templates] if template == "UPT" else [row for row in rows if row.get("JENIS PETA") == template]
    write_peta_rows(
        f"{slug(sheet_name)}.csv",
        selected,
        sheet_name.strip(),
    )
PY

python3 - "$OUT_DIR" <<'PY'
import csv
import json
import os
import sys
from datetime import datetime, timezone

out_dir = sys.argv[1]
manifest = {
    "status": "ok",
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "files": {},
    "sheets": [
        {"name": "Ringkasan DB", "file": "ringkasan.csv"},
        {"name": "rekap", "file": "rekap.csv"},
        {"name": "Rekap all", "file": "rekap-all.csv"},
        {"name": "DINKES", "file": "dinkes.csv"},
        {"name": "SUDIN KOTA (2)", "file": "sudin-kota-2.csv"},
        {"name": "SUDIN KEP 1000 (2)", "file": "sudin-kep-1000-2.csv"},
        {"name": "RSUD A  (2)", "file": "rsud-a-2.csv"},
        {"name": "RSUD B ", "file": "rsud-b.csv"},
        {"name": "RSKD   (2)", "file": "rskd-2.csv"},
        {"name": "RSUD C (2)", "file": "rsud-c-2.csv"},
        {"name": "RSUD D", "file": "rsud-d.csv"},
        {"name": "UPT PPKP (2)", "file": "upt-ppkp-2.csv"},
        {"name": "UPT LABKESDA (2)", "file": "upt-labkesda-2.csv"},
        {"name": "UPT PK3D", "file": "upt-pk3d.csv"},
        {"name": " UPT PUSDATIN", "file": "upt-pusdatin.csv"},
        {"name": "UPT PUSLATKESDA", "file": "upt-puslatkesda.csv"},
        {"name": "UPT JAMKESJAK", "file": "upt-jamkesjak.csv"},
        {"name": "PUSKESMAS  ", "file": "puskesmas.csv"},
        {"name": "PETA DINKES KEPMENPAN 11", "file": "peta-dinkes-kepmenpan-11.csv"},
        {"name": "PETA SUDIN KOTA KEPMENPAN 11", "file": "peta-sudin-kota-kepmenpan-11.csv"},
        {"name": "PETA SUDIN 1000 KEPMENPAN 11", "file": "peta-sudin-1000-kepmenpan-11.csv"},
        {"name": "PETA RSUD A KEPMENPAN 11", "file": "peta-rsud-a-kepmenpan-11.csv"},
        {"name": "PETA RSUD B KEPMEN 11", "file": "peta-rsud-b-kepmen-11.csv"},
        {"name": "PETA RSKD KEPMENPAN 11", "file": "peta-rskd-kepmenpan-11.csv"},
        {"name": "PETA RSUD C KEPMEN  11 baru JF", "file": "peta-rsud-c-kepmen-11-baru-jf.csv"},
        {"name": "PETA RSUD D KEPMENPAN 11 BRU JF", "file": "peta-rsud-d-kepmenpan-11-bru-jf.csv"},
        {"name": "PETA UPT KEPMENPAN 11", "file": "peta-upt-kepmenpan-11.csv"},
        {"name": " PETA PUSKESMAS KEPMENPAN 11 ", "file": "peta-puskesmas-kepmenpan-11.csv"}
    ],
}
for name in sorted(item for item in os.listdir(out_dir) if item.endswith(".csv")):
    path = os.path.join(out_dir, name)
    with open(path, newline="", encoding="utf-8") as handle:
        row_count = sum(1 for _ in csv.reader(handle)) - 1
    manifest["files"][name] = {
        "rows": max(row_count, 0),
        "bytes": os.path.getsize(path),
    }
with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
PY

echo "Export selesai: $OUT_DIR"
cat "$OUT_DIR/manifest.json"
