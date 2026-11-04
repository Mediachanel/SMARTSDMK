import { ROLE_LABELS, ROLES } from "@/lib/constants/roles";

const styles = {
  [ROLES.SUPER_ADMIN]: "bg-dinkes-100 text-dinkes-800 ring-dinkes-200",
  [ROLES.ADMIN_WILAYAH]: "bg-govgold-100 text-govgold-700 ring-govgold-300",
  [ROLES.ADMIN_UKPD]: "bg-emerald-50 text-emerald-700 ring-emerald-200"
};

export default function RoleBadge({ role }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${styles[role] || "bg-slate-100 text-slate-700 ring-slate-200"}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}
