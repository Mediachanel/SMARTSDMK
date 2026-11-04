"""Ekstrak identitas jabatan dan kebutuhan dari sheet Data Jabatan.

Bezetting dan selisih sengaja tidak diimpor karena dihitung dari tabel pegawai.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

from openpyxl import load_workbook


def clean(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def integer(value):
    try:
        return max(0, int(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def normalize_supervisor(value):
    """Samakan nomenklatur atasan lama dengan nomenklatur resmi yang berlaku."""
    supervisor = clean(value)
    aliases = {
        "KETUA PUSKESMAS KELURAHAN PEMBANTU": "Kepala Puskesmas Pembantu",
    }
    return aliases.get(supervisor.upper(), supervisor)


def merge_puskesmas_functional_positions(records):
    """Gabungkan kebutuhan JF Puskesmas Pembantu ke JF Puskesmas yang sama.

    Kepala Puskesmas Pembantu tetap menjadi unit di bawah Kepala Puskesmas,
    tetapi bukan induk formasi jabatan fungsional pada peta jabatan.
    """
    main_supervisor = "ADMINISTRATOR MADYA (KEPALA PUSKESMAS KECAMATAN)"
    assistant_supervisor = "KEPALA PUSKESMAS PEMBANTU"

    def identity(record):
        title = clean(record.get("nama_jabatan_menpan") or record.get("nama_jabatan_orb")).upper()
        return record.get("nama_ukpd_source"), title

    main_positions = {
        identity(record): record
        for record in records
        if record.get("template_ukpd") == "PUSKESMAS"
        and clean(record.get("atasan_langsung")).upper() == main_supervisor
        and "FUNGSIONAL" in clean(record.get("rumpun_jabatan")).upper()
    }

    merged = []
    for record in records:
        is_assistant_functional = (
            record.get("template_ukpd") == "PUSKESMAS"
            and clean(record.get("atasan_langsung")).upper() == assistant_supervisor
            and "FUNGSIONAL" in clean(record.get("rumpun_jabatan")).upper()
        )
        if not is_assistant_functional:
            merged.append(record)
            continue

        target = main_positions.get(identity(record))
        if target:
            target["kebutuhan_asn"] += record["kebutuhan_asn"]
            target["kebutuhan_non_asn"] += record["kebutuhan_non_asn"]
            continue

        record["atasan_langsung"] = "Administrator Madya (Kepala Puskesmas Kecamatan)"
        merged.append(record)

    return merged


def normalize_coordinator_supervisors(records):
    """Jadikan ketua/koordinator satuan sebagai atasan langsung pelaksana.

    Workbook menyimpan baris sesuai urutan bagan, tetapi sebagian kolom atasan
    masih menunjuk kepala bidang/bagian. Rentang berikut mengikuti cabang bagan
    resmi yang juga digunakan oleh halaman Peta Jabatan.
    """
    upt_templates = {"PPKP", "LABKESDA", "PUSLATKESDA", "PK3D", "JAMKESJA", "PUSDATIN"}

    def title(record):
        return clean(record.get("nama_jabatan_menpan") or record.get("nama_jabatan_orb"))

    def text_key(value):
        return clean(value).upper()

    def is_executor(record):
        family = text_key(record.get("rumpun_jabatan"))
        return "PELAKSANA" in family and "PELAKSANA SATUAN" not in family

    def is_coordinator(record):
        name = text_key(title(record))
        family = text_key(record.get("rumpun_jabatan"))
        return bool(re.match(r"^(?:KOORD\w*|KETUA|KEPALA)\s+SATUAN\b", name)) or "PELAKSANA SATUAN" in family

    def ordered(items):
        return sorted(items, key=lambda item: (int(item.get("urutan") or 0), clean(item.get("source_key"))))

    def assign(coordinator, members):
        if not coordinator:
            return
        supervisor = title(coordinator)
        for member in members:
            if is_executor(member):
                member["atasan_langsung"] = supervisor

    def at(items, order):
        return next((item for item in items if int(item.get("urutan") or 0) == order), None)

    def between(items, first, last):
        return [item for item in items if first <= int(item.get("urutan") or 0) <= last]

    grouped = {}
    for record in records:
        group_key = (record["template_ukpd"], clean(record.get("nama_ukpd_source")))
        grouped.setdefault(group_key, []).append(record)

    for (template, _unit), group_records in grouped.items():
        items = ordered(group_records)
        if template in {"RSUD A", "RSUD B", "RSKD"}:
            heads = [item for item in items if text_key(title(item)).startswith(("KEPALA BAGIAN ", "KEPALA BIDANG "))]
            service_deputy = next((item for item in items if text_key(title(item)).startswith("WAKIL DIREKTUR") and "PELAYANAN" in text_key(title(item))), None)
            boundaries = ordered(heads + ([service_deputy] if service_deputy else []))
            for head in ordered(heads):
                head_order = int(head["urutan"])
                next_boundary = next((item for item in boundaries if int(item["urutan"]) > head_order), None)
                scope = [item for item in items if int(item["urutan"]) > head_order and (not next_boundary or int(item["urutan"]) < int(next_boundary["urutan"]))]
                indexes = [index for index, item in enumerate(scope) if is_coordinator(item)]
                for group_index, index in enumerate(indexes):
                    stop = indexes[group_index + 1] if group_index + 1 < len(indexes) else len(scope)
                    assign(scope[index], scope[index + 1:stop])

            spi = next((item for item in items if "PENGAWAS INTERNAL" in text_key(title(item)) and is_coordinator(item)), None)
            first_head = min((int(item["urutan"]) for item in heads), default=None)
            if spi and first_head:
                assign(spi, [item for item in items if int(spi["urutan"]) < int(item["urutan"]) < first_head])

        elif template == "RSUD C":
            for head, first, last in [
                (11, 12, 13), (18, 19, 21), (22, 23, 26), (27, 28, 33),
                (56, 57, 58), (59, 60, 61), (62, 63, 64),
                (162, 163, 165), (166, 167, 169), (170, 171, 173),
            ]:
                assign(at(items, head), between(items, first, last))

        elif template == "RSUD D":
            for head, first, last in [
                (8, 25, 26), (31, 32, 39), (9, 40, 43),
                (10, 61, 62), (63, 64, 65), (66, 67, 68),
                (149, 150, 152), (11, 153, 155),
            ]:
                assign(at(items, head), between(items, first, last))

        elif template in upt_templates:
            coordinator_indexes = [index for index, item in enumerate(items) if is_coordinator(item)]
            for group_index, index in enumerate(coordinator_indexes):
                stop = coordinator_indexes[group_index + 1] if group_index + 1 < len(coordinator_indexes) else len(items)
                assign(items[index], items[index + 1:stop])

        elif template == "PUSKESMAS":
            for head, first, last in [(11, 12, 12), (38, 39, 40), (41, 42, 43), (44, 33, 33)]:
                assign(at(items, head), between(items, first, last))

    return records


def normalize_known_structure_titles(records):
    """Pertahankan nomenklatur struktur yang telah disahkan di aplikasi."""
    promotion_descriptor = "PROMOSI KESEHATAN DAN TATA KELOLA KESEHATAN MASYARAKAT"
    official_chair = "Administrator Kesehatan Ahli Muda (KETUA Sub Kelompok Promosi Kesehatan dan Tata Kelola Kesehatan Masyarakat)"
    for record in records:
        if record.get("template_ukpd") == "RSUD D" and clean(record.get("nama_jabatan_menpan")).upper() == "PENATA ANESTESI AHLI MADYA":
            record["atasan_langsung"] = "Direktur RSUD D"
            record["kelas_jabatan_orb"] = "11"
            record["kelas_jabatan_menpan"] = "11"
        if record.get("template_ukpd") != "DINAS KESEHATAN":
            continue
        orb = clean(record.get("nama_jabatan_orb"))
        menpan = clean(record.get("nama_jabatan_menpan"))
        supervisor = clean(record.get("atasan_langsung"))
        if promotion_descriptor in orb.upper() and ("SUBKELOMPOK" in orb.upper() or "SUB KELOMPOK" in orb.upper()):
            record["nama_jabatan_orb"] = official_chair
        if promotion_descriptor in menpan.upper() and ("SUBKELOMPOK" in menpan.upper() or "SUB KELOMPOK" in menpan.upper()):
            record["nama_jabatan_menpan"] = official_chair
        if promotion_descriptor in supervisor.upper() and ("SUBKELOMPOK" in supervisor.upper() or "SUB KELOMPOK" in supervisor.upper()):
            record["atasan_langsung"] = official_chair
    return records


def normalize_template(value):
    template = clean(value).upper()
    aliases = {
        "SUKU DINAS KESEHATAN KOTA": "SUKU DINAS KOTA",
        "SUKU DINAS KESEHATAN SERIBU": "SUKU DINAS SERIBU",
        "JAMKESJAK": "JAMKESJA",
    }
    return aliases.get(template, template)


def is_unit_header(template, value):
    unit = clean(value).upper()
    if not unit or "TOTAL" in unit:
        return False
    if template == "SUKU DINAS KOTA":
        return "SUDIN" in unit
    if template.startswith("RSUD"):
        return "RSUD" in unit or unit == "PADEMANGAN"
    if template == "PUSKESMAS":
        return "PUSKESMAS" in unit or "PUKESMAS" in unit
    return False


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: python scripts/extract-peta-jabatan.py <xlsx> <output-json>")
    source = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    workbook = load_workbook(source, read_only=True, data_only=True)
    records = []

    def add_record(*, source_sheet, source_row, template, unit_name, row, kebutuhan_asn, kebutuhan_non_asn):
        orb = clean(row[1] if len(row) > 1 else None)
        menpan = clean(row[3] if len(row) > 3 else None)
        if not (orb or menpan) or orb.upper().startswith(("NAMA JABATAN", "NOMENKLATUR", "JUMLAH")):
            return
        if menpan.upper().startswith(("NAMA JABATAN", "NOMENKLATUR", "JUMLAH")):
            return
        if orb.startswith("#") or menpan.startswith("#"):
            return
        supervisor = normalize_supervisor(row[5] if len(row) > 5 else None)
        raw_key = "|".join([source_sheet, template, unit_name or "", orb, menpan, supervisor, str(source_row)])
        records.append({
            "source_key": hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:40],
            "source_sheet": source_sheet,
            "source_row": source_row,
            "template_ukpd": template,
            "nama_ukpd_source": unit_name or None,
            "nama_jabatan_orb": orb or None,
            "kelas_jabatan_orb": clean(row[2] if len(row) > 2 else None) or None,
            "nama_jabatan_menpan": menpan or None,
            "kelas_jabatan_menpan": clean(row[4] if len(row) > 4 else None) or None,
            "atasan_langsung": supervisor or None,
            "rumpun_jabatan": clean(row[6] if len(row) > 6 else None) or None,
            "kebutuhan_asn": integer(kebutuhan_asn),
            "kebutuhan_non_asn": integer(kebutuhan_non_asn),
            "urutan": source_row,
        })

    single_templates = {
        "DINAS KESEHATAN", "SUKU DINAS SERIBU", "RSUD A", "RSKD", "PPKP",
        "LABKESDA", "PK3D", "PUSDATIN", "PUSLATKESDA", "JAMKESJA",
    }
    rekap = workbook["rekap"]
    for row_number, row in enumerate(rekap.iter_rows(min_row=3, max_col=14, values_only=True), 3):
        template = normalize_template(row[13] if len(row) > 13 else None)
        if template not in single_templates:
            continue
        add_record(
            source_sheet="rekap", source_row=row_number, template=template, unit_name=None, row=row,
            kebutuhan_asn=row[8] if len(row) > 8 else 0,
            kebutuhan_non_asn=row[11] if len(row) > 11 else 0,
        )

    matrix_sheets = [
        ("SUKU DINAS KOTA", "SUDIN KOTA (2)", 5, False),
        ("RSUD B", "RSUD B ", 4, True),
        ("RSUD C", "RSUD C (2)", 3, True),
        ("RSUD D", "RSUD D", 3, True),
        ("PUSKESMAS", "PUSKESMAS  ", 4, True),
    ]
    for template, sheet_name, header_row, has_non_asn in matrix_sheets:
        matrix = workbook[sheet_name]
        headers = list(next(matrix.iter_rows(min_row=header_row, max_row=header_row, values_only=True)))
        unit_columns = []
        for column_index, value in enumerate(headers):
            unit_name = clean(value)
            if column_index < 7 or not is_unit_header(template, unit_name):
                continue
            unit_columns.append((column_index, unit_name))

        for row_number, row in enumerate(matrix.iter_rows(min_row=header_row + 1, values_only=True), header_row + 1):
            if len(row) < 7:
                continue
            for base_column, unit_name in unit_columns:
                kebutuhan_asn = integer(row[base_column + 1] if len(row) > base_column + 1 else 0)
                kebutuhan_non_asn = integer(row[base_column + 4] if has_non_asn and len(row) > base_column + 4 else 0)
                add_record(
                    source_sheet=sheet_name, source_row=row_number, template=template,
                    unit_name=unit_name, row=row, kebutuhan_asn=kebutuhan_asn,
                    kebutuhan_non_asn=kebutuhan_non_asn,
                )

    records = merge_puskesmas_functional_positions(records)
    records = normalize_known_structure_titles(records)
    records = normalize_coordinator_supervisors(records)
    workbook.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Berhasil mengekstrak {len(records)} identitas jabatan ke {output}")


if __name__ == "__main__":
    main()
