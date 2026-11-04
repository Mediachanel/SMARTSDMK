import json
import re
import sys
from collections import defaultdict

import pdfplumber


SECTION_TITLES = {
    "RIWAYAT PENDIDIKAN FORMAL": "riwayat_pendidikan_formal",
    "RIWAYAT PENDIDIKAN NON FORMAL": "riwayat_pendidikan_non_formal",
    "RIWAYAT KELUARGA": "riwayat_keluarga",
    "RIWAYAT JABATAN STRUKTURAL": "riwayat_jabatan_struktural",
    "RIWAYAT JABATAN FUNGSIONAL": "riwayat_jabatan_fungsional",
    "RIWAYAT GAJI POKOK": "riwayat_gaji_pokok",
    "RIWAYAT PANGKAT": "riwayat_pangkat",
    "RIWAYAT PENGHARGAAN": "riwayat_penghargaan",
    "RIWAYAT SKP": "riwayat_skp",
    "RIWAYAT HUKUMAN DISIPLIN": "riwayat_hukuman_disiplin",
}

INFORMASI_PENDUKUNG_ORDER = [
    "prestasi_pendidikan_formal",
    "prestasi_pendidikan_non_formal",
    "narasumber",
    "kegiatan_strategis",
    "keberhasilan",
]

PREFIX_TITLE_KEYS = {"dr", "drg", "apt", "ns"}
PREFIX_TITLE_PATTERN = re.compile(r"^\s*(drg|dr|apt|ns)\.\s*", re.IGNORECASE)


def clean_cell(value):
    if value is None:
        return ""
    text = str(value).replace("\xa0", " ").replace("\r", " ").replace("\n", " ").strip()
    return re.sub(r"\s+", " ", text)


def upper(text):
    return clean_cell(text).upper()


def normalize_date(value):
    text = clean_cell(value)
    match = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", text)
    if not match:
        return text or None
    day, month, year = match.groups()
    return f"{year}-{month}-{day}"


def parse_decimal(value):
    text = clean_cell(value)
    if not text:
        return None
    if "." in text and "," in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        digits = text.split(",")[-1]
        text = text.replace(",", ".") if len(digits) <= 2 else text.replace(",", "")
    return text


def split_name_and_title(value):
    text = clean_cell(value)
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r",\s*", ", ", text)
    comma_parts = [clean_cell(part) for part in text.split(",") if clean_cell(part)]
    main_part = comma_parts[0] if comma_parts else text
    suffix = ", ".join(comma_parts[1:]) or None

    prefix = []
    remaining = main_part
    while remaining:
        match = PREFIX_TITLE_PATTERN.match(remaining)
        if not match:
            break
        prefix.append(normalize_prefix_title(match.group(1)))
        remaining = remaining[match.end():].lstrip()

    tokens = remaining.split()
    while tokens:
        token = tokens[0]
        key = re.sub(r"[^a-z]", "", token.lower())
        if key not in PREFIX_TITLE_KEYS:
            break
        prefix.append(normalize_prefix_title(token))
        tokens.pop(0)
        remaining = " ".join(tokens)

    name = clean_cell(remaining) or main_part
    return name, ", ".join(prefix) or None, suffix


def normalize_prefix_title(value):
    raw = clean_cell(value)
    key = re.sub(r"[^a-z]", "", raw.lower())
    if key == "dr":
        return "dr."
    if key == "drg":
        return "drg."
    if key == "ns":
        return "Ns."
    if key == "apt":
        return "Apt."
    return raw


