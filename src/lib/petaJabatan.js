import { getConnectedPool } from "@/lib/db/postgres";
import { ensurePetaJabatanSchema } from "@/lib/db/ensurePetaJabatanSchema";
import { ROLES } from "@/lib/constants/roles";
import { canonicalUkpd } from "@/lib/ukpdNormalization";

const ASN_TYPES = new Set(["PNS", "CPNS", "PPPK"]);
const NON_ASN_TYPES = new Set(["PPPK PARUH WAKTU", "NON PNS", "NON ASN", "NON PNS/ASN"]);

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function key(value) {
  return clean(value).toLocaleLowerCase("id-ID");
}

function jobReferenceAliases(...values) {
  const aliases = new Set();
  for (const value of values.map(clean).filter(Boolean)) {
    const spaced = value.replace(/SUB\s*KELOMPOK/gi, "Sub Kelompok");
    const rankVariants = new Set([
      value,
      spaced,
      spaced.replace(/Administrator Kesehatan Ahli Muda\s*\(/i, "Administrator Kesehatan ("),
      spaced.replace(/Administrator Kesehatan\s*\(/i, "Administrator Kesehatan Ahli Muda (")
    ]);
    for (const variant of rankVariants) {
      aliases.add(variant);
      if (/KETUA/i.test(variant)) aliases.add(variant.replace(/KETUA/gi, "KOORDIANTOR"));
      if (/KOORDI(?:AN|NA|A|N)?TOR/i.test(variant)) aliases.add(variant.replace(/KOORDI(?:AN|NA|A|N)?TOR/gi, "KETUA"));
    }
  }
  return [...aliases];
}

function aggregatePositions(positions) {
  const map = new Map();
  for (const position of positions) {
    const identity = [position.nama_jabatan_menpan, position.nama_jabatan_orb, position.atasan_langsung, position.rumpun_jabatan].map(key).join("|");
    if (!map.has(identity)) map.set(identity, { ...position, id: identity, nama_ukpd_source: null, kebutuhan_asn: 0, kebutuhan_non_asn: 0 });
    const current = map.get(identity);
    current.kebutuhan_asn += Number(position.kebutuhan_asn) || 0;
    current.kebutuhan_non_asn += Number(position.kebutuhan_non_asn) || 0;
  }
  return [...map.values()].sort((a, b) => Number(a.urutan) - Number(b.urutan));
}

function positionIdentity(position) {
  return [position.nama_jabatan_menpan, position.nama_jabatan_orb, position.atasan_langsung, position.rumpun_jabatan]
    .map(key)
    .join("|");
}

function emptyMatrixMetric() {
  return {
    asn: { b: 0, k: 0, s: 0 },
    non_asn: { b: 0, k: 0, s: 0 }
  };
}

function addMatrixMetric(target, source) {
  for (const group of ["asn", "non_asn"]) {
    target[group].b += Number(source[group].b) || 0;
    target[group].k += Number(source[group].k) || 0;
    target[group].s = target[group].b - target[group].k;
  }
  return target;
}

function employeeGroup(value) {
  const normalized = clean(value).toUpperCase().replace(/[_-]+/g, " ");
  if (normalized === "PJLP" || normalized.includes("PENYEDIA JASA LAINNYA")) return "PJLP";
  if (ASN_TYPES.has(normalized)) return "ASN";
  if (NON_ASN_TYPES.has(normalized) || normalized.includes("PARUH WAKTU")) return "NON_ASN";
  return "";
}

export function resolvePetaTemplate({ nama_ukpd: namaUkpd, jenis_ukpd: jenisUkpd }) {
  const source = `${clean(jenisUkpd)} ${clean(namaUkpd)}`.toUpperCase();
  if (source.includes("RSKD") || source.includes("RUMAH SAKIT KHUSUS")) return "RSKD";
  if (source.includes("RSUD") || source.includes("RUMAH SAKIT UMUM")) {
    const rsudA = ["TARAKAN"];
    const rsudB = ["CENGKARENG", "PASAR REBO", "KOJA", "PASAR MINGGU", "BUDHI ASIH"];
    const rsudC = ["TUGU KOJA", "CILINCING", "PESANGGRAHAN", "TEBET", "KRAMAT JATI"];
    if (rsudA.some((name) => source.includes(name))) return "RSUD A";
    if (rsudC.some((name) => source.includes(name))) return "RSUD C";
    if (rsudB.some((name) => source.includes(name))) return "RSUD B";
    for (const grade of ["A", "B", "C", "D"]) {
      if (new RegExp(`(?:KELAS|TIPE)\\s*${grade}(?:\\s|$)`).test(source)) return `RSUD ${grade}`;
    }
    return "RSUD D";
  }
  if (source.includes("PUSKESMAS") || source.includes("PUSAT KESEHATAN MASYARAKAT")) return "PUSKESMAS";
  if (source.includes("SUKU DINAS")) return source.includes("SERIBU") ? "SUKU DINAS SERIBU" : "SUKU DINAS KOTA";
  if (source.includes("LABKES")) return "LABKESDA";
  if (source.includes("PK3D") || source.includes("KRISIS") || source.includes("KEGAWATDARURATAN")) return "PK3D";
  if (source.includes("PUSDATIN") || source.includes("DATA DAN TEKNOLOGI")) return "PUSDATIN";
  if (source.includes("JAMKES") || source.includes("JAMINAN KESEHATAN")) return "JAMKESJA";
  if (source.includes("PUSLATKES") || source.includes("PELATIHAN KESEHATAN")) return "PUSLATKESDA";
  if (source.includes("PPKP") || source.includes("PELAYANAN KESEHATAN PEGAWAI")) return "PPKP";
  if (source.includes("DINAS KESEHATAN")) return "DINAS KESEHATAN";
  return "";
}

function jobKey(value) {
  return clean(value)
    .toUpperCase()
    .replace(/\bAHLI\s+(UTAMA|MADYA|MUDA|PERTAMA)\b/g, "$1")
    .replace(/\bTINGKAT\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positionScore(position, employee) {
  const employeeTitles = new Set([jobKey(employee.nama_jabatan_menpan), jobKey(employee.nama_jabatan_orb)].filter(Boolean));
  const positionTitles = [jobKey(position.nama_jabatan_menpan), jobKey(position.nama_jabatan_orb)].filter(Boolean);
  if (!positionTitles.some((title) => employeeTitles.has(title))) return -1;
  let score = 10;
  if (jobKey(position.nama_jabatan_menpan) === jobKey(employee.nama_jabatan_menpan)) score += 3;
  if (jobKey(position.nama_jabatan_orb) === jobKey(employee.nama_jabatan_orb)) score += 2;
  const positionBoss = jobKey(position.atasan_langsung);
  const employeeBoss = jobKey(employee.struktur_atasan_langsung);
  if (positionBoss && employeeBoss) {
    if (positionBoss === employeeBoss) score += 8;
    else if (positionBoss.includes(employeeBoss) || employeeBoss.includes(positionBoss)) score += 4;
  }
  return score;
}

function jobLookupScore(position, jabatan) {
  const target = jobKey(jabatan);
  if (!target) return -1;
  const titleKeys = [jobKey(position.nama_jabatan_menpan), jobKey(position.nama_jabatan_orb)].filter(Boolean);
  if (!titleKeys.length) return -1;
  if (titleKeys.some((title) => title === target)) return 100;
  if (titleKeys.some((title) => title.includes(target) || target.includes(title))) return 75;

  const targetWords = target.split(" ").filter(Boolean);
  if (targetWords.length && titleKeys.some((title) => targetWords.every((word) => title.includes(word)))) return 50;
  return -1;
}

function fullName(employee) {
  return [employee.gelar_depan, employee.nama, employee.gelar_belakang]
    .map(clean)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+,/g, ",");
}

async function getScopedUkpd(pool, user) {
  const params = [];
  let where = "";
  if (user.role === ROLES.ADMIN_UKPD) {
    where = "WHERE lower(nama_ukpd) = lower(?)";
    params.push(user.nama_ukpd);
  } else if (user.role === ROLES.ADMIN_WILAYAH) {
    where = "WHERE lower(wilayah) = lower(?)";
    params.push(user.wilayah);
  } else if (user.role !== ROLES.SUPER_ADMIN) {
    where = "WHERE 1 = 0";
  }
  const [rows] = await pool.query(
    `SELECT id_ukpd, nama_ukpd, jenis_ukpd, wilayah FROM ukpd ${where} ORDER BY nama_ukpd`,
    params
  );
  return rows.map((row) => ({ ...row, template_ukpd: resolvePetaTemplate(row) }));
}

async function getLookupUkpd(pool) {
  const [rows] = await pool.query("SELECT id_ukpd, nama_ukpd, jenis_ukpd, wilayah FROM ukpd ORDER BY nama_ukpd");
  return rows.map((row) => ({ ...row, template_ukpd: resolvePetaTemplate(row) }));
}

async function getTemplateSummary(pool, ukpdOptions) {
  if (!ukpdOptions.length) return [];
  const [positions] = await pool.query(
    `SELECT id, template_ukpd, nama_ukpd_source, kebutuhan_asn, kebutuhan_non_asn
     FROM peta_jabatan
     ORDER BY template_ukpd, urutan, id`
  );
  const unitKeys = ukpdOptions.map((item) => key(item.nama_ukpd));
  const placeholders = unitKeys.map(() => "?").join(",");
  const [overrides] = await pool.query(
    `SELECT peta_jabatan_id, nama_ukpd, kebutuhan_asn, kebutuhan_non_asn
     FROM peta_jabatan_kebutuhan_override
     WHERE lower(nama_ukpd) IN (${placeholders})`,
    unitKeys
  );
  const overrideByUnitPosition = new Map(overrides.map((item) => [
    `${key(item.nama_ukpd)}|${String(item.peta_jabatan_id)}`,
    item
  ]));
  const positionsByTemplate = new Map();
  for (const position of positions) {
    const template = clean(position.template_ukpd).toUpperCase();
    if (!positionsByTemplate.has(template)) positionsByTemplate.set(template, []);
    positionsByTemplate.get(template).push(position);
  }
  const summaryMap = new Map();
  for (const unit of ukpdOptions) {
    const template = clean(unit.template_ukpd).toUpperCase();
    if (!template) continue;
    if (!summaryMap.has(template)) {
      summaryMap.set(template, {
        template_ukpd: template,
        jumlah_jabatan: 0,
        kebutuhan_asn: 0,
        kebutuhan_non_asn: 0
      });
    }
    const summary = summaryMap.get(template);
    const unitKey = key(unit.nama_ukpd);
    for (const position of positionsByTemplate.get(template) || []) {
      if (position.nama_ukpd_source && canonicalUkpd(position.nama_ukpd_source) !== canonicalUkpd(unit.nama_ukpd)) continue;
      const override = overrideByUnitPosition.get(`${unitKey}|${String(position.id)}`);
      summary.jumlah_jabatan += 1;
      summary.kebutuhan_asn += override ? Number(override.kebutuhan_asn) : Number(position.kebutuhan_asn) || 0;
      summary.kebutuhan_non_asn += override ? Number(override.kebutuhan_non_asn) : Number(position.kebutuhan_non_asn) || 0;
    }
  }
  return [...summaryMap.values()].sort((a, b) => a.template_ukpd.localeCompare(b.template_ukpd, "id"));
}

export async function getPetaJabatanLookup({ user, requestedUkpd = "", requestedJabatan = "" }) {
  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);

  const ukpdName = clean(requestedUkpd || (user.role === ROLES.ADMIN_UKPD ? user.nama_ukpd : ""));
  const jabatan = clean(requestedJabatan);
  if (!ukpdName || !jabatan) {
    throw Object.assign(new Error("Nama UKPD dan jabatan wajib diisi."), { status: 422 });
  }

  const ukpdOptions = await getLookupUkpd(pool);
  const ukpd = ukpdOptions.find((item) => key(item.nama_ukpd) === key(ukpdName));
  if (!ukpd) throw Object.assign(new Error("UKPD tidak berada dalam cakupan akses pengguna."), { status: 403 });
  if (!ukpd.template_ukpd) throw Object.assign(new Error("Jenis peta jabatan UKPD belum dikenali."), { status: 404 });

  const [rawPositions] = await pool.query(
    "SELECT * FROM peta_jabatan WHERE template_ukpd = ? ORDER BY urutan, id",
    [ukpd.template_ukpd]
  );
  let positions = rawPositions.filter((position) => (
    !position.nama_ukpd_source || canonicalUkpd(position.nama_ukpd_source) === canonicalUkpd(ukpd.nama_ukpd)
  ));
  if (!positions.length) {
    throw Object.assign(new Error("Peta jabatan UKPD belum tersedia."), { status: 404 });
  }

  const [overrides] = await pool.query(
    `SELECT peta_jabatan_id, kebutuhan_asn, kebutuhan_non_asn
     FROM peta_jabatan_kebutuhan_override
     WHERE lower(nama_ukpd) = lower(?)`,
    [ukpd.nama_ukpd]
  );
  const overrideByPosition = new Map(overrides.map((item) => [String(item.peta_jabatan_id), item]));
  positions = positions.map((position) => {
    const override = overrideByPosition.get(String(position.id));
    return override ? {
      ...position,
      kebutuhan_asn: Number(override.kebutuhan_asn),
      kebutuhan_non_asn: Number(override.kebutuhan_non_asn),
      kebutuhan_override: true
    } : position;
  });

  const ranked = positions
    .map((position) => ({ position, score: jobLookupScore(position, jabatan) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || Number(a.position.urutan) - Number(b.position.urutan));
  const bestScore = ranked[0]?.score;
  const matches = ranked.filter((item) => item.score === bestScore).map((item) => item.position);
  if (!matches.length) {
    throw Object.assign(new Error("Jabatan tidak ditemukan pada peta jabatan UKPD yang dipilih."), { status: 404 });
  }
  const matchIds = new Set(matches.map((position) => String(position.id)));
  const primaryMatch = matches[0];
  const kebutuhanAsn = matches.reduce((total, position) => total + (Number(position.kebutuhan_asn) || 0), 0);
  const kebutuhanNonAsn = matches.reduce((total, position) => total + (Number(position.kebutuhan_non_asn) || 0), 0);

  const [employees] = await pool.query(
    `SELECT p.id_pegawai, p.jenis_pegawai, p.nama_jabatan_orb,
            p.nama_jabatan_menpan, p.struktur_atasan_langsung
     FROM pegawai p
     WHERE upper(coalesce(p.jenis_pegawai, '')) <> 'PJLP'
       AND lower(btrim(coalesce(p.kondisi, ''))) = 'aktif'
       AND lower(btrim(coalesce(p.jenis_kontrak, ''))) <> 'dokter spesialis mitra'
       AND lower(p.nama_ukpd) = lower(?)`,
    [ukpd.nama_ukpd]
  );

  const occupants = { asn: 0, non_asn: 0 };
  for (const employee of employees) {
    let bestPosition = null;
    let bestScore = -1;
    for (const position of positions) {
      const score = positionScore(position, employee);
      if (score > bestScore) {
        bestPosition = position;
        bestScore = score;
      }
    }
    if (!bestPosition || !matchIds.has(String(bestPosition.id)) || bestScore < 0) continue;
    const group = employeeGroup(employee.jenis_pegawai);
    if (group === "ASN") occupants.asn += 1;
    if (group === "NON_ASN") occupants.non_asn += 1;
  }

  return {
    nama_ukpd: ukpd.nama_ukpd,
    template_ukpd: ukpd.template_ukpd,
    requested_jabatan: jabatan,
    position_id: primaryMatch.id,
    position_ids: matches.map((position) => position.id),
    position_count: matches.length,
    nama_jabatan_orb: primaryMatch.nama_jabatan_orb,
    nama_jabatan_menpan: primaryMatch.nama_jabatan_menpan,
    atasan_langsung: matches.length === 1 ? primaryMatch.atasan_langsung : "",
    kebutuhan_asn: kebutuhanAsn,
    bezetting_asn: occupants.asn,
    selisih_asn: occupants.asn - kebutuhanAsn,
    kebutuhan_non_asn: kebutuhanNonAsn,
    bezetting_non_asn: occupants.non_asn,
    selisih_non_asn: occupants.non_asn - kebutuhanNonAsn,
    kebutuhan_override: matches.some((position) => Boolean(position.kebutuhan_override))
  };
}

export async function getPetaJabatanData({ user, requestedUkpd = "", requestedTemplate = "" }) {
  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const ukpdOptions = await getScopedUkpd(pool, user);
  const canFilterUkpd = user.role !== ROLES.ADMIN_UKPD;
  let selectedUkpd = clean(requestedUkpd);
  if (user.role === ROLES.ADMIN_UKPD) selectedUkpd = clean(user.nama_ukpd);
  const ukpd = selectedUkpd
    ? ukpdOptions.find((item) => key(item.nama_ukpd) === key(selectedUkpd))
    : null;
  if (selectedUkpd && !ukpd) throw Object.assign(new Error("UKPD tidak berada dalam cakupan akses pengguna."), { status: 403 });

  const template = ukpd?.template_ukpd || clean(requestedTemplate).toUpperCase();
  const allowedTemplates = new Set(ukpdOptions.map((item) => item.template_ukpd).filter(Boolean));
  if (template && user.role !== ROLES.SUPER_ADMIN && !allowedTemplates.has(template)) {
    throw Object.assign(new Error("Jenis peta tidak berada dalam cakupan akses pengguna."), { status: 403 });
  }

  if (!template) {
    const summary = await getTemplateSummary(pool, ukpdOptions);
    return { mode: "summary", summary, ukpdOptions, canFilterUkpd, templates: [...new Set(summary.map((row) => row.template_ukpd))] };
  }

  const [rawPositions] = await pool.query(
    "SELECT * FROM peta_jabatan WHERE template_ukpd = ? ORDER BY urutan, id",
    [template]
  );
  let positions = ukpd
    ? rawPositions.filter((position) => !position.nama_ukpd_source || canonicalUkpd(position.nama_ukpd_source) === canonicalUkpd(ukpd.nama_ukpd))
    : [];
  if (ukpd && positions.length) {
    const [overrides] = await pool.query(
      `SELECT peta_jabatan_id, kebutuhan_asn, kebutuhan_non_asn
       FROM peta_jabatan_kebutuhan_override
       WHERE lower(nama_ukpd) = lower(?)`,
      [ukpd.nama_ukpd]
    );
    const overrideByPosition = new Map(overrides.map((item) => [String(item.peta_jabatan_id), item]));
    positions = positions.map((position) => {
      const override = overrideByPosition.get(String(position.id));
      return override ? {
        ...position,
        kebutuhan_asn: Number(override.kebutuhan_asn),
        kebutuhan_non_asn: Number(override.kebutuhan_non_asn),
        kebutuhan_override: true
      } : position;
    });
  } else if (!ukpd) {
    const units = ukpdOptions.filter((item) => item.template_ukpd === template);
    const unitKeys = units.map((item) => key(item.nama_ukpd));
    const placeholders = unitKeys.map(() => "?").join(",");
    const [overrides] = unitKeys.length ? await pool.query(
      `SELECT peta_jabatan_id, nama_ukpd, kebutuhan_asn, kebutuhan_non_asn
       FROM peta_jabatan_kebutuhan_override
       WHERE lower(nama_ukpd) IN (${placeholders})`,
      unitKeys
    ) : [[]];
    const overrideByUnitPosition = new Map(overrides.map((item) => [
      `${key(item.nama_ukpd)}|${String(item.peta_jabatan_id)}`,
      item
    ]));
    positions = units.flatMap((unit) => {
      const unitKey = key(unit.nama_ukpd);
      return rawPositions
        .filter((position) => !position.nama_ukpd_source || canonicalUkpd(position.nama_ukpd_source) === canonicalUkpd(unit.nama_ukpd))
        .map((position) => {
          const override = overrideByUnitPosition.get(`${unitKey}|${String(position.id)}`);
          return {
            ...position,
            id: `${unit.id_ukpd}|${position.id}`,
            _unit_key: unitKey,
            kebutuhan_asn: override ? Number(override.kebutuhan_asn) : Number(position.kebutuhan_asn),
            kebutuhan_non_asn: override ? Number(override.kebutuhan_non_asn) : Number(position.kebutuhan_non_asn),
            kebutuhan_override: Boolean(override)
          };
        });
    });
  }
  const pegawaiParams = [];
  const pegawaiWhere = [
    "upper(coalesce(p.jenis_pegawai, '')) <> 'PJLP'",
    "lower(btrim(coalesce(p.kondisi, ''))) = 'aktif'",
    "lower(btrim(coalesce(p.jenis_kontrak, ''))) <> 'dokter spesialis mitra'"
  ];
  if (ukpd) {
    pegawaiWhere.push("lower(p.nama_ukpd) = lower(?)");
    pegawaiParams.push(ukpd.nama_ukpd);
  } else {
    const names = ukpdOptions.filter((item) => item.template_ukpd === template).map((item) => item.nama_ukpd);
    if (!names.length) pegawaiWhere.push("1 = 0");
    else {
      pegawaiWhere.push(`lower(p.nama_ukpd) IN (${names.map(() => "?").join(",")})`);
      pegawaiParams.push(...names.map(key));
    }
  }
  const [employees] = await pool.query(
    `SELECT p.id_pegawai, p.nrk, p.nip, p.nama, p.gelar_depan, p.gelar_belakang,
            p.nama_ukpd, p.jenis_pegawai, p.nama_jabatan_orb, p.nama_jabatan_menpan,
            p.struktur_atasan_langsung
     FROM pegawai p
     WHERE ${pegawaiWhere.join(" AND ")}
     ORDER BY p.nama`,
    pegawaiParams
  );

  const occupantsByPosition = new Map(positions.map((position) => [String(position.id), []]));
  for (const employee of employees) {
    let bestPosition = null;
    let bestScore = -1;
    for (const position of positions) {
      if (position._unit_key && position._unit_key !== key(employee.nama_ukpd)) continue;
      const score = positionScore(position, employee);
      if (score > bestScore) {
        bestPosition = position;
        bestScore = score;
      }
    }
    if (bestPosition && bestScore >= 0) occupantsByPosition.get(String(bestPosition.id))?.push(employee);
  }

  let result = positions.map((position) => {
    const occupants = occupantsByPosition.get(String(position.id)) || [];
    const asn = occupants.filter((employee) => employeeGroup(employee.jenis_pegawai) === "ASN");
    const nonAsn = occupants.filter((employee) => employeeGroup(employee.jenis_pegawai) === "NON_ASN");
    const mapPerson = (employee) => ({
      id_pegawai: employee.id_pegawai,
      nama: fullName(employee),
      nrk: employee.nrk,
      nip: employee.nip,
      jenis_pegawai: employee.jenis_pegawai,
      nama_ukpd: employee.nama_ukpd
    });
    return {
      ...position,
      bezetting_asn: asn.length,
      selisih_asn: asn.length - Number(position.kebutuhan_asn),
      bezetting_non_asn: nonAsn.length,
      selisih_non_asn: nonAsn.length - Number(position.kebutuhan_non_asn),
      pegawai_asn: asn.map(mapPerson),
      pegawai_non_asn: nonAsn.map(mapPerson)
    };
  });
  if (!ukpd) {
    const aggregateMap = new Map();
    for (const position of result) {
      const identity = positionIdentity(position);
      if (!aggregateMap.has(identity)) {
        const aggregate = {
          ...position,
          id: identity,
          nama_ukpd_source: null,
          kebutuhan_asn: 0,
          bezetting_asn: 0,
          selisih_asn: 0,
          kebutuhan_non_asn: 0,
          bezetting_non_asn: 0,
          selisih_non_asn: 0,
          pegawai_asn: [],
          pegawai_non_asn: [],
          kebutuhan_override: false
        };
        delete aggregate._unit_key;
        aggregateMap.set(identity, aggregate);
      }
      const aggregate = aggregateMap.get(identity);
      aggregate.urutan = Math.min(Number(aggregate.urutan) || Number(position.urutan) || 0, Number(position.urutan) || 0);
      aggregate.kebutuhan_asn += Number(position.kebutuhan_asn) || 0;
      aggregate.bezetting_asn += Number(position.bezetting_asn) || 0;
      aggregate.kebutuhan_non_asn += Number(position.kebutuhan_non_asn) || 0;
      aggregate.bezetting_non_asn += Number(position.bezetting_non_asn) || 0;
      aggregate.pegawai_asn.push(...(position.pegawai_asn || []));
      aggregate.pegawai_non_asn.push(...(position.pegawai_non_asn || []));
      aggregate.kebutuhan_override = aggregate.kebutuhan_override || Boolean(position.kebutuhan_override);
    }
    result = [...aggregateMap.values()]
      .map((position) => ({
        ...position,
        selisih_asn: Number(position.bezetting_asn) - Number(position.kebutuhan_asn),
        selisih_non_asn: Number(position.bezetting_non_asn) - Number(position.kebutuhan_non_asn)
      }))
      .sort((a, b) => Number(a.urutan) - Number(b.urutan));
  }
  const matchedIds = new Set(result.flatMap((position) => [...position.pegawai_asn, ...position.pegawai_non_asn]).map((person) => person.id_pegawai));
  const unmatched = employees
    .filter((employee) => !matchedIds.has(employee.id_pegawai) && employeeGroup(employee.jenis_pegawai) !== "PJLP")
    .map((employee) => ({ id_pegawai: employee.id_pegawai, nama: fullName(employee), jenis_pegawai: employee.jenis_pegawai, jabatan: employee.nama_jabatan_menpan || employee.nama_jabatan_orb, atasan: employee.struktur_atasan_langsung, nama_ukpd: employee.nama_ukpd }));
  const canEditKebutuhan = [ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH].includes(user.role);
  return {
    mode: "detail",
    template,
    selectedUkpd: ukpd?.nama_ukpd || "Semua UKPD sejenis",
    canEditKebutuhan,
    canManageStructure: user.role === ROLES.SUPER_ADMIN,
    editable: Boolean(ukpd) && canEditKebutuhan,
    positions: result,
    unmatched,
    ukpdOptions,
    canFilterUkpd,
    templates: [...allowedTemplates]
  };
}

const STRUCTURE_FIELDS = [
  "nama_jabatan_orb", "kelas_jabatan_orb", "nama_jabatan_menpan", "kelas_jabatan_menpan",
  "atasan_langsung", "rumpun_jabatan", "kebutuhan_asn", "kebutuhan_non_asn", "urutan"
];

function structurePayload(input = {}) {
  const result = {};
  for (const field of STRUCTURE_FIELDS) result[field] = field.startsWith("kebutuhan_") || field === "urutan"
    ? Number(input[field] ?? 0)
    : clean(input[field]);
  if (!result.nama_jabatan_orb && !result.nama_jabatan_menpan) {
    throw Object.assign(new Error("Nama jabatan ORB/Pergub atau Menpan wajib diisi."), { status: 422 });
  }
  for (const field of ["kebutuhan_asn", "kebutuhan_non_asn", "urutan"]) {
    if (!Number.isSafeInteger(result[field]) || result[field] < 0) {
      throw Object.assign(new Error(`${field.replaceAll("_", " ")} harus berupa bilangan bulat nol atau lebih.`), { status: 422 });
    }
  }
  return result;
}

function requireSuperAdmin(user) {
  if (user.role !== ROLES.SUPER_ADMIN) {
    throw Object.assign(new Error("Hanya Super Admin yang dapat mengelola struktur jabatan."), { status: 403 });
  }
}

function identityWhere(position) {
  return {
    sql: `template_ukpd = ?
      AND lower(btrim(coalesce(nama_jabatan_orb, ''))) = lower(?)
      AND lower(btrim(coalesce(nama_jabatan_menpan, ''))) = lower(?)
      AND lower(btrim(coalesce(atasan_langsung, ''))) = lower(?)
      AND lower(btrim(coalesce(rumpun_jabatan, ''))) = lower(?)`,
    params: [position.template_ukpd, clean(position.nama_jabatan_orb), clean(position.nama_jabatan_menpan), clean(position.atasan_langsung), clean(position.rumpun_jabatan)]
  };
}

async function templateUkpdNames(connection, template) {
  const [rows] = await connection.query("SELECT nama_ukpd, jenis_ukpd FROM ukpd ORDER BY nama_ukpd");
  return rows.filter((row) => resolvePetaTemplate(row) === template).map((row) => row.nama_ukpd);
}

async function syncEmployeeRumpunForPosition(connection, { ukpdNames, position, values }) {
  const nextRumpun = clean(values.rumpun_jabatan);
  if (!ukpdNames.length || !nextRumpun || key(position.rumpun_jabatan) === key(nextRumpun)) return 0;

  const menpanTitles = [...new Set([position.nama_jabatan_menpan, values.nama_jabatan_menpan].map(clean).filter(Boolean))];
  const orbTitles = [...new Set([position.nama_jabatan_orb, values.nama_jabatan_orb].map(clean).filter(Boolean))];
  const titles = menpanTitles.length ? menpanTitles : orbTitles;
  if (!titles.length) return 0;

  const ukpdSql = ukpdNames.map(() => "?").join(",");
  const titleColumn = menpanTitles.length ? "nama_jabatan_menpan" : "nama_jabatan_orb";
  const [result] = await connection.query(
    `UPDATE pegawai SET status_rumpun = ?, status_rumpun_raw = ?, updated_at = CURRENT_TIMESTAMP
     WHERE nama_ukpd IN (${ukpdSql})
       AND lower(btrim(coalesce(${titleColumn}, ''))) IN (${titles.map(() => "lower(?)").join(",")})`,
    [nextRumpun, nextRumpun, ...ukpdNames, ...titles]
  );
  return Number(result?.affectedRows || result?.rowCount || 0);
}

export async function createPetaJabatanPosition({ user, template, input }) {
  requireSuperAdmin(user);
  const templateName = clean(template).toUpperCase();
  if (!templateName) throw Object.assign(new Error("Jenis UKPD wajib dipilih."), { status: 422 });
  const values = structurePayload(input);
  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const sourceKey = `manual:${templateName}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;
  const [result] = await pool.query(
    `INSERT INTO peta_jabatan
      (source_key, source_sheet, source_row, template_ukpd, nama_ukpd_source,
       nama_jabatan_orb, kelas_jabatan_orb, nama_jabatan_menpan, kelas_jabatan_menpan,
       atasan_langsung, rumpun_jabatan, kebutuhan_asn, kebutuhan_non_asn, urutan, updated_at)
     VALUES (?, 'MANUAL SUPER ADMIN', 0, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [sourceKey, templateName, ...STRUCTURE_FIELDS.map((field) => values[field])]
  );
  const [[created]] = await pool.query("SELECT * FROM peta_jabatan WHERE id = ?", [result.insertId]);
  return { ...created, affected_templates: 1 };
}

export async function updatePetaJabatanPosition({ user, positionId, input }) {
  requireSuperAdmin(user);
  const id = Number(positionId);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error("ID jabatan tidak valid."), { status: 400 });
  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[position]] = await connection.query("SELECT * FROM peta_jabatan WHERE id = ? LIMIT 1", [id]);
    if (!position) throw Object.assign(new Error("Jabatan tidak ditemukan."), { status: 404 });
    const values = structurePayload({
      ...input,
      kebutuhan_asn: position.kebutuhan_asn,
      kebutuhan_non_asn: position.kebutuhan_non_asn
    });
    const identity = identityWhere(position);
    const [matching] = await connection.query(`SELECT id FROM peta_jabatan WHERE ${identity.sql}`, identity.params);
    const ids = matching.map((row) => Number(row.id));
    const placeholders = ids.map(() => "?").join(",");
    await connection.query(
      `UPDATE peta_jabatan SET nama_jabatan_orb = ?, kelas_jabatan_orb = ?, nama_jabatan_menpan = ?,
       kelas_jabatan_menpan = ?, atasan_langsung = ?, rumpun_jabatan = ?, urutan = ?,
       updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
      [
        values.nama_jabatan_orb,
        values.kelas_jabatan_orb,
        values.nama_jabatan_menpan,
        values.kelas_jabatan_menpan,
        values.atasan_langsung,
        values.rumpun_jabatan,
        values.urutan,
        ...ids
      ]
    );
    const oldTitles = jobReferenceAliases(position.nama_jabatan_orb, position.nama_jabatan_menpan);
    const replacementBoss = values.nama_jabatan_orb || values.nama_jabatan_menpan;
    if (oldTitles.length && replacementBoss) {
      await connection.query(
        `UPDATE peta_jabatan SET atasan_langsung = ?, updated_at = CURRENT_TIMESTAMP
         WHERE template_ukpd = ? AND lower(btrim(atasan_langsung)) IN (${oldTitles.map(() => "lower(?)").join(",")})`,
        [replacementBoss, position.template_ukpd, ...oldTitles]
      );
    }
    const ukpdNames = await templateUkpdNames(connection, position.template_ukpd);
    if (ukpdNames.length) {
      const ukpdSql = ukpdNames.map(() => "?").join(",");
      if (clean(position.nama_jabatan_orb) && values.nama_jabatan_orb) await connection.query(
        `UPDATE pegawai SET nama_jabatan_orb = ?, updated_at = CURRENT_TIMESTAMP WHERE nama_ukpd IN (${ukpdSql}) AND lower(btrim(nama_jabatan_orb)) = lower(?)`,
        [values.nama_jabatan_orb, ...ukpdNames, clean(position.nama_jabatan_orb)]
      );
      if (clean(position.nama_jabatan_menpan) && values.nama_jabatan_menpan) await connection.query(
        `UPDATE pegawai SET nama_jabatan_menpan = ?, updated_at = CURRENT_TIMESTAMP WHERE nama_ukpd IN (${ukpdSql}) AND lower(btrim(nama_jabatan_menpan)) = lower(?)`,
        [values.nama_jabatan_menpan, ...ukpdNames, clean(position.nama_jabatan_menpan)]
      );
      if (oldTitles.length && replacementBoss) await connection.query(
        `UPDATE pegawai SET struktur_atasan_langsung = ?, updated_at = CURRENT_TIMESTAMP
         WHERE nama_ukpd IN (${ukpdSql}) AND lower(btrim(struktur_atasan_langsung)) IN (${oldTitles.map(() => "lower(?)").join(",")})`,
        [replacementBoss, ...ukpdNames, ...oldTitles]
      );
    }
    const affectedEmployeesRumpun = await syncEmployeeRumpunForPosition(connection, { ukpdNames, position, values });
    await connection.commit();
    return { id, template_ukpd: position.template_ukpd, affected_positions: ids.length, affected_employees_rumpun: affectedEmployeesRumpun, ...values };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function deletePetaJabatanPosition({ user, positionId }) {
  requireSuperAdmin(user);
  const id = Number(positionId);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error("ID jabatan tidak valid."), { status: 400 });
  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[position]] = await connection.query("SELECT * FROM peta_jabatan WHERE id = ? LIMIT 1", [id]);
    if (!position) throw Object.assign(new Error("Jabatan tidak ditemukan."), { status: 404 });
    const titles = [...new Set([clean(position.nama_jabatan_orb), clean(position.nama_jabatan_menpan)].filter(Boolean))];
    const ids = [id];
    const [children] = titles.length ? await connection.query(
      `SELECT COUNT(*) AS total FROM peta_jabatan WHERE template_ukpd = ? AND id NOT IN (${ids.map(() => "?").join(",")})
       AND lower(btrim(atasan_langsung)) IN (${titles.map(() => "lower(?)").join(",")})`,
      [position.template_ukpd, ...ids, ...titles]
    ) : [[{ total: 0 }]];
    const ukpdNames = await templateUkpdNames(connection, position.template_ukpd);
    const boss = clean(position.atasan_langsung);
    const [usage] = titles.length && ukpdNames.length ? await connection.query(
      `SELECT COUNT(*) AS total FROM pegawai WHERE nama_ukpd IN (${ukpdNames.map(() => "?").join(",")})
       AND (lower(btrim(nama_jabatan_orb)) IN (${titles.map(() => "lower(?)").join(",")})
         OR lower(btrim(nama_jabatan_menpan)) IN (${titles.map(() => "lower(?)").join(",")}))
       ${boss ? "AND lower(btrim(coalesce(struktur_atasan_langsung, ''))) = lower(?)" : ""}`,
      [...ukpdNames, ...titles, ...titles, ...(boss ? [boss] : [])]
    ) : [[{ total: 0 }]];
    if (Number(children[0]?.total) > 0) throw Object.assign(new Error("Jabatan tidak dapat dihapus karena masih menjadi atasan jabatan lain."), { status: 409 });
    if (Number(usage[0]?.total) > 0) throw Object.assign(new Error(`Jabatan tidak dapat dihapus karena masih digunakan oleh ${usage[0].total} pegawai.`), { status: 409 });
    await connection.query(`DELETE FROM peta_jabatan WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    await connection.commit();
    return { id, template_ukpd: position.template_ukpd, deleted_positions: 1, nama_jabatan_orb: position.nama_jabatan_orb, nama_jabatan_menpan: position.nama_jabatan_menpan, atasan_langsung: position.atasan_langsung };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getPetaJabatanMatrixData({ user, requestedTemplate = "" }) {
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH].includes(user.role)) {
    throw Object.assign(new Error("Matriks Jabatan UKPD hanya dapat diakses oleh Super Admin dan Admin Wilayah."), { status: 403 });
  }

  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const scopedUkpd = await getScopedUkpd(pool, user);
  const templateCounts = new Map();
  for (const item of scopedUkpd) {
    if (!item.template_ukpd) continue;
    templateCounts.set(item.template_ukpd, (templateCounts.get(item.template_ukpd) || 0) + 1);
  }
  const templateOptions = [...templateCounts.entries()]
    .map(([template, jumlahUkpd]) => ({ template, jumlah_ukpd: jumlahUkpd }))
    .sort((a, b) => a.template.localeCompare(b.template, "id"));
  const template = clean(requestedTemplate).toUpperCase();
  const scopeLabel = user.role === ROLES.ADMIN_WILAYAH ? clean(user.wilayah) || "Wilayah akun" : "Seluruh UKPD";

  if (!template) {
    return {
      mode: "summary",
      templateOptions,
      summary: await getTemplateSummary(pool, scopedUkpd),
      scopeLabel,
      role: user.role
    };
  }
  if (!templateCounts.has(template)) {
    throw Object.assign(new Error("Jenis UKPD tidak berada dalam cakupan akses pengguna."), { status: 403 });
  }

  const units = scopedUkpd
    .filter((item) => item.template_ukpd === template)
    .sort((a, b) => clean(a.nama_ukpd).localeCompare(clean(b.nama_ukpd), "id"));
  if (!units.length) {
    return { mode: "detail", template, templateOptions, scopeLabel, units: [], rows: [], summaries: [] };
  }

  const [rawPositions] = await pool.query(
    "SELECT * FROM peta_jabatan WHERE template_ukpd = ? ORDER BY urutan, id",
    [template]
  );
  const unitNameKeys = units.map((item) => key(item.nama_ukpd));
  const placeholders = unitNameKeys.map(() => "?").join(",");
  const [overrides] = await pool.query(
    `SELECT peta_jabatan_id, nama_ukpd, kebutuhan_asn, kebutuhan_non_asn
     FROM peta_jabatan_kebutuhan_override
     WHERE lower(nama_ukpd) IN (${placeholders})`,
    unitNameKeys
  );
  const overrideByUnitPosition = new Map(overrides.map((item) => [
    `${key(item.nama_ukpd)}|${String(item.peta_jabatan_id)}`,
    item
  ]));

  const [employees] = await pool.query(
    `SELECT p.id_pegawai, p.nama_ukpd, p.jenis_pegawai, p.nama_jabatan_orb,
            p.nama_jabatan_menpan, p.struktur_atasan_langsung
     FROM pegawai p
     WHERE upper(coalesce(p.jenis_pegawai, '')) <> 'PJLP'
       AND lower(btrim(coalesce(p.kondisi, ''))) = 'aktif'
       AND lower(btrim(coalesce(p.jenis_kontrak, ''))) <> 'dokter spesialis mitra'
       AND lower(p.nama_ukpd) IN (${placeholders})`,
    unitNameKeys
  );
  const employeesByUnit = new Map(unitNameKeys.map((name) => [name, []]));
  for (const employee of employees) employeesByUnit.get(key(employee.nama_ukpd))?.push(employee);

  const rowMap = new Map();
  const summaryMap = new Map([
    ["keseluruhan", { key: "keseluruhan", label: "Keseluruhan", cells: {} }],
    ["fungsional", { key: "fungsional", label: "Jabatan Fungsional", cells: {} }],
    ["pelaksana", { key: "pelaksana", label: "Jabatan Pelaksana / Struktural", cells: {} }]
  ]);

  for (const unit of units) {
    const unitKey = key(unit.nama_ukpd);
    const positions = rawPositions
      .filter((position) => !position.nama_ukpd_source || canonicalUkpd(position.nama_ukpd_source) === canonicalUkpd(unit.nama_ukpd))
      .map((position) => {
        const override = overrideByUnitPosition.get(`${unitKey}|${String(position.id)}`);
        return override ? {
          ...position,
          kebutuhan_asn: Number(override.kebutuhan_asn),
          kebutuhan_non_asn: Number(override.kebutuhan_non_asn)
        } : position;
      });

    const occupants = new Map(positions.map((position) => [String(position.id), { asn: 0, non_asn: 0 }]));
    for (const employee of employeesByUnit.get(unitKey) || []) {
      let bestPosition = null;
      let bestScore = -1;
      for (const position of positions) {
        const score = positionScore(position, employee);
        if (score > bestScore) {
          bestPosition = position;
          bestScore = score;
        }
      }
      if (!bestPosition || bestScore < 0) continue;
      const group = employeeGroup(employee.jenis_pegawai);
      if (group === "ASN") occupants.get(String(bestPosition.id)).asn += 1;
      if (group === "NON_ASN") occupants.get(String(bestPosition.id)).non_asn += 1;
    }

    const unitSummaries = {
      keseluruhan: emptyMatrixMetric(),
      fungsional: emptyMatrixMetric(),
      pelaksana: emptyMatrixMetric()
    };
    for (const position of positions) {
      const occupied = occupants.get(String(position.id)) || { asn: 0, non_asn: 0 };
      const cell = {
        asn: {
          b: occupied.asn,
          k: Number(position.kebutuhan_asn) || 0,
          s: occupied.asn - (Number(position.kebutuhan_asn) || 0)
        },
        non_asn: {
          b: occupied.non_asn,
          k: Number(position.kebutuhan_non_asn) || 0,
          s: occupied.non_asn - (Number(position.kebutuhan_non_asn) || 0)
        }
      };
      const identity = positionIdentity(position);
      if (!rowMap.has(identity)) {
        rowMap.set(identity, {
          id: identity,
          urutan: Number(position.urutan) || 0,
          nama_jabatan_orb: clean(position.nama_jabatan_orb),
          kelas_jabatan_orb: clean(position.kelas_jabatan_orb),
          nama_jabatan_menpan: clean(position.nama_jabatan_menpan),
          kelas_jabatan_menpan: clean(position.kelas_jabatan_menpan),
          atasan_langsung: clean(position.atasan_langsung),
          rumpun_jabatan: clean(position.rumpun_jabatan),
          cells: {}
        });
      }
      const row = rowMap.get(identity);
      row.urutan = Math.min(row.urutan || Number(position.urutan) || 0, Number(position.urutan) || 0);
      if (!row.cells[String(unit.id_ukpd)]) row.cells[String(unit.id_ukpd)] = emptyMatrixMetric();
      addMatrixMetric(row.cells[String(unit.id_ukpd)], cell);

      addMatrixMetric(unitSummaries.keseluruhan, cell);
      const category = key(position.rumpun_jabatan).includes("fungsional") ? "fungsional" : "pelaksana";
      addMatrixMetric(unitSummaries[category], cell);
    }
    for (const [summaryKey, metric] of Object.entries(unitSummaries)) {
      summaryMap.get(summaryKey).cells[String(unit.id_ukpd)] = metric;
    }
  }

  const rows = [...rowMap.values()].sort((a, b) =>
    Number(a.urutan) - Number(b.urutan)
      || a.nama_jabatan_menpan.localeCompare(b.nama_jabatan_menpan, "id")
      || a.atasan_langsung.localeCompare(b.atasan_langsung, "id")
  );
  return {
    mode: "detail",
    template,
    templateOptions,
    scopeLabel,
    units: units.map((item) => ({
      id_ukpd: item.id_ukpd,
      nama_ukpd: item.nama_ukpd,
      jenis_ukpd: item.jenis_ukpd,
      wilayah: item.wilayah
    })),
    summaries: [...summaryMap.values()],
    rows
  };
}

export async function updatePetaJabatanKebutuhan({ user, requestedUkpd, positionId, kebutuhanAsn, kebutuhanNonAsn }) {
  if (![ROLES.SUPER_ADMIN, ROLES.ADMIN_WILAYAH].includes(user.role)) {
    throw Object.assign(new Error("Hanya Super Admin dan Admin Wilayah yang dapat mengubah angka kebutuhan."), { status: 403 });
  }
  const id = Number(positionId);
  const asn = Number(kebutuhanAsn);
  const nonAsn = Number(kebutuhanNonAsn);
  if (!Number.isSafeInteger(id) || id <= 0) throw Object.assign(new Error("ID jabatan tidak valid."), { status: 400 });
  if (!Number.isSafeInteger(asn) || asn < 0 || !Number.isSafeInteger(nonAsn) || nonAsn < 0) {
    throw Object.assign(new Error("Angka kebutuhan harus berupa bilangan bulat nol atau lebih."), { status: 422 });
  }

  const pool = await getConnectedPool();
  await ensurePetaJabatanSchema(pool);
  const ukpdOptions = await getScopedUkpd(pool, user);
  const ukpdName = user.role === ROLES.ADMIN_UKPD ? clean(user.nama_ukpd) : clean(requestedUkpd);
  const ukpd = ukpdOptions.find((item) => key(item.nama_ukpd) === key(ukpdName));
  if (!ukpd) throw Object.assign(new Error("UKPD tidak berada dalam cakupan akses pengguna."), { status: 403 });

  const [[position]] = await pool.query("SELECT * FROM peta_jabatan WHERE id = ? LIMIT 1", [id]);
  const matchesTemplate = position?.template_ukpd === ukpd.template_ukpd;
  const matchesSource = !position?.nama_ukpd_source || canonicalUkpd(position.nama_ukpd_source) === canonicalUkpd(ukpd.nama_ukpd);
  if (!position || !matchesTemplate || !matchesSource) {
    throw Object.assign(new Error("Jabatan tidak ditemukan pada peta UKPD yang dipilih."), { status: 404 });
  }

  await pool.query(
    `INSERT INTO peta_jabatan_kebutuhan_override
       (peta_jabatan_id, nama_ukpd, kebutuhan_asn, kebutuhan_non_asn, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (peta_jabatan_id, nama_ukpd)
     DO UPDATE SET kebutuhan_asn = EXCLUDED.kebutuhan_asn,
                   kebutuhan_non_asn = EXCLUDED.kebutuhan_non_asn,
                   updated_by = EXCLUDED.updated_by,
                   updated_at = CURRENT_TIMESTAMP`,
    [id, ukpd.nama_ukpd, asn, nonAsn, clean(user.username || user.id)]
  );

  return {
    id,
    nama_ukpd: ukpd.nama_ukpd,
    kebutuhan_asn: asn,
    kebutuhan_non_asn: nonAsn,
    selisih_asn: null,
    selisih_non_asn: null
  };
}
