"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Building2, FileImage, FileSpreadsheet, Loader2, Network, Printer, Search } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import ErrorState from "@/components/ui/ErrorState";

function number(value) {
  return new Intl.NumberFormat("id-ID").format(Number(value) || 0);
}

function safeFileName(value) {
  return String(value || "peta-jabatan")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "peta-jabatan";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Metric({ label, value, tone = "slate" }) {
  const colors = { slate: "bg-slate-50 text-slate-800", blue: "bg-blue-50 text-blue-800", amber: "bg-amber-50 text-amber-800" };
  return <span className={`rounded px-2 py-1 text-center text-[11px] font-extrabold ${colors[tone]}`}>{label} {number(value)}</span>;
}

function CompactKpi({ label, children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200",
    blue: "border-blue-200",
    amber: "border-amber-200"
  };
  return (
    <div className={`min-w-0 rounded-lg border bg-white px-3 py-2 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function CompactMetric({ label, value, className = "text-slate-950" }) {
  return <p className={`min-w-0 whitespace-nowrap text-sm font-black leading-tight ${className}`}><span className="mr-1 text-[9px] font-bold text-slate-500">{label}</span>{number(value)}</p>;
}

function textKey(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toUpperCase();
}

function positionTitle(position) {
  return position.nama_jabatan_menpan || position.nama_jabatan_orb || "Jabatan tanpa nama";
}

function metrics(position, group) {
  const b = Number(group === "ASN" ? position.bezetting_asn : position.bezetting_non_asn) || 0;
  const k = Number(group === "ASN" ? position.kebutuhan_asn : position.kebutuhan_non_asn) || 0;
  return { b, k, s: b - k };
}

function descriptorKey(value) {
  const descriptor = String(value || "").match(/\(([^)]+)\)/)?.[1] || "";
  return textKey(descriptor)
    .replace(/SUB\s*KELOMPOK/g, "SUB KELOMPOK")
    .replace(/\bKETUA\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function structuralCore(value) {
  return textKey(value)
    .replace(/^KEPALA\s+(SEKSI|SUBBAGIAN)\s+/, "")
    .replace(/\bKESEHATAN\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function relationshipCore(value) {
  const normalized = textKey(value).replace(/PUSAT KESEHATAN MASYARAKAT/g, "PUSKESMAS");
  const descriptor = normalized.match(/\(([^)]+)\)/)?.[1];
  return textKey(descriptor || normalized)
    .replace(/\bKECAMATAN\b/g, "")
    .replace(/^(ADMINISTRATOR|PENGAWAS|PIMPINAN TINGGI)(\s+(UTAMA|MADYA|MUDA|PERTAMA|PRATAMA))?\s*/g, "")
    .replace(/^(KEPALA|KETUA)\s+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isStructuralPosition(position) {
  return /(PIMPINAN TINGGI|ADMINISTRATOR|PENGAWAS)/.test(textKey(position.rumpun_jabatan));
}

function bossMatchScore(manager, position) {
  const managerTitle = textKey(positionTitle(manager));
  const bossTitle = textKey(position.atasan_langsung);
  if (!managerTitle || !bossTitle || String(manager.id) === String(position.id)) return -1;
  if (managerTitle === bossTitle) return 1000 + managerTitle.length;

  const managerDescriptor = descriptorKey(managerTitle);
  const bossDescriptor = descriptorKey(bossTitle);
  if (managerDescriptor && bossDescriptor && managerDescriptor === bossDescriptor) return 900 + managerDescriptor.length;

  const managerRelationship = relationshipCore(managerTitle);
  const bossRelationship = relationshipCore(bossTitle);
  if (managerRelationship.length >= 5 && managerRelationship === bossRelationship) return 850 + managerRelationship.length;

  const structural = isStructuralPosition(manager);
  if (structural && bossTitle.length >= 8 && managerTitle.startsWith(bossTitle)) return 800 + bossTitle.length;

  const managerCore = structuralCore(managerTitle);
  const bossCore = structuralCore(bossTitle);
  if (managerTitle.startsWith("KEPALA ") && bossTitle.startsWith("KEPALA ") && managerCore.length >= 8 && bossCore.length >= 8
    && (managerCore.includes(bossCore) || bossCore.includes(managerCore))) return 700 + Math.min(managerCore.length, bossCore.length);
  return -1;
}

function buildOrganizationTree(positions) {
  const managers = positions.filter((candidate) => isStructuralPosition(candidate)
    || positions.some((position) => bossMatchScore(candidate, position) >= 0));
  const managerIds = new Set(managers.map((position) => String(position.id)));
  const nodes = new Map(managers.map((position) => [String(position.id), { position, children: [], leaves: [] }]));
  const findParent = (position) => managers
    .map((manager) => ({ manager, score: bossMatchScore(manager, position) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score || String(a.manager.id).localeCompare(String(b.manager.id)))[0]?.manager;

  for (const position of positions) {
    const parent = findParent(position);
    if (!parent) continue;
    const parentNode = nodes.get(String(parent.id));
    if (managerIds.has(String(position.id))) parentNode.children.push(nodes.get(String(position.id)));
    else parentNode.leaves.push(position);
  }

  const roots = managers
    .filter((position) => !findParent(position))
    .map((position) => nodes.get(String(position.id)));

  for (const root of roots) {
    const deputy = root.children.find((child) => textKey(positionTitle(child.position)).startsWith("WAKIL "));
    if (deputy && root.children.length > 1) {
      deputy.children = [...deputy.children, ...root.children.filter((child) => child !== deputy)];
      root.children = [deputy];
    }
  }
  return roots;
}

function PositionTable({ title, positions, group, search, sideConnector = false, connectorWidth = 42 }) {
  const keyword = textKey(search);
  const rows = positions.filter((position) => !keyword || textKey(positionTitle(position)).includes(keyword));
  if (!rows.length) return null;
  return (
    <div className="relative z-10 mt-2 border border-slate-500 bg-white">
      {title && textKey(title) !== "NAMA JABATAN" ? <div className="border-b border-slate-500 bg-white px-1.5 py-1 text-center text-[8px] font-black uppercase">{title}</div> : null}
      <table className="w-full border-collapse text-[8px] leading-tight">
        <thead><tr><th className="relative border-b border-r border-slate-400 px-1 py-1 text-left">Nama Jabatan{sideConnector === "left" ? <span className="pointer-events-none absolute -bottom-px right-full border-t border-slate-800" style={{ width: connectorWidth + 1 }} aria-hidden="true" /> : null}</th>{["KL", "B", "K", "S"].map((item) => <th key={item} className="relative w-7 border-b border-r border-slate-400 px-0.5 py-1 text-center last:border-r-0">{item}{item === "S" && sideConnector === "right" ? <span className="pointer-events-none absolute -bottom-px left-full border-t border-slate-800" style={{ width: connectorWidth + 1 }} aria-hidden="true" /> : null}</th>)}</tr></thead>
        <tbody>{rows.map((position) => {
          const value = metrics(position, group);
          return (
            <tr key={position.id} data-peta-position-id={position.id} className="align-top">
              <td className="border-r border-t border-slate-300 px-1 py-1">
                <span className="font-medium">{positionTitle(position)}</span>
              </td>
              <td className="border-r border-t border-slate-300 px-0.5 py-1 text-center">{position.kelas_jabatan_menpan || position.kelas_jabatan_orb || "-"}</td>
              <td className="border-r border-t border-slate-300 px-0.5 py-1 text-center">{value.b}</td>
              <td className="border-r border-t border-slate-300 px-0.5 py-1 text-center">{value.k}</td>
              <td className={`border-t border-slate-300 px-0.5 py-1 text-center font-bold ${value.s > 0 ? "bg-red-100 text-red-700" : ""}`}>{value.s}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

function hasVisiblePositions(positions, search) {
  const keyword = textKey(search);
  return positions.some((position) => !keyword || textKey(positionTitle(position)).includes(keyword));
}

function OrganizationNode({ node, group, search, depth = 0, visited = new Set() }) {
  if (!node || visited.has(String(node.position.id))) return null;
  const nextVisited = new Set(visited).add(String(node.position.id));
  const value = metrics(node.position, group);
  const functional = node.leaves.filter((position) => textKey(position.rumpun_jabatan).includes("FUNGSIONAL"));
  const executors = node.leaves.filter((position) => !textKey(position.rumpun_jabatan).includes("FUNGSIONAL"));
  const horizontal = depth <= 1;
  return (
    <div className={`relative flex flex-col items-center ${depth >= 2 ? "w-[250px] shrink-0" : "min-w-max"}`}>
      {depth > 0 ? <span className="h-5 border-l border-slate-600" aria-hidden="true" /> : null}
      <section className="relative z-10 w-[240px] bg-white">
        <div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase leading-tight text-slate-950">{positionTitle(node.position)}</div>
        <div className={`border-x border-b border-slate-600 px-2 py-1 text-center text-[8px] font-bold ${value.s > 0 ? "bg-red-100 text-red-700" : "bg-white"}`}>({node.position.kelas_jabatan_menpan || node.position.kelas_jabatan_orb || "-"}-{value.b}-{value.k}-{value.s})</div>
        <PositionTable title="Kelompok Jabatan Fungsional" positions={functional} group={group} search={search} />
        <PositionTable title="Jabatan Pelaksana" positions={executors} group={group} search={search} />
      </section>
      {node.children.length ? (
        <div className={`relative mt-5 ${horizontal ? "flex items-start justify-center gap-5 px-3" : "flex w-full flex-col items-center"}`}>
          <span className="pointer-events-none absolute -top-5 left-1/2 h-5 border-l border-slate-600" aria-hidden="true" />
          {horizontal && node.children.length > 1 ? <span className="pointer-events-none absolute left-[137px] right-[137px] top-0 border-t border-slate-600" aria-hidden="true" /> : null}
          {node.children.map((child) => <OrganizationNode key={child.position.id} node={child} group={group} search={search} depth={depth + 1} visited={nextVisited} />)}
        </div>
      ) : null}
    </div>
  );
}

function PetaApproval() {
  return (
    <div className="mt-10 grid grid-cols-2 gap-20 text-center text-[10px] leading-tight">
      <div><p>Menyetujui,</p><p>Kepala Biro Organisasi dan Reformasi Birokrasi</p><p>Setda Provinsi DKI Jakarta</p><p className="mt-16">Nama: ........................................</p><p>NIP: ........................................</p></div>
      <div><p>Jakarta, ........................................</p><p>Kepala Dinas Kesehatan</p><p>Provinsi DKI Jakarta</p><p className="mt-16">Nama: ........................................</p><p>NIP: ........................................</p></div>
    </div>
  );
}

function DinkesChart({ positions, group, search }) {
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const at = (order) => ordered.find((position) => Number(position.urutan) === order);
  const columns = [[5, 8, 18, 25, 31], [34, 36, 45, 50], [55, 59, 64, 71], [78, 83, 93, 100], [109, 111, 118, 124], [131, 134, 141, 147]];
  const managers = columns.flat().sort((a, b) => a - b);
  const leaves = (order) => {
    const next = managers.find((candidate) => candidate > order);
    return ordered.filter((position) => Number(position.urutan) > order && (!next || Number(position.urutan) < next));
  };
  const display = (order) => {
    const position = at(order);
    if (!position) return null;
    const names = {
      5: "Sekretaris Dinas",
      45: "Kepala Seksi Prasarana dan Sarana Kesehatan",
      147: "Analis Sumber Daya Manusia Aparatur Ahli Muda (Ketua Subkelompok Kepegawaian)",
    };
    return names[order] ? { ...position, nama_jabatan_menpan: names[order] } : position;
  };
  if (!at(3)) return null;
  return (
    <div className="peta-reference-chart w-[1920px] shrink-0">
      <div className="mx-auto flex w-[340px] flex-col items-center">
        {[3, 4].map((order, index) => <div key={order} className="flex w-full flex-col items-center">{index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}<RsudPositionCard position={at(order)} group={group} search={search} showSelisih={false} /></div>)}
        <span className="h-5 border-l border-slate-800" aria-hidden="true" />
      </div>
      <div className="relative grid grid-cols-6 gap-x-6">
        <span className="pointer-events-none absolute left-[150px] right-[150px] top-0 border-t border-slate-800" aria-hidden="true" />
        {columns.map(([head]) => <div key={head} className="relative min-w-0 pt-5"><span className="absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" /><span className="absolute bottom-0 left-0 top-5 border-l border-slate-800" aria-hidden="true" /><RsudPositionCard position={display(head)} group={group} search={search} showSelisih={false} /><div className="pl-5"><PositionTable title="Kelompok Jabatan Fungsional" positions={leaves(head)} group={group} search={search} /></div></div>)}
        {[1, 2, 3, 4].map((level) => columns.map((column) => {
          const order = column[level];
          if (!order) return <div key={`${column[0]}-${level}`} />;
          const last = level === column.length - 1;
          return <div key={order} className="relative overflow-hidden pl-5 pt-4">{!last ? <span className="absolute bottom-0 left-0 top-0 border-l border-slate-800" aria-hidden="true" /> : null}<RsudPositionCard position={display(order)} positions={leaves(order)} group={group} search={search} connector="left" connectorWidth={20} drawConnectorTrunk={last} showSelisih={false} /></div>;
        }))}
      </div>
      <PetaApproval />
    </div>
  );
}

function SudinkesChildrenRow({ children, group, search, visited, continueCenter = false }) {
  if (!children.length) return null;
  return (
    <div className="relative flex items-start justify-center gap-5">
      {children.length > 1 ? <span className="pointer-events-none absolute left-[125px] right-[125px] top-0 border-t border-slate-800" aria-hidden="true" /> : null}
      {continueCenter ? <span className="pointer-events-none absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" /> : null}
      {children.map((child) => (
        <div key={child.position.id} className="relative w-[250px] shrink-0 pt-5">
          <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
          <OrganizationNode node={child} group={group} search={search} depth={0} visited={visited} />
        </div>
      ))}
    </div>
  );
}

function SudinkesReferenceChart({ positions, group, search, template = "SUKU DINAS KOTA" }) {
  const isSeribu = template === "SUKU DINAS SERIBU";
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const at = (order) => ordered.find((position) => Number(position.urutan) === order);
  const range = (from, to) => ordered.filter((position) => Number(position.urutan) >= from && Number(position.urutan) <= to);
  const head = at(isSeribu ? 222 : 8);
  if (!head) return null;
  const branches = isSeribu
    ? [[226, 227, 237], [238, 239, 247], [248, 249, 259], [260, 261, 266]]
    : [[13, 14, 22], [23, 24, 33], [34, 35, 50], [51, 52, 57]];
  const branchPosition = (order) => order === 260 && at(order)
    ? { ...at(order), nama_jabatan_menpan: "Kepala Seksi Pelayanan dan Sumber Daya Kesehatan" }
    : at(order);
  const branch = (order, from, to) => (
    <div key={order} className="relative min-w-0 pt-5">
      <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
      <RsudPositionCard position={branchPosition(order)} positions={range(from, to)} group={group} search={search} showSelisih={false} titleClassName="flex min-h-[32px] items-center justify-center" />
    </div>
  );
  return (
    <div className="peta-reference-chart w-[1290px] shrink-0">
      <div className="mx-auto flex w-[340px] flex-col items-center">
        {[["Kepala Dinas", "15-1-1"], ["Wakil Kepala Dinas", "14-1-1"]].map(([title, detail], index) => (
          <div key={title} className="flex w-full flex-col items-center">
            {index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}
            <section className="w-full"><div className="border border-slate-600 px-2 py-1.5 text-center text-[8px] uppercase">{title}</div><div className="border-x border-b border-slate-600 px-2 py-1 text-center text-[8px]">({detail})</div></section>
          </div>
        ))}
        <span className="h-4 border-l border-slate-800" aria-hidden="true" />
        <RsudPositionCard position={head} group={group} search={search} showSelisih={false} />
      </div>
      <div className="relative pb-5">
        <span className="pointer-events-none absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" />
        <div className="ml-[687px] w-[300px] pt-4"><PositionTable title="Kelompok Jabatan Fungsional" positions={isSeribu ? range(223, 225) : range(9, 12)} group={group} search={search} sideConnector="left" connectorWidth={42} /></div>
      </div>
      <div className="relative grid grid-cols-4 items-start gap-[30px]">
        <span className="pointer-events-none absolute left-[150px] right-[150px] top-0 border-t border-slate-800" aria-hidden="true" />
        {!isSeribu ? <span className="pointer-events-none absolute -bottom-5 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" /> : null}
        {branches.map(([order, from, to]) => branch(order, from, to))}
      </div>
      {!isSeribu ? <div className="relative mx-auto mt-5 grid w-[630px] grid-cols-2 items-start gap-[30px]">
        <span className="pointer-events-none absolute left-[150px] right-[150px] top-0 border-t border-slate-800" aria-hidden="true" />
        {branch(58, 59, 63)}
        {branch(64, 65, 73)}
      </div> : null}
      <PetaApproval />
    </div>
  );
}

function SudinkesTree({ root, group, search, template }) {
  if (!root) return null;
  const isSeribu = template === "SUKU DINAS SERIBU";
  const priority = isSeribu
    ? ["TATA USAHA", "KESEHATAN MASYARAKAT", "PENCEGAHAN DAN PENGENDALIAN", "PELAYANAN DAN SUMBER DAYA KESEHATAN"]
    : ["TATA USAHA", "KESEHATAN MASYARAKAT", "PELAYANAN KESEHATAN", "PENCEGAHAN DAN PENGENDALIAN", "SUMBER DAYA KESEHATAN", "SUMBER DAYA MANUSIA"];
  const children = [...root.children].sort((a, b) => {
    const titleA = textKey(positionTitle(a.position));
    const titleB = textKey(positionTitle(b.position));
    const rank = (title) => {
      const index = priority.findIndex((item) => title.includes(item));
      return index < 0 ? priority.length : index;
    };
    return rank(titleA) - rank(titleB);
  });
  const firstRow = children.slice(0, 4);
  const secondRow = isSeribu ? [] : children.slice(4);
  const value = metrics(root.position, group);
  const functional = root.leaves.filter((position) => textKey(position.rumpun_jabatan).includes("FUNGSIONAL"));
  const executors = root.leaves.filter((position) => !textKey(position.rumpun_jabatan).includes("FUNGSIONAL"));
  const functionalVisible = hasVisiblePositions(functional, search);
  const executorsVisible = hasVisiblePositions(executors, search);
  const visited = new Set([String(root.position.id)]);
  return (
    <div className="flex min-w-[1060px] flex-col items-center">
      {["Kepala Dinas", "Wakil Kepala Dinas"].map((title, index) => <div key={title} className="flex flex-col items-center">{index > 0 ? <span className="h-4 border-l border-slate-600" aria-hidden="true" /> : null}<div className="w-[380px] border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase">{title}</div></div>)}
      <span className="h-4 border-l border-slate-600" aria-hidden="true" />
      <section className="w-[380px]">
        <div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase leading-tight text-slate-950">{positionTitle(root.position)}</div>
        <div className={`border-x border-b border-slate-600 px-2 py-1 text-center text-[8px] font-bold ${value.s > 0 ? "bg-red-100 text-red-700" : "bg-white"}`}>({root.position.kelas_jabatan_menpan || root.position.kelas_jabatan_orb || "-"}-{value.b}-{value.k}-{value.s})</div>
      </section>
      <div className="relative w-[1060px] pb-5">
        <span className="absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" />
        {functional.length || executors.length ? <div className="relative ml-[572px] w-[300px] pt-4">
          <PositionTable title="Kelompok Jabatan Fungsional" positions={functional} group={group} search={search} sideConnector={functionalVisible ? "left" : false} />
          <PositionTable title="Jabatan Pelaksana" positions={executors} group={group} search={search} sideConnector={!functionalVisible && executorsVisible ? "left" : false} />
        </div> : <div className="h-10" />}
      </div>
      <SudinkesChildrenRow children={firstRow} group={group} search={search} visited={visited} continueCenter={Boolean(secondRow.length)} />
      {secondRow.length ? <><span className="h-5 border-l border-slate-800" aria-hidden="true" /><SudinkesChildrenRow children={secondRow} group={group} search={search} visited={visited} /></> : null}
    </div>
  );
}

function RsudPositionCard({ position, positions = [], group, search, connector = "", connectorWidth = 100, titleClassName = "", drawConnectorTrunk = false, showSelisih = true }) {
  if (!position) return null;
  const value = metrics(position, group);
  return (
    <section data-peta-position-id={position.id} className="relative z-10 w-full bg-white">
      <div className={`relative border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase leading-tight text-slate-950 ${titleClassName}`}>
        {positionTitle(position)}
        {connector ? <span className={`pointer-events-none absolute -bottom-px border-t border-slate-800 ${connector === "right" ? "left-full" : "right-full"}`} style={{ width: connectorWidth + 1 }} aria-hidden="true" /> : null}
        {connector === "left" && drawConnectorTrunk ? <span className="pointer-events-none absolute bottom-[-1px] h-[2000px] border-l border-slate-800" style={{ left: -connectorWidth }} aria-hidden="true" /> : null}
      </div>
      <div className={`border-x border-b border-slate-600 px-2 py-1 text-center text-[8px] font-bold ${value.s > 0 ? "bg-red-100 text-red-700" : "bg-white"}`}>({position.kelas_jabatan_menpan || position.kelas_jabatan_orb || "-"}-{value.b}-{value.k}{showSelisih ? `-${value.s}` : ""})</div>
      <PositionTable title="Nama Jabatan" positions={positions} group={group} search={search} />
    </section>
  );
}

function RsudCommandStack({ groups, group, search, bridgeTop = 0, showSelisih = true }) {
  if (!groups.length) return null;
  return (
    <div className="relative ml-4">
      {bridgeTop > 0 ? <span className="pointer-events-none absolute left-0 top-0 border-l border-slate-800" style={{ height: bridgeTop, transform: `translateY(-${bridgeTop}px)` }} aria-hidden="true" /> : null}
      <div className="relative space-y-4 overflow-hidden pl-5">
        {groups.map((item, index) => <RsudPositionCard key={item.position?.id || item.key} position={item.position} positions={item.positions} group={group} search={search} connector="left" connectorWidth={20} drawConnectorTrunk={index === groups.length - 1} showSelisih={showSelisih} />)}
      </div>
    </div>
  );
}

function RsudCChart({ root, positions, group, search }) {
  if (!root) return null;
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const at = (order) => ordered.find((position) => Number(position.urutan) === order);
  const range = (from, to) => ordered.filter((position) => Number(position.urutan) >= from && Number(position.urutan) <= to);
  const combine = (...groups) => groups.flat().sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const split = (items) => {
    const middle = Math.ceil(items.length / 2);
    return [items.slice(0, middle), items.slice(middle)];
  };
  const directorFunctional = range(7, 10);
  const medicalFunctional = combine(range(35, 55), range(102, 107), range(156, 158));
  const supportFunctional = combine(range(66, 101), range(108, 155), range(159, 161));
  const [supportLeft, supportRight] = split(supportFunctional);
  const directorValue = metrics(root.position, group);
  const branchColumns = [
    {
      key: "administrasi",
      className: "w-[300px]",
      content: <div className="space-y-4"><RsudPositionCard showSelisih={false} titleClassName="flex min-h-[32px] items-center justify-center" position={at(14)} positions={range(15, 17)} group={group} search={search} /><RsudCommandStack showSelisih={false} groups={[[18, 19, 21], [22, 23, 26], [27, 28, 33]].map(([head, from, to]) => ({ key: head, position: at(head), positions: range(from, to) }))} group={group} search={search} bridgeTop={16} /></div>
    },
    {
      key: "medik",
      className: "w-[350px]",
      content: <div><RsudPositionCard showSelisih={false} position={at(34)} group={group} search={search} titleClassName="flex min-h-[32px] items-center justify-center" /><PositionTable title="Kelompok Jabatan Fungsional" positions={medicalFunctional} group={group} search={search} /><div className="mt-4"><RsudCommandStack showSelisih={false} groups={[[56, 57, 58], [59, 60, 61], [62, 63, 64]].map(([head, from, to]) => ({ key: head, position: at(head), positions: range(from, to) }))} group={group} search={search} bridgeTop={16} /></div></div>
    },
    {
      key: "penunjang",
      className: "w-[940px]",
      content: <div><RsudPositionCard showSelisih={false} position={at(65)} group={group} search={search} titleClassName="flex min-h-[32px] items-center justify-center" /><div className="mt-3 grid grid-cols-[300px_300px_300px] items-start gap-5"><PositionTable title="Kelompok Jabatan Fungsional" positions={supportLeft} group={group} search={search} /><PositionTable title="Kelompok Jabatan Fungsional" positions={supportRight} group={group} search={search} /><RsudCommandStack showSelisih={false} groups={[[162, 163, 165], [166, 167, 169], [170, 171, 173]].map(([head, from, to]) => ({ key: head, position: at(head), positions: range(from, to) }))} group={group} search={search} bridgeTop={12} /></div></div>
    }
  ];
  return (
    <div className="peta-reference-chart flex w-[1650px] shrink-0 flex-col items-center">
      {[["Kepala Dinas", "15-1-1"], ["Wakil Kepala Dinas", "14-0-1"]].map(([title, detail], index) => <div key={title} className="flex flex-col items-center">{index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}<section className="w-[380px]"><div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase text-slate-950">{title}</div><div className="border-x border-b border-slate-600 bg-white px-2 py-1 text-center text-[8px] font-bold">({detail})</div></section></div>)}
      <span className="h-4 border-l border-slate-800" aria-hidden="true" />
      <section data-peta-position-id={root.position.id} className="w-[380px]"><div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase">{positionTitle(root.position)}</div><div className={`border-x border-b border-slate-600 px-2 py-1 text-center text-[8px] font-bold ${directorValue.s > 0 ? "bg-red-100 text-red-700" : "bg-white"}`}>({root.position.kelas_jabatan_menpan || root.position.kelas_jabatan_orb || "-"}-{directorValue.b}-{directorValue.k})</div></section>
      <div className="relative grid w-[1240px] grid-cols-[420px_400px_420px] items-start pb-6 pt-5">
        <span className="absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" />
        <PositionTable title="Kelompok Jabatan Fungsional" positions={directorFunctional} group={group} search={search} sideConnector="right" connectorWidth={200} />
        <div />
        <RsudPositionCard showSelisih={false} position={at(11)} positions={range(12, 13)} group={group} search={search} connector="left" connectorWidth={200} />
      </div>
      <div className="relative flex w-[1650px] items-start gap-[30px]">
        <span className="pointer-events-none absolute left-[150px] right-[470px] top-0 border-t border-slate-800" aria-hidden="true" />
        {branchColumns.map((branch) => <div key={branch.key} className={`relative shrink-0 pt-5 ${branch.className}`}><span className="absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />{branch.content}</div>)}
      </div>
      <div className="w-full"><PetaApproval /></div>
    </div>
  );
}

function RsudDChart({ root, positions, group, search }) {
  if (!root) return null;
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const at = (order) => ordered.find((position) => Number(position.urutan) === order);
  const range = (from, to) => ordered.filter((position) => Number(position.urutan) >= from && Number(position.urutan) <= to);
  const split = (items) => { const middle = Math.ceil(items.length / 2); return [items.slice(0, middle), items.slice(middle)]; };
  const supportFunctional = range(70, 148);
  const [supportLeft, supportRight] = split(supportFunctional);
  const branches = [
    { key: "tata-usaha", content: <><RsudPositionCard position={at(27)} positions={range(28, 30)} group={group} search={search} showSelisih={false} /><div className="mt-4"><RsudCommandStack groups={[{ key: 31, position: at(31), positions: range(32, 39) }, { key: 9, position: at(9), positions: range(40, 43) }]} group={group} search={search} bridgeTop={16} showSelisih={false} /></div></> },
    { key: "medik", content: <><RsudPositionCard position={at(44)} group={group} search={search} showSelisih={false} /><PositionTable title="Kelompok Jabatan Fungsional" positions={range(45, 60)} group={group} search={search} /><div className="mt-4"><RsudCommandStack groups={[{ key: 10, position: at(10), positions: range(61, 62) }, { key: 63, position: at(63), positions: range(64, 65) }, { key: 66, position: at(66), positions: range(67, 68) }]} group={group} search={search} bridgeTop={16} showSelisih={false} /></div></> },
    { key: "penunjang", content: <><div className="mx-auto w-[300px]"><RsudPositionCard position={at(69)} group={group} search={search} showSelisih={false} /></div><div className="grid grid-cols-2 items-start gap-5"><PositionTable title="Kelompok Jabatan Fungsional" positions={supportLeft} group={group} search={search} /><div><PositionTable title="Kelompok Jabatan Fungsional" positions={supportRight} group={group} search={search} /><div className="mt-4"><RsudCommandStack groups={[{ key: 149, position: at(149), positions: range(150, 152) }, { key: 11, position: at(11), positions: range(153, 155) }]} group={group} search={search} bridgeTop={16} showSelisih={false} /></div></div></div></> }
  ];
  return (
    <div className="rsud-d-chart peta-reference-chart w-[1610px] shrink-0">
      <div className="ml-[660px] flex w-[300px] flex-col items-center">
        {[["Kepala Dinas", "15-1-1"], ["Wakil Kepala Dinas", "14-1-1"]].map(([title, detail], index) => <div key={title} className="flex w-full flex-col items-center">{index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}<section className="w-full"><div className="border border-slate-600 px-2 py-1.5 text-center text-[8px] font-bold uppercase">{title}</div><div className="border-x border-b border-slate-600 px-2 py-1 text-center text-[8px]">({detail})</div></section></div>)}
        <span className="h-4 border-l border-slate-800" aria-hidden="true" />
        <RsudPositionCard position={root.position} group={group} search={search} showSelisih={false} />
      </div>
      <div className="relative grid grid-cols-[300px_300px_300px_620px] items-start gap-[30px] pt-5">
        <span className="pointer-events-none absolute left-[810px] top-0 h-[120px] border-l border-slate-800" aria-hidden="true" />
        <PositionTable title="Kelompok Jabatan Fungsional" positions={range(12, 24)} group={group} search={search} sideConnector="right" connectorWidth={510} />
        <div className="relative col-span-3 pt-[100px]">
          <div className="absolute right-0 top-0 w-[300px]"><RsudPositionCard position={at(8) ? { ...at(8), nama_jabatan_menpan: "Kepala Satuan Pengawas Internal" } : null} positions={range(25, 26)} group={group} search={search} connector="left" connectorWidth={500} showSelisih={false} /></div>
          <div className="relative grid grid-cols-[300px_300px_620px] items-start gap-[30px]">
            <span className="pointer-events-none absolute left-[150px] right-[310px] top-0 border-t border-slate-800" aria-hidden="true" />
            {branches.map((branch) => <div key={branch.key} className="relative min-w-0 pt-5"><span className="absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />{branch.content}</div>)}
          </div>
        </div>
      </div>
      <PetaApproval />
    </div>
  );
}

function isRsudCoordinator(position) {
  return /^(?:KOORD\w*|KETUA)\b/.test(textKey(positionTitle(position)))
    || textKey(position.rumpun_jabatan).includes("PELAKSANA SATUAN");
}

function rsudChildren(position, positions) {
  if (!position) return [];
  return positions
    .filter((candidate) => bossMatchScore(position, candidate) >= 0)
    .sort((a, b) => Number(a.urutan) - Number(b.urutan) || String(a.id).localeCompare(String(b.id)));
}

function RsudCoordinatorRow({ groups, group, search }) {
  if (!groups.length) return null;
  const edge = `calc(${50 / groups.length}% - ${10 * (groups.length - 1) / groups.length}px)`;
  return (
    <div className="relative grid gap-5" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
      {groups.length > 1 ? <span className="pointer-events-none absolute top-0 border-t border-slate-800" style={{ left: edge, right: edge }} aria-hidden="true" /> : null}
      {groups.map((item) => <div key={item.position.id} className="relative min-w-0 pt-5"><span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" /><RsudPositionCard showSelisih={false} position={item.position} positions={item.positions} group={group} search={search} /></div>)}
    </div>
  );
}

function RsudCoordinatorGrid({ groups, group, search, columns = 4 }) {
  if (!groups.length) return null;
  const rows = [];
  for (let index = 0; index < groups.length; index += columns) rows.push(groups.slice(index, index + columns));
  return (
    <div className="relative mt-5">
      {rows.map((row, index) => (
        <div key={row.map((item) => item.position.id).join("-")} className={`relative w-full ${index < rows.length - 1 ? "pb-5" : ""}`}>
          {index < rows.length - 1 ? <span className="pointer-events-none absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" /> : null}
          <div className="relative z-10 w-full"><RsudCoordinatorRow groups={row} group={group} search={search} /></div>
        </div>
      ))}
    </div>
  );
}

function createHospitalPrintPages(area, content) {
  const origin = content.getBoundingClientRect();
  const height = content.scrollHeight;
  const intervals = [];
  for (const element of content.querySelectorAll("tr, section")) {
    const rect = element.getBoundingClientRect();
    if (rect.height) intervals.push([rect.top - origin.top, rect.bottom - origin.top]);
  }
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.height) intervals.push([rect.top - origin.top, rect.bottom - origin.top]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  // Cut in whitespace, never through a job label, even when adjacent tables differ in height.
  const gaps = merged.slice(1).map((interval, index) => (merged[index][1] + interval[0]) / 2);
  const cut = gaps.sort((a, b) => Math.abs(a - height / 2) - Math.abs(b - height / 2))[0] || height / 2;
  const scale = Math.min(1, 1050 / content.scrollWidth, 718 / Math.max(cut, height - cut));
  const sheets = document.createElement("div");
  sheets.className = "peta-print-sheets";
  sheets.setAttribute("aria-hidden", "true");
  for (const offset of [0, cut]) {
    const sheet = document.createElement("div");
    sheet.className = "peta-print-sheet";
    sheet.style.height = `${(offset ? height - cut : cut) * scale}px`;
    const clone = content.cloneNode(true);
    clone.classList.remove("peta-print-content");
    clone.removeAttribute("data-peta-export-root");
    clone.style.transform = `translateX(-50%) translateY(${-offset * scale}px) scale(${scale})`;
    sheet.appendChild(clone);
    sheets.appendChild(sheet);
  }
  area.appendChild(sheets);
  return () => sheets.remove();
}

function RsudABDepartment({ position, positions, segment, group, search, template, wide = false, coordinatorsOnly = false }) {
  if (!position) return null;
  const scope = segment || rsudChildren(position, positions);
  const coordinatorIndexes = scope.map((item, index) => ({ item, index })).filter(({ item }) => isRsudCoordinator(item)).map(({ index }) => index);
  const leaves = scope.slice(0, coordinatorIndexes[0] ?? scope.length);
  const functional = leaves.filter((item) => textKey(item.rumpun_jabatan).includes("FUNGSIONAL"));
  const executors = leaves.filter((item) => !textKey(item.rumpun_jabatan).includes("FUNGSIONAL"));
  const coordinatorGroups = coordinatorIndexes.map((index, groupIndex) => ({ position: scope[index], positions: scope.slice(index + 1, coordinatorIndexes[groupIndex + 1] ?? scope.length) }));
  if (wide && template === "RSKD") {
    const priority = ["K3KL", "FARMASI", "REKAM MEDIS", "LABORATORIUM", "PENUNJANG KHUSUS", "PENUNJANG TERAPI", "GIZI", "RADIOLOGI"];
    const rank = (item) => {
      const index = priority.findIndex((title) => textKey(positionTitle(item.position)).includes(title));
      return index < 0 ? priority.length : index;
    };
    coordinatorGroups.sort((a, b) => rank(a) - rank(b));
  }
  if (coordinatorsOnly) return <RsudCoordinatorGrid groups={coordinatorGroups} group={group} search={search} />;
  return (
    <div className="w-full">
      <div className="w-full">
        <div className="w-full"><RsudPositionCard showSelisih={false} position={position} group={group} search={search} titleClassName="flex min-h-[42px] items-center justify-center" /></div>
        <div data-peta-functional-column="true" className="w-full"><PositionTable title="Kelompok Jabatan Fungsional" positions={functional} group={group} search={search} /></div>
        <PositionTable title="Jabatan Pelaksana" positions={executors} group={group} search={search} />
      </div>
      {!wide ? <div className="mt-4"><RsudCommandStack showSelisih={false} groups={coordinatorGroups} group={group} search={search} bridgeTop={16} /></div> : null}
    </div>
  );
}

function RsudABLeadershipGroup({ position, heads, group, search }) {
  if (!position) return null;
  const widths = heads.map(() => 300);
  const gap = 20;
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, heads.length - 1) * gap;
  const firstCenter = (widths[0] || 380) / 2;
  const lastCenter = (widths[widths.length - 1] || 380) / 2;
  return (
    <div className="flex flex-col items-center" style={{ width: totalWidth || 380 }}>
      <div className="w-[380px]"><RsudPositionCard showSelisih={false} position={position} group={group} search={search} titleClassName="flex min-h-[42px] items-center justify-center" /></div>
      {heads.length ? <><span className="h-5 border-l border-slate-800" aria-hidden="true" /><div className="relative w-full"><span className="pointer-events-none absolute top-0 border-t border-slate-800" style={{ left: firstCenter, right: lastCenter }} aria-hidden="true" /></div></> : null}
    </div>
  );
}

function RsudABChart({ root, positions, group, search, template }) {
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan) || String(a.id).localeCompare(String(b.id)));
  const director = ordered.find((position) => textKey(positionTitle(position)).startsWith("DIREKTUR ")) || root?.position || ordered[0];
  if (!director) return null;
  const directorChildren = rsudChildren(director, ordered);
  const wadirAdmin = directorChildren.find((position) => textKey(positionTitle(position)).startsWith("WAKIL DIREKTUR") && !textKey(positionTitle(position)).includes("PELAYANAN"));
  const wadirService = directorChildren.find((position) => textKey(positionTitle(position)).startsWith("WAKIL DIREKTUR") && textKey(positionTitle(position)).includes("PELAYANAN"));
  const spi = directorChildren.find((position) => textKey(positionTitle(position)).includes("PENGAWAS INTERNAL"));
  const directorFunctional = ordered.filter((position) => /^(?:DOKTER AHLI UTAMA|DOKTER GIGI AHLI UTAMA|APOTEKER (?:AHLI )?UTAMA)$/.test(textKey(positionTitle(position))));
  const adminPriority = (position) => {
    const title = textKey(positionTitle(position));
    if (title.includes("UMUM")) return 0;
    if (title.includes("KEUANGAN")) return 1;
    if (title.includes("SUMBER DAYA MANUSIA")) return 2;
    if (title.includes("DATA DAN TEKNOLOGI")) return 3;
    return 9;
  };
  const adminHeads = ordered.filter((position) => textKey(positionTitle(position)).startsWith("KEPALA BAGIAN ")).sort((a, b) => adminPriority(a) - adminPriority(b) || Number(a.urutan) - Number(b.urutan));
  const serviceHeads = ordered.filter((position) => textKey(positionTitle(position)).startsWith("KEPALA BIDANG "));
  const allHeads = [...adminHeads, ...serviceHeads].sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const boundaries = [...allHeads, wadirService].filter(Boolean).sort((a, b) => Number(a.urutan) - Number(b.urutan));
  const excludedIds = new Set(directorFunctional.map((position) => String(position.id)));
  const segments = new Map(allHeads.map((head) => {
    const next = boundaries.find((candidate) => Number(candidate.urutan) > Number(head.urutan));
    const items = ordered.filter((position) => Number(position.urutan) > Number(head.urutan)
      && (!next || Number(position.urutan) < Number(next.urutan))
      && !excludedIds.has(String(position.id)));
    return [String(head.id), items];
  }));
  const firstHead = allHeads[0];
  const spiPositions = spi ? ordered.filter((position) => Number(position.urutan) > Number(spi.urutan)
    && (!firstHead || Number(position.urutan) < Number(firstHead.urutan))) : [];
  const adminWidth = adminHeads.length * 300 + Math.max(0, adminHeads.length - 1) * 20;
  const serviceWidths = serviceHeads.map(() => 300);
  const serviceWidth = serviceWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, serviceHeads.length - 1) * 20;
  const columnWidths = [adminWidth || 380, serviceWidth || 380];
  const gap = 20;
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap;
  const spiLeft = Math.max(0, columnWidths[0] / 2 - 140);
  const spiConnectorWidth = totalWidth / 2 - spiLeft - 280;
  const directorValue = metrics(director, group);
  const displayHeads = [...adminHeads, ...serviceHeads];
  const supportHead = serviceHeads[serviceHeads.length - 1];
  const coordinatorColumn = displayHeads.length - 4;
  return (
    <div className="peta-reference-chart flex shrink-0 flex-col items-center" style={{ width: totalWidth }}>
      {[["Kepala Dinas", "15-1-1"], ["Wakil Kepala Dinas", "14-1-1"]].map(([title, detail], index) => <div key={title} className="flex flex-col items-center">{index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}<section className="w-[380px]"><div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase text-slate-950">{title}</div><div className="border-x border-b border-slate-600 bg-white px-2 py-1 text-center text-[8px] font-bold">({detail})</div></section></div>)}
      <span className="h-4 border-l border-slate-800" aria-hidden="true" />
      <section data-peta-position-id={director.id} className="w-[380px]"><div className="border border-slate-600 bg-[#b8cee3] px-2 py-1.5 text-center text-[8px] font-black uppercase text-slate-950">{positionTitle(director)}</div><div className={`border-x border-b border-slate-600 px-2 py-1 text-center text-[8px] font-bold ${directorValue.s > 0 ? "bg-red-100 text-red-700" : "bg-white"}`}>({director.kelas_jabatan_menpan || director.kelas_jabatan_orb || "-"}-{directorValue.b}-{directorValue.k})</div></section>
      <span className="h-5 border-l border-slate-800" aria-hidden="true" />
      <div className="relative grid w-full grid-cols-2 items-start pb-5">
        <span className="pointer-events-none absolute bottom-0 left-1/2 top-0 border-l border-slate-800" aria-hidden="true" />
        <div className="relative w-[280px]" style={{ marginLeft: spiLeft }}><RsudPositionCard showSelisih={false} position={spi ? { ...spi, nama_jabatan_menpan: "Kepala Satuan Pengawas Internal" } : null} positions={spiPositions} group={group} search={search} connector="right" connectorWidth={spiConnectorWidth} /></div>
        <div className="relative ml-5 w-[340px]"><span className="pointer-events-none absolute top-2 right-full w-5 border-t border-slate-800" aria-hidden="true" /><PositionTable title="Kelompok Jabatan Fungsional" positions={directorFunctional} group={group} search={search} /></div>
      </div>
      <div data-peta-leadership-branches="true" className="relative grid gap-5" style={{ width: totalWidth, gridTemplateColumns: columnWidths.map((width) => `${width}px`).join(" ") }}>
        <span className="pointer-events-none absolute top-0 border-t border-slate-800" style={{ left: columnWidths[0] / 2, right: columnWidths[1] / 2 }} aria-hidden="true" />
        <div className="relative pt-5"><span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" /><RsudABLeadershipGroup position={wadirAdmin} heads={adminHeads} group={group} search={search} /></div>
        <div className="relative pt-5"><span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" /><RsudABLeadershipGroup position={wadirService} heads={serviceHeads} group={group} search={search} /></div>
      </div>
      <div data-peta-support-layout="true" className="relative grid w-full gap-5" style={{ gridTemplateColumns: `repeat(${displayHeads.length}, 300px)`, gridTemplateRows: "max-content 1fr max-content" }}>
        {displayHeads.map((head, index) => {
          const support = head === supportHead;
          return <div key={head.id} data-peta-support-tables={support ? "true" : undefined} className="relative min-w-0 pt-5" style={{ gridColumn: index + 1, gridRow: support || (template === "RSUD B" && index === 0) ? "1 / span 3" : "1" }}><span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />{support ? <span className="pointer-events-none absolute right-full border-t border-slate-800" style={{ top: 62, width: 10 }} aria-hidden="true" /> : null}<RsudABDepartment position={head} positions={ordered} segment={segments.get(String(head.id))} template={template} group={group} search={search} wide={support} /></div>;
        })}
        <span data-peta-support-trunk="true" className="pointer-events-none relative w-0 border-l border-slate-800" style={{ gridColumn: displayHeads.length, gridRow: "1 / span 2", marginLeft: -10, marginTop: 62, marginBottom: -40 }} aria-hidden="true" />
        <div data-peta-support-coordinators="true" className="relative min-w-0 self-start" style={{ gridColumn: `${coordinatorColumn} / span 4`, gridRow: 3 }}>
          <span className="pointer-events-none absolute border-t border-slate-800" style={{ top: 20, right: -10, width: 160 }} aria-hidden="true" />
          <RsudABDepartment position={supportHead} positions={ordered} segment={segments.get(String(supportHead?.id))} template={template} group={group} search={search} wide coordinatorsOnly />
        </div>
      </div>
      <div className="w-full"><PetaApproval /></div>
    </div>
  );
}

function PuskesmasChart({ positions, group, search }) {
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan) || String(a.id).localeCompare(String(b.id)));
  const at = (order) => ordered.find((position) => Number(position.urutan) === order);
  const range = (from, to) => ordered.filter((position) => Number(position.urutan) >= from && Number(position.urutan) <= to);
  const root = at(10) || ordered.find((position) => textKey(positionTitle(position)).includes("KEPALA PUSKESMAS"));
  if (!root) return null;

  const spi = at(11);
  const subbag = at(24);
  const pustu = at(44);
  const ukm = at(38);
  const ukp = at(41);
  const topFunctional = range(13, 23);
  const pustuPositions = [at(12), at(33)].filter(Boolean);
  const subbagPositions = range(25, 37).filter((position) => Number(position.urutan) !== 33);
  const ukmPositions = range(39, 40);
  const ukpPositions = range(42, 43);
  const functionalColumns = [range(45, 65), range(66, 88), range(89, 103)];
  const rootDisplay = { ...root, nama_jabatan_menpan: "Administrator Kesehatan Ahli Madya (Kepala Puskesmas Kecamatan)" };
  const spiDisplay = spi ? { ...spi, nama_jabatan_menpan: "Kepala Satuan Pengawas Internal" } : null;
  const ukmDisplay = ukm ? { ...ukm, nama_jabatan_menpan: "Koordinator Satuan Pelaksana Upaya Kesehatan Masyarakat, Keperawatan Kesehatan Masyarakat, Jaringan Pelayanan dan Jejaring Puskesmas" } : null;

  return (
    <div className="peta-reference-chart flex w-[1050px] shrink-0 flex-col items-center">
      {[['Kepala Dinas', '15-1-1'], ['Wakil Kepala Dinas', '14-1-1']].map(([title, detail], index) => (
        <div key={title} className="flex flex-col items-center">
          {index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}
          <section className="w-[380px]">
            <div className="border border-slate-600 bg-white px-2 py-1.5 text-center text-[8px] font-medium uppercase text-slate-950">{title}</div>
            <div className="border-x border-b border-slate-600 bg-white px-2 py-1 text-center text-[8px] font-bold">({detail})</div>
          </section>
        </div>
      ))}
      <span className="h-4 border-l border-slate-800" aria-hidden="true" />
      <div className="relative z-10 w-[380px] bg-white"><RsudPositionCard position={rootDisplay} group={group} search={search} showSelisih={false} /></div>

      <span className="h-5 border-l border-slate-800" aria-hidden="true" />
      <div className="relative w-[1050px]">
        <div className="relative grid grid-cols-[320px_320px_320px] items-start gap-[45px]">
          <span className="pointer-events-none absolute -bottom-5 top-0 border-l border-slate-800" style={{ left: 708 }} aria-hidden="true" />
          <span className="pointer-events-none absolute left-[160px] right-[160px] top-0 border-t border-slate-800" aria-hidden="true" />
          <div className="relative pt-5">
            <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
            <RsudPositionCard position={spiDisplay} group={group} search={search} showSelisih={false} />
          </div>
          <div className="relative pt-5">
            <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
            <div className="-mt-2"><PositionTable title="Kelompok Jabatan Fungsional" positions={topFunctional} group={group} search={search} /></div>
          </div>
          <div className="relative pt-5">
            <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
            <RsudPositionCard position={subbag} positions={subbagPositions} group={group} search={search} showSelisih={false} />
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-[320px_320px_320px] items-start gap-[45px]">
          <span className="pointer-events-none absolute left-[160px] right-[160px] top-0 border-t border-slate-800" aria-hidden="true" />
          {[
            { key: "pustu", position: pustu, positions: pustuPositions },
            { key: "ukm", position: ukmDisplay, positions: ukmPositions },
            { key: "ukp", position: ukp, positions: ukpPositions },
          ].map((item) => (
              <div key={item.key} className="relative flex min-w-0 flex-col pt-5">
                <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
                <RsudPositionCard position={item.position} positions={item.positions} group={group} search={search} showSelisih={false} titleClassName="flex min-h-[42px] items-center justify-center" />
              </div>
          ))}
        </div>
        <div className="grid grid-cols-[320px_320px_320px] items-start gap-[45px]">
          {functionalColumns.map((items, index) => hasVisiblePositions(items, search) ? (
            <div key={index} className="relative pt-5">
              <span className="pointer-events-none absolute left-1/2 top-0 h-5 border-l border-slate-800" aria-hidden="true" />
              <div className="-mt-2"><PositionTable title="Kelompok Jabatan Fungsional" positions={items} group={group} search={search} /></div>
            </div>
          ) : <div key={index} />)}
        </div>
        <PetaApproval />
      </div>
    </div>
  );
}

const UPT_TEMPLATES = ["PPKP", "LABKESDA", "PUSLATKESDA", "PK3D", "JAMKESJA", "PUSDATIN"];

function isUptSubbag(position) {
  return textKey(positionTitle(position))
    .replace(/SUB\s+BAGIAN/g, "SUBBAGIAN")
    .includes("KEPALA SUBBAGIAN TATA USAHA");
}

function isUptCoordinator(position) {
  return /^(?:KOORD\w*|KETUA)\s+SATUAN\s+PELAKSANA\b/.test(textKey(positionTitle(position)));
}

function UptChart({ root, positions, group, search, template }) {
  const ordered = [...positions].sort((a, b) => Number(a.urutan) - Number(b.urutan) || Number(a.id) - Number(b.id));
  const rootPosition = root?.position || ordered[0];
  if (!rootPosition) return null;

  const rootIndex = Math.max(0, ordered.findIndex((position) => String(position.id) === String(rootPosition.id)));
  const subbagIndex = ordered.findIndex((position, index) => index > rootIndex && isUptSubbag(position));
  const functionalEnd = subbagIndex >= 0 ? subbagIndex : ordered.length;
  const functional = ordered.slice(rootIndex + 1, functionalEnd);
  const subbag = subbagIndex >= 0 ? ordered[subbagIndex] : null;
  const coordinatorIndexes = ordered
    .map((position, index) => ({ position, index }))
    .filter((item) => item.index > subbagIndex && isUptCoordinator(item.position))
    .map((item) => item.index);
  const firstCoordinatorIndex = coordinatorIndexes[0] ?? ordered.length;
  const subbagPositions = subbag ? ordered.slice(subbagIndex + 1, firstCoordinatorIndex) : [];
  const coordinators = coordinatorIndexes.map((index, itemIndex) => ({
    key: ordered[index].id,
    position: ordered[index],
    positions: ordered.slice(index + 1, coordinatorIndexes[itemIndex + 1] ?? ordered.length),
  }));
  if (template === "LABKESDA") {
    const priority = ["KESEHATAN MASYARAKAT", "PEMELIHARAAN DAN KALIBRASI", "KESEHATAN KOTA", "DOPING DAN KIMIA"];
    const rank = (item) => {
      const index = priority.findIndex((title) => textKey(positionTitle(item.position)).includes(title));
      return index < 0 ? priority.length : index;
    };
    coordinators.sort((a, b) => rank(a) - rank(b));
  }
  const referenceTitles = {
    PPKP: "Kepala Pusat Pelayanan Kesehatan Pegawai",
    LABKESDA: "Kepala Laboratorium Kesehatan Daerah",
    PUSLATKESDA: "Kepala Pusat Pelatihan Kesehatan Daerah",
    PK3D: "Kepala Pusat Krisis dan Kegawatdaruratan Kesehatan Daerah",
    JAMKESJA: "Kepala Unit Pengelola Jaminan Kesehatan Jakarta",
    PUSDATIN: "Kepala Pusat Data dan Teknologi Informasi Kesehatan Daerah"
  };
  const rootDisplay = { ...rootPosition, nama_jabatan_menpan: referenceTitles[template] || positionTitle(rootPosition) };

  return (
    <div className="peta-reference-chart flex w-[960px] shrink-0 flex-col items-center">
      {[["Kepala Dinas", "15-1-1"], ["Wakil Kepala Dinas", "14-0-1"]].map(([title, detail], index) => (
        <div key={title} className="flex w-[380px] flex-col items-center">
          {index > 0 ? <span className="h-4 border-l border-slate-800" aria-hidden="true" /> : null}
          <section className="w-full"><div className="border border-slate-600 bg-white px-2 py-1.5 text-center text-[8px] uppercase">{title}</div><div className="border-x border-b border-slate-600 px-2 py-1 text-center text-[8px]">({detail})</div></section>
        </div>
      ))}
      <span className="h-4 border-l border-slate-800" aria-hidden="true" />
      <div className="w-[380px]"><RsudPositionCard position={rootDisplay} group={group} search={search} showSelisih={false} /></div>
      <div className="relative w-[440px] pt-5">
        <span className="pointer-events-none absolute left-5 right-1/2 top-1 border-t border-slate-800" aria-hidden="true" />
        <span className="pointer-events-none absolute left-1/2 top-0 h-1 border-l border-slate-800" aria-hidden="true" />
        <span className="pointer-events-none absolute left-5 top-1 h-4 border-l border-slate-800" aria-hidden="true" />
        <div className="relative ml-5 w-[400px] space-y-5 overflow-hidden pl-5">
          <PositionTable title="Kelompok Jabatan Fungsional" positions={functional} group={group} search={search} sideConnector="left" connectorWidth={20} />
          {subbag ? <RsudPositionCard position={subbag} positions={subbagPositions} group={group} search={search} connector="left" connectorWidth={20} showSelisih={false} drawConnectorTrunk={!coordinators.length} /> : null}
          {coordinators.map((item, index) => <RsudPositionCard key={item.key} position={item.position} positions={item.positions} group={group} search={search} connector="left" connectorWidth={20} showSelisih={false} drawConnectorTrunk={index === coordinators.length - 1} />)}
        </div>
      </div>
      <div className="w-full"><PetaApproval /></div>
    </div>
  );
}

export default function PetaJabatanPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ukpd, setUkpd] = useState("");
  const [template, setTemplate] = useState("");
  const [group, setGroup] = useState("ASN");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState("");
  const printAreaRef = useRef(null);
  const exportingRef = useRef(exporting);

  useEffect(() => {
    exportingRef.current = exporting;
  }, [exporting]);

  useEffect(() => {
    let disposed = false;
    let requestInProgress = false;
    let controller = null;

    async function loadData({ silent = false } = {}) {
      if (requestInProgress || (silent && exportingRef.current)) return;
      requestInProgress = true;
      controller = new AbortController();
      const params = new URLSearchParams();
      if (ukpd) params.set("ukpd", ukpd);
      else if (template) params.set("template", template);
      if (!silent) {
        setLoading(true);
        setError("");
      }
      try {
        const response = await fetch(`/api/peta-jabatan?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || "Peta jabatan gagal dimuat.");
        if (disposed) return;
        setData(body.data);
        setError("");
      } catch (reason) {
        if (!disposed && reason.name !== "AbortError" && !silent) setError(reason.message);
      } finally {
        requestInProgress = false;
        if (!disposed && !silent) setLoading(false);
      }
    }

    loadData();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadData({ silent: true });
    }, 10_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") loadData({ silent: true });
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      controller?.abort();
    };
  }, [ukpd, template]);

  const organizationTrees = useMemo(() => buildOrganizationTree(data?.positions || []), [data]);
  const totals = useMemo(() => (data?.positions || []).reduce((sum, position) => ({
    k: sum.k + Number(group === "ASN" ? position.kebutuhan_asn : position.kebutuhan_non_asn),
    b: sum.b + Number(group === "ASN" ? position.bezetting_asn : position.bezetting_non_asn)
  }), { k: 0, b: 0 }), [data, group]);

  function exportName(extension) {
    const unit = data?.selectedUkpd || data?.template || "peta-jabatan";
    const type = group === "ASN" ? "asn" : "non-asn";
    return `peta-jabatan-${safeFileName(unit)}-${type}.${extension}`;
  }

  function printPdf() {
    const area = printAreaRef.current;
    const content = area?.querySelector(".peta-print-content");
    if (!area || !content) return;
    const printableWidth = 1050;
    const scale = Math.min(1, printableWidth / Math.max(content.scrollWidth, 1),
      content.classList.contains("peta-reference-export") ? 718 / Math.max(content.scrollHeight, 1) : 1);
    area.style.setProperty("--peta-print-scale", String(scale));
    area.style.setProperty("--peta-print-content-height", `${content.scrollHeight}px`);
    const removePrintPages = ["RSUD A", "RSUD B", "RSKD"].includes(data?.template)
      ? createHospitalPrintPages(area, content) : null;
    document.body.classList.add("peta-print-active");
    const cleanup = () => {
      removePrintPages?.();
      document.body.classList.remove("peta-print-active");
      area.style.removeProperty("--peta-print-scale");
      area.style.removeProperty("--peta-print-content-height");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    cleanup();
  }

  async function exportPng() {
    const content = printAreaRef.current?.querySelector(".peta-print-content");
    if (!content || exporting) return;
    setExporting("png");
    try {
      await document.fonts?.ready;
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default || html2canvasModule;
      const width = Math.max(1, Math.ceil(content.scrollWidth));
      const height = Math.max(1, Math.ceil(content.scrollHeight));
      const scale = Math.max(0.5, Math.min(2, 16384 / width, 16384 / height));
      const canvas = await html2canvas(content, {
        backgroundColor: "#ffffff",
        scale,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width,
        height,
        windowWidth: Math.max(document.documentElement.clientWidth, width),
        windowHeight: Math.max(document.documentElement.clientHeight, height),
        onclone: (clonedDocument) => {
          const root = clonedDocument.querySelector('[data-peta-export-root="true"]');
          if (!root) return;
          const area = root.closest(".peta-print-area");
          if (area) area.style.overflow = "visible";
          root.querySelectorAll("img, svg, canvas, video, iframe").forEach((element) => element.remove());
          root.querySelectorAll("*").forEach((element) => {
            const background = clonedDocument.defaultView?.getComputedStyle(element).backgroundImage;
            if (background && background !== "none") element.style.backgroundImage = "none";
          });
        },
      });
      const blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG tidak dapat dibentuk.")), "image/png");
        } catch (reason) {
          reject(reason);
        }
      });
      downloadBlob(blob, exportName("png"));
    } catch (reason) {
      window.alert(reason?.message || "Export PNG gagal. Silakan coba kembali.");
    } finally {
      setExporting("");
    }
  }

  async function exportExcel() {
    const content = printAreaRef.current?.querySelector(".peta-print-content");
    if (!content || exporting) return;
    setExporting("excel");
    try {
      await document.fonts?.ready;
      const [excelModule, exporterModule] = await Promise.all([
        import("exceljs"),
        import("@/lib/export/editablePetaExcel"),
      ]);
      const ExcelJS = excelModule.default || excelModule;
      const workbook = exporterModule.createEditablePetaWorkbook({ ExcelJS, content, data, group });
      const buffer = await workbook.xlsx.writeBuffer();
      downloadBlob(
        new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        exportName("xlsx"),
      );
    } catch (reason) {
      window.alert(reason?.message || "Export Excel gagal. Silakan coba kembali.");
    } finally {
      setExporting("");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={<span className="inline-flex flex-wrap items-center gap-3">
          <span>Peta Jabatan</span>
          {data?.mode === "detail" ? <span className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {[['ASN', 'ASN/PNS'], ['NON_ASN', 'Non-ASN']].map(([value, label]) => <button key={value} type="button" onClick={() => setGroup(value)} className={`rounded-md px-4 py-2 text-xs font-extrabold ${group === value ? "bg-dinkes-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}
          </span> : null}
        </span>}
        compact
        showBreadcrumb={false}
        action={<div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:justify-end sm:gap-1.5">
          {!loading && !error && data?.mode === "detail" ? <>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-stretch sm:justify-end sm:gap-1.5">
              <CompactKpi label="Peta"><p className="min-w-0 truncate text-sm font-black leading-tight text-slate-950 sm:max-w-40">{data.template}</p></CompactKpi>
              <CompactKpi label={group === "ASN" ? "ASN/PNS" : "Non-ASN"} tone={group === "ASN" ? "blue" : "amber"}>
                <CompactMetric label="B" value={totals.b} className={group === "ASN" ? "text-blue-800" : "text-amber-800"} />
                <CompactMetric label="K" value={totals.k} className={group === "ASN" ? "text-blue-800" : "text-amber-800"} />
                <CompactMetric label="S" value={totals.b - totals.k} className={totals.b - totals.k > 0 ? "rounded bg-red-100 px-2 py-1 text-red-700" : "text-amber-700"} />
              </CompactKpi>
            </div>
          </> : null}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-1.5">
            <button type="button" onClick={printPdf} disabled={data?.mode !== "detail" || Boolean(exporting)} className="btn-secondary justify-center self-center"><Printer className="h-4 w-4" />Cetak PDF</button>
            <button type="button" onClick={exportPng} disabled={data?.mode !== "detail" || Boolean(exporting)} className="btn-secondary justify-center self-center">{exporting === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}{exporting === "png" ? "Menyiapkan PNG…" : "Export PNG"}</button>
            <button type="button" onClick={exportExcel} disabled={data?.mode !== "detail" || Boolean(exporting)} className="btn-secondary justify-center self-center">{exporting === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}{exporting === "excel" ? "Menyiapkan Excel…" : "Export Excel"}</button>
            <Link href="/peta-jabatan/data" className="btn-secondary inline-flex items-center justify-center self-center">Verval Jabatan</Link>
          </div>
        </div>}
      />

      {data?.canFilterUkpd ? <section className="mb-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-2">
        <select className="input" value={ukpd} onChange={(event) => { setUkpd(event.target.value); if (event.target.value) setTemplate(""); }}><option value="">Pilih UKPD</option>{(data?.ukpdOptions || []).map((item) => <option key={item.id_ukpd} value={item.nama_ukpd}>{item.nama_ukpd}</option>)}</select>
        <select className="input" value={template} onChange={(event) => { setTemplate(event.target.value); setUkpd(""); }}><option value="">Ringkasan seluruh jenis UKPD</option>{(data?.templates || []).sort().map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </section> : null}

      {error ? <ErrorState title="Peta jabatan belum dapat ditampilkan" message={error} /> : null}
      {loading ? <div className="surface p-8 text-center text-sm font-semibold text-slate-500">Memuat peta jabatan…</div> : null}

      {!loading && !error && data?.mode === "summary" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.summary.map((item) => <button key={item.template_ukpd} type="button" onClick={() => setTemplate(item.template_ukpd)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-dinkes-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><Building2 className="h-7 w-7 text-dinkes-700" /><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">{number(item.jumlah_jabatan)} jabatan</span></div><h2 className="mt-4 font-display text-lg font-black text-slate-950">{item.template_ukpd}</h2><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Metric label="K ASN" value={item.kebutuhan_asn} tone="blue" /><Metric label="K Non-ASN" value={item.kebutuhan_non_asn} tone="amber" /></div></button>)}</div>
      ) : null}

      {!loading && !error && data?.mode === "detail" ? (
        <>
          <label className="relative mb-4 block"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input className="input pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama jabatan pada tabel bagan" /></label>
          <section ref={printAreaRef} className="peta-print-area overflow-x-auto rounded-xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className={`peta-print-content min-w-max ${["RSUD A", "RSUD B", "RSUD C", "RSUD D", "RSKD", "DINAS KESEHATAN", "PUSKESMAS", "SUKU DINAS KOTA", "SUKU DINAS SERIBU", ...UPT_TEMPLATES].includes(data.template) ? "peta-reference-export" : ""}`} data-peta-export-root="true">
              {["RSUD A", "RSUD B", "RSUD C", "RSUD D", "RSKD", "DINAS KESEHATAN", "PUSKESMAS", "SUKU DINAS KOTA", "SUKU DINAS SERIBU", ...UPT_TEMPLATES].includes(data.template) ? <div className="mb-7 text-center"><h2 className="text-sm font-bold uppercase">Peta Jabatan<br />{["RSUD A", "RSUD B", "RSUD C", "RSUD D"].includes(data.template) ? <>Rumah Sakit Umum Daerah Kelas {data.template.slice(-1)}<br /></> : data.template === "RSKD" ? <>Rumah Sakit Khusus Daerah Duren Sawit<br /></> : data.template === "PUSKESMAS" ? <>Pusat Kesehatan Masyarakat<br /></> : data.template === "SUKU DINAS KOTA" ? <>Suku Dinas Kesehatan Kota Administrasi<br /></> : data.template === "SUKU DINAS SERIBU" ? <>Suku Dinas Kesehatan Kabupaten Administrasi Kepulauan Seribu<br /></> : UPT_TEMPLATES.includes(data.template) ? <>Unit Pelaksana Teknis<br /></> : null}Dinas Kesehatan Provinsi DKI Jakarta</h2><p className="mt-1 text-[10px]">{data.selectedUkpd || data.template} / {group === "ASN" ? "ASN/PNS" : "Non-ASN"}</p></div> : <div className="mb-7 text-center"><Network className="mx-auto h-6 w-6 text-dinkes-700" /><h2 className="mt-2 text-sm font-black uppercase text-slate-950">Peta Jabatan {data.selectedUkpd}</h2><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{group === "ASN" ? "ASN/PNS (PNS, CPNS, PPPK)" : "Non-ASN (PPPK Paruh Waktu dan Non PNS/ASN)"}</p></div>}
              <div className="flex min-w-max justify-center gap-8 px-8 pb-8">{["SUKU DINAS KOTA", "SUKU DINAS SERIBU"].includes(data.template) ? <SudinkesReferenceChart positions={data.positions || []} group={group} search={search} template={data.template} /> : data.template === "DINAS KESEHATAN" ? <DinkesChart positions={data.positions || []} group={group} search={search} /> : ["RSUD A", "RSUD B", "RSKD"].includes(data.template) ? <RsudABChart template={data.template} root={organizationTrees[0]} positions={data.positions || []} group={group} search={search} /> : data.template === "RSUD C" ? <RsudCChart root={organizationTrees[0]} positions={data.positions || []} group={group} search={search} /> : data.template === "RSUD D" ? <RsudDChart root={organizationTrees[0]} positions={data.positions || []} group={group} search={search} /> : data.template === "PUSKESMAS" ? <PuskesmasChart positions={data.positions || []} group={group} search={search} /> : UPT_TEMPLATES.includes(data.template) ? <UptChart template={data.template} root={organizationTrees[0]} positions={data.positions || []} group={group} search={search} /> : ["SUKU DINAS KOTA", "SUKU DINAS SERIBU"].includes(data.template) ? organizationTrees.map((root) => <SudinkesTree key={root.position.id} root={root} group={group} search={search} template={data.template} />) : organizationTrees.map((root) => <OrganizationNode key={root.position.id} node={root} group={group} search={search} />)}</div>
              {!organizationTrees.length ? <p className="py-10 text-center text-sm text-slate-500">Struktur atasan pada data ini belum membentuk pohon organisasi.</p> : null}
            </div>
          </section>
          {data.unmatched?.length ? <section className="mt-4 overflow-hidden rounded-lg border border-amber-300 bg-amber-50"><div className="flex items-center gap-2 border-b border-amber-200 px-4 py-3 text-sm font-extrabold text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />Daftar {number(data.unmatched.length)} pegawai yang belum cocok dengan identitas jabatan peta</div><div className="max-h-96 overflow-auto bg-white"><table className="w-full min-w-[900px] border-collapse text-xs"><thead className="sticky top-0 bg-amber-100 text-left text-[10px] uppercase text-amber-950"><tr><th className="border-b border-amber-200 px-3 py-2">No.</th><th className="border-b border-amber-200 px-3 py-2">Nama Pegawai</th><th className="border-b border-amber-200 px-3 py-2">Jenis Pegawai</th><th className="border-b border-amber-200 px-3 py-2">Jabatan Saat Ini</th><th className="border-b border-amber-200 px-3 py-2">Atasan Langsung</th><th className="border-b border-amber-200 px-3 py-2">UKPD</th></tr></thead><tbody>{data.unmatched.map((person, index) => <tr key={person.id_pegawai} className="odd:bg-white even:bg-amber-50/40"><td className="border-b border-slate-100 px-3 py-2 text-center">{index + 1}</td><td className="border-b border-slate-100 px-3 py-2"><Link href={`/pegawai/${person.id_pegawai}`} className="font-bold text-dinkes-800 hover:underline">{person.nama}</Link></td><td className="border-b border-slate-100 px-3 py-2">{person.jenis_pegawai || "—"}</td><td className="border-b border-slate-100 px-3 py-2">{person.jabatan || "Jabatan kosong"}</td><td className="border-b border-slate-100 px-3 py-2">{person.atasan || "—"}</td><td className="border-b border-slate-100 px-3 py-2">{person.nama_ukpd || data.selectedUkpd}</td></tr>)}</tbody></table></div></section> : null}
        </>
      ) : null}
    </div>
  );
}