def extract_data_diri(page_text):
    lines = [clean_cell(line) for line in (page_text or "").splitlines()]
    data_lines = []
    capture = False
    for line in lines:
        if upper(line) == "DATA DIRI":
            capture = True
            continue
        if upper(line).startswith("RIWAYAT PENDIDIKAN FORMAL"):
            break
        if capture and line:
            data_lines.append(line)

    values = {}
    current_label = None
    for line in data_lines:
        if ":" in line:
            label, value = line.split(":", 1)
            current_label = clean_cell(label)
            values[current_label] = clean_cell(value)
        elif current_label:
            values[current_label] = clean_cell(f"{values[current_label]} {line}")

    nama, gelar_depan, gelar_belakang = split_name_and_title(values.get("NAMA", ""))

    tempat_lahir = None
    tanggal_lahir = None
    ttl = clean_cell(values.get("TEMPAT / TGL LAHIR", ""))
    if "/" in ttl:
        tempat_lahir, tanggal_lahir = [clean_cell(part) for part in ttl.split("/", 1)]
        tanggal_lahir = normalize_date(tanggal_lahir)

    nrk = None
    nip = None
    nrk_nip = clean_cell(values.get("NRK / NIP", ""))
    if "/" in nrk_nip:
        nrk, nip = [clean_cell(part) for part in nrk_nip.split("/", 1)]
    elif nrk_nip:
        nip = nrk_nip

    telepon = None
    hp = None
    no_telp_hp = clean_cell(values.get("NO. TELEPON / HP", ""))
    if "/" in no_telp_hp:
        telepon, hp = [clean_cell(part) or None for part in no_telp_hp.split("/", 1)]
    elif no_telp_hp:
        hp = no_telp_hp

    return {
        "nama_lengkap": clean_cell(values.get("NAMA", "")) or None,
        "nama": nama or None,
        "gelar_depan": gelar_depan,
        "gelar_belakang": gelar_belakang,
        "nrk": nrk,
        "nip": nip,
        "tempat_lahir": tempat_lahir,
        "tanggal_lahir": tanggal_lahir,
        "agama": clean_cell(values.get("AGAMA", "")) or None,
        "jenis_kelamin": clean_cell(values.get("JENIS KELAMIN", "")) or None,
        "status_pernikahan": clean_cell(values.get("STATUS PERNIKAHAN", "")) or None,
        "jabatan": clean_cell(values.get("JABATAN", "")) or None,
        "unit_kerja": clean_cell(values.get("UNIT KERJA", "")) or None,
        "no_telepon": telepon,
        "no_hp": hp,
        "email": clean_cell(values.get("EMAIL", "")) or None,
        "alamat": clean_cell(values.get("ALAMAT", "")) or None,
    }


def normalize_table_rows(table):
    rows = []
    for row in table or []:
        normalized = [clean_cell(cell) for cell in row]
        if any(normalized):
            rows.append(normalized)
    return rows


def collect_sections(pdf):
    sections = defaultdict(list)
    current_section = None

    for page_index, page in enumerate(pdf.pages):
        page_text = page.extract_text() or ""
        tables = page.extract_tables() or []
        info_mode = "INFORMASI PENDUKUNG" in upper(page_text)
        info_cursor = 0

        for table in tables:
            rows = normalize_table_rows(table)
            if not rows:
                continue

            first_cell = upper(rows[0][0] if rows[0] else "")
            matched = SECTION_TITLES.get(first_cell)
            data_rows = rows

            if matched:
                current_section = matched
                data_rows = rows[1:]
            elif info_mode and first_cell == "NO" and info_cursor < len(INFORMASI_PENDUKUNG_ORDER):
                current_section = INFORMASI_PENDUKUNG_ORDER[info_cursor]
                info_cursor += 1
                data_rows = rows[1:]

            if data_rows and upper(data_rows[0][0]) == "NO":
                data_rows = data_rows[1:]

            if current_section:
                sections[current_section].extend(data_rows)

    return sections


def iter_data_rows(rows):
    for row in rows or []:
        first = upper(row[0] if row else "")
        if not first or first == "NO" or first == "TIDAK ADA DATA":
            continue
        yield row


def infer_hubungan_detail(text):
    raw = upper(text)
    if "ANAK" in raw:
        return "anak"
    return "pasangan"


def parse_ttl(value):
    text = clean_cell(value)
    if not text:
        return None, None
    parts = [clean_cell(part) for part in text.split(",")]
    if len(parts) >= 2:
        return parts[0], normalize_date(parts[-1])
    return text, None


def parse_pendidikan(rows, jenis_riwayat):
    items = []
    for row in iter_data_rows(rows):
        if jenis_riwayat == "formal":
            jenjang = row[1] if len(row) > 1 else ""
            jurusan = row[2] if len(row) > 2 else ""
            tanggal_ijazah = row[3] if len(row) > 3 else ""
            nama_institusi = row[4] if len(row) > 4 else ""
            kota = row[5] if len(row) > 5 else ""
        else:
            jenjang = None
            jurusan = None
            tanggal_ijazah = row[1] if len(row) > 1 else ""
            nama_institusi = row[2] if len(row) > 2 else ""
            kota = row[3] if len(row) > 3 else ""

        year = None
        date_iso = normalize_date(tanggal_ijazah)
        if date_iso and re.match(r"^\d{4}-\d{2}-\d{2}$", date_iso):
            year = date_iso[:4]

        items.append(
            {
                "jenis_riwayat": jenis_riwayat,
                "jenjang_pendidikan": clean_cell(jenjang) or None,
                "program_studi": clean_cell(jurusan) or None,
                "nama_institusi": clean_cell(nama_institusi) or None,
                "nama_universitas": clean_cell(nama_institusi) or None,
                "kota_institusi": clean_cell(kota) or None,
                "tanggal_ijazah": date_iso,
                "tahun_lulus": year,
            }
        )
    return items


