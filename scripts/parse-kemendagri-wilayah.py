import json
import re
from pathlib import Path

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "tmp" / "kemendagri-kode-wilayah-2022.pdf"
OUTPUT_PATH = ROOT / "src" / "data" / "generated" / "wilayah-resmi-kemendagri.json"

PROVINCE_RE = re.compile(r"^\d+\s+(\d{2})\s+(.+?)\s+\d+\s+\d+\s+\d+\s+\d+\s+[\d\.,]+\s+[\d\.,]+\s+[\d\.,]+$")
CITY_RE = re.compile(r"^(\d{2}\.\d{2})\s+((?:KAB\.|KOTA)\s+.+?)\s+\d+\s+\d+\s+\d+\s+[\d\.,]+(?:\s+.+)?$")
DISTRICT_RE = re.compile(r"^(\d{2}\.\d{2}\.\d{2})\s+(\d+)\s*(.+?)\s+(-|\d+)\s+(-|\d+)(?:\s+.+)?$")
VILLAGE_RE = re.compile(r"^(\d{2}\.\d{2}\.\d{2}\.(?:1|2)\d{3})\s+(\d+)\s*(.+)$")

NOTE_STARTERS = [
    "Perbaikan",
    "Pemekaran",
    "Perubahan",
    "Koreksi",
    "Menjadi",
    "Sesuai",
    "Semula",
    "Qanun",
    "Qonun",
    "Perda",
    "Surat",
    "PP",
    "UU.",
    "UU ",
    "Kepmendagri",
    "Kepmen",
    "Rekomedasi",
    "Rekomendasi",
]


def clean_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_spaced_caps(value: str) -> str:
    text = clean_spaces(value)
    return re.sub(r"\b([A-Z])(?:\s+([A-Z]))+\b", lambda match: match.group(0).replace(" ", ""), text)


def strip_note(value: str) -> str:
    text = normalize_spaced_caps(value)
    for starter in NOTE_STARTERS:
        match = re.search(rf"\s+{re.escape(starter)}\b", text)
        if match:
            text = text[:match.start()].strip()
            break
        if text.startswith(f"{starter}"):
            text = ""
            break
    return clean_spaces(text.rstrip("."))


def normalize_city_name(value: str) -> str:
    return normalize_spaced_caps(value.replace("KAB.", "KABUPATEN").replace("KAB ", "KABUPATEN ").replace("KOTA ", "KOTA "))


def parse_provinces(pdf):
    provinces = {}
    for page_number in range(15, min(25, len(pdf.pages)) + 1):
        text = pdf.pages[page_number - 1].extract_text() or ""
        for line in text.splitlines():
            line = clean_spaces(line)
            match = PROVINCE_RE.match(line)
            if not match:
                continue
            code, name = match.groups()
            provinces[code] = normalize_spaced_caps(name)
    return provinces


def main():
    if not PDF_PATH.exists():
      raise SystemExit(f"PDF not found: {PDF_PATH}")

    records = []
    with pdfplumber.open(str(PDF_PATH)) as pdf:
        provinces = parse_provinces(pdf)
        current_city = None
        current_district = None

        for page_number in range(31, len(pdf.pages) + 1):
            text = pdf.pages[page_number - 1].extract_text() or ""
            if not text:
                continue

            for raw_line in text.splitlines():
                line = clean_spaces(raw_line)
                if not line:
                    continue
                if line.startswith("JUMLAH ") or line.startswith("NAMA PROVINSI") or line.startswith("K O D E") or line.startswith("KAB KOTA KECAMATAN") or line.startswith("B.B.") or line.startswith("LAMPIRAN") or line.startswith("TENTANG "):
                    continue
                if re.fullmatch(r"[\d\.]+", line):
                    continue

                city_match = CITY_RE.match(line)
                if city_match:
                    city_code, city_name = city_match.groups()
                    province_code = city_code.split(".")[0]
                    current_city = {
                        "kode_provinsi": province_code,
                        "provinsi": provinces.get(province_code, ""),
                        "kode_kota_kab": city_code,
                        "kota_kabupaten": normalize_city_name(city_name),
                    }
                    current_district = None
                    continue

                district_match = DISTRICT_RE.match(line)
                if district_match and current_city:
                    district_code, _, district_name, _, _ = district_match.groups()
                    current_district = {
                        **current_city,
                        "kode_kecamatan": district_code,
                        "kecamatan": normalize_spaced_caps(district_name),
                    }
                    continue

                village_match = VILLAGE_RE.match(line)
                if village_match and current_district:
                    village_code, _, village_name = village_match.groups()
                    clean_name = strip_note(village_name)
                    if not clean_name:
                        continue
                    records.append({
                        **current_district,
                        "kode_kelurahan": village_code,
                        "kelurahan": clean_name,
                        "jenis_wilayah": "kelurahan" if village_code.split(".")[-1].startswith("1") else "desa",
                    })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {len(records)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