def parse_keluarga(rows):
    items = []
    for row in iter_data_rows(rows):
        hubungan_detail = clean_cell(row[1] if len(row) > 1 else "")
        tempat_lahir, tanggal_lahir = parse_ttl(row[3] if len(row) > 3 else "")
        hubungan = infer_hubungan_detail(hubungan_detail)
        urutan = None
        if hubungan == "anak":
            match = re.search(r"ANAK\s+(\d+)", upper(hubungan_detail))
            urutan = int(match.group(1)) if match else None

        items.append(
            {
                "hubungan": hubungan,
                "hubungan_detail": hubungan_detail or None,
                "status_punya": "Ya" if hubungan == "pasangan" else None,
                "status_tunjangan": clean_cell(row[5] if len(row) > 5 else "") or None,
                "urutan": urutan,
                "nama": clean_cell(row[2] if len(row) > 2 else "") or None,
                "jenis_kelamin": clean_cell(row[4] if len(row) > 4 else "") or None,
                "tempat_lahir": tempat_lahir,
                "tanggal_lahir": tanggal_lahir,
                "pekerjaan": clean_cell(row[6] if len(row) > 6 else "") or None,
            }
        )
    return items


def parse_jabatan(rows, jenis_jabatan):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "jenis_jabatan": jenis_jabatan,
                "tmt_jabatan": normalize_date(row[1] if len(row) > 1 else ""),
                "lokasi": clean_cell(row[2] if len(row) > 2 else "") or None,
                "nama_jabatan_menpan": clean_cell(row[3] if len(row) > 3 else "") or None,
                "pangkat_golongan": clean_cell(row[4] if len(row) > 4 else "") or None,
                "eselon": clean_cell(row[5] if len(row) > 5 else "") or None if jenis_jabatan == "struktural" else None,
                "nomor_sk": clean_cell(row[6] if len(row) > 6 else "") or None if jenis_jabatan == "struktural" else clean_cell(row[5] if len(row) > 5 else "") or None,
                "tanggal_sk": normalize_date(row[7] if len(row) > 7 else "") if jenis_jabatan == "struktural" else normalize_date(row[6] if len(row) > 6 else ""),
            }
        )
    return items


def parse_gaji(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "tmt_gaji": normalize_date(row[1] if len(row) > 1 else ""),
                "pangkat_golongan": clean_cell(row[2] if len(row) > 2 else "") or None,
                "gaji_pokok": parse_decimal(row[3] if len(row) > 3 else ""),
                "nomor_sk": clean_cell(row[4] if len(row) > 4 else "") or None,
                "tanggal_sk": normalize_date(row[5] if len(row) > 5 else ""),
            }
        )
    return items


def parse_pangkat(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "tmt_pangkat": normalize_date(row[1] if len(row) > 1 else ""),
                "pangkat_golongan": clean_cell(row[2] if len(row) > 2 else "") or None,
                "lokasi": clean_cell(row[3] if len(row) > 3 else "") or None,
                "nomor_sk": clean_cell(row[4] if len(row) > 4 else "") or None,
                "tanggal_sk": normalize_date(row[5] if len(row) > 5 else ""),
            }
        )
    return items


def parse_penghargaan(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "nama_penghargaan": clean_cell(row[1] if len(row) > 1 else "") or None,
                "asal_penghargaan": clean_cell(row[2] if len(row) > 2 else "") or None,
                "nomor_sk": clean_cell(row[3] if len(row) > 3 else "") or None,
                "tanggal_sk": normalize_date(row[4] if len(row) > 4 else ""),
            }
        )
    return items


def parse_skp(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "tahun": clean_cell(row[1] if len(row) > 1 else "") or None,
                "nilai_skp": parse_decimal(row[2] if len(row) > 2 else ""),
                "nilai_perilaku": parse_decimal(row[3] if len(row) > 3 else ""),
                "nilai_prestasi": parse_decimal(row[4] if len(row) > 4 else ""),
                "keterangan_prestasi": clean_cell(row[5] if len(row) > 5 else "") or None,
            }
        )
    return items


def parse_hukuman(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "tanggal_mulai": normalize_date(row[1] if len(row) > 1 else ""),
                "tanggal_akhir": normalize_date(row[2] if len(row) > 2 else ""),
                "hukuman_disiplin": clean_cell(row[3] if len(row) > 3 else "") or None,
                "nomor_sk": clean_cell(row[4] if len(row) > 4 else "") or None,
                "tanggal_sk": normalize_date(row[5] if len(row) > 5 else ""),
                "keterangan": clean_cell(row[6] if len(row) > 6 else "") or None,
            }
        )
    return items


def parse_prestasi_pendidikan(rows, kategori):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "kategori": kategori,
                "jenjang_pendidikan": clean_cell(row[1] if len(row) > 1 else "") or None,
                "prestasi": clean_cell(row[2] if len(row) > 2 else "") or None,
            }
        )
    return items


def parse_narasumber(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "kegiatan": clean_cell(row[1] if len(row) > 1 else "") or None,
                "judul_materi": clean_cell(row[2] if len(row) > 2 else "") or None,
                "lembaga_penyelenggara": clean_cell(row[3] if len(row) > 3 else "") or None,
            }
        )
    return items


def parse_kegiatan_strategis(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "kegiatan": clean_cell(row[1] if len(row) > 1 else "") or None,
                "tahun_anggaran": clean_cell(row[2] if len(row) > 2 else "") or None,
                "jumlah_anggaran": parse_decimal(row[3] if len(row) > 3 else ""),
                "kedudukan_dalam_kegiatan": clean_cell(row[4] if len(row) > 4 else "") or None,
            }
        )
    return items


def parse_keberhasilan(rows):
    items = []
    for row in iter_data_rows(rows):
        items.append(
            {
                "jabatan": clean_cell(row[1] if len(row) > 1 else "") or None,
                "tahun": clean_cell(row[2] if len(row) > 2 else "") or None,
                "keberhasilan": clean_cell(row[3] if len(row) > 3 else "") or None,
                "kendala_yang_dihadapi": clean_cell(row[4] if len(row) > 4 else "") or None,
                "solusi_yang_dilakukan": clean_cell(row[5] if len(row) > 5 else "") or None,
            }
        )
    return items


def parse_pdf(path):
    with pdfplumber.open(path) as pdf:
        page_texts = [page.extract_text() or "" for page in pdf.pages]
        sections = collect_sections(pdf)

    pendidikan_formal = parse_pendidikan(sections.get("riwayat_pendidikan_formal"), "formal")
    pendidikan_non_formal = parse_pendidikan(sections.get("riwayat_pendidikan_non_formal"), "non_formal")
    keluarga = parse_keluarga(sections.get("riwayat_keluarga"))
    jabatan = parse_jabatan(sections.get("riwayat_jabatan_struktural"), "struktural") + parse_jabatan(
        sections.get("riwayat_jabatan_fungsional"), "fungsional"
    )
    gaji = parse_gaji(sections.get("riwayat_gaji_pokok"))
    pangkat = parse_pangkat(sections.get("riwayat_pangkat"))
    penghargaan = parse_penghargaan(sections.get("riwayat_penghargaan"))
    skp = parse_skp(sections.get("riwayat_skp"))
    hukuman = parse_hukuman(sections.get("riwayat_hukuman_disiplin"))
    prestasi_formal = parse_prestasi_pendidikan(sections.get("prestasi_pendidikan_formal"), "formal")
    prestasi_non_formal = parse_prestasi_pendidikan(sections.get("prestasi_pendidikan_non_formal"), "non_formal")
    narasumber = parse_narasumber(sections.get("narasumber"))
    kegiatan_strategis = parse_kegiatan_strategis(sections.get("kegiatan_strategis"))
    keberhasilan = parse_keberhasilan(sections.get("keberhasilan"))

    result = {
        "metadata": {
            "pages": len(page_texts),
        },
        "pegawai": extract_data_diri(page_texts[0] if page_texts else ""),
        "riwayat_pendidikan": pendidikan_formal + pendidikan_non_formal,
        "keluarga": keluarga,
        "riwayat_jabatan": jabatan,
        "riwayat_gaji_pokok": gaji,
        "riwayat_pangkat": pangkat,
        "riwayat_penghargaan": penghargaan,
        "riwayat_skp": skp,
        "riwayat_hukuman_disiplin": hukuman,
        "informasi_pendukung": {
            "prestasi_pendidikan": prestasi_formal + prestasi_non_formal,
            "narasumber": narasumber,
            "kegiatan_strategis": kegiatan_strategis,
            "keberhasilan": keberhasilan,
        },
    }
    result["counts"] = {
        "riwayat_pendidikan": len(result["riwayat_pendidikan"]),
        "keluarga": len(keluarga),
        "riwayat_jabatan": len(jabatan),
        "riwayat_gaji_pokok": len(gaji),
        "riwayat_pangkat": len(pangkat),
        "riwayat_penghargaan": len(penghargaan),
        "riwayat_skp": len(skp),
        "riwayat_hukuman_disiplin": len(hukuman),
        "prestasi_pendidikan": len(result["informasi_pendukung"]["prestasi_pendidikan"]),
        "narasumber": len(narasumber),
        "kegiatan_strategis": len(kegiatan_strategis),
        "keberhasilan": len(keberhasilan),
    }
    return result


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: parse_drh_pdf.py <pdf_path>")
    parsed = parse_pdf(sys.argv[1])
    print(json.dumps(parsed, ensure_ascii=False))


if __name__ == "__main__":
    main()
