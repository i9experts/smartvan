/* eslint-disable prettier/prettier */
// Canonical registry of gate-able product modules. A school's effective
// feature set = tier defaults ∪ enabledFeatures − disabledFeatures (see
// effectiveFeatures() below). Keep this list in sync with the frontend's
// mirror of it (smartvan-admin reads it from GET school/feature-registry
// rather than hardcoding a copy).
export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  tier: 'basic' | 'premium';
  // Some premium "features" are really just a different frontend view of
  // data a Basic endpoint already returns (e.g. Fleet Health reuses the
  // same van records the Basic Vans page lists) — there's no exclusive
  // endpoint to guard, so enforcement for those is frontend-only. Backend
  // guards are only ever applied where backendEnforced is true.
  backendEnforced: boolean;
}

export const FEATURE_KEYS: FeatureDef[] = [
  // ─── Basic — always available, listed for completeness/UI display ────
  { key: 'live_tracking', label: 'Live Tracking', description: 'Real-time van location on the map', tier: 'basic', backendEnforced: false },
  { key: 'student_management', label: 'Student Management', description: 'Add and manage student profiles', tier: 'basic', backendEnforced: false },
  { key: 'van_driver_management', label: 'Vans & Drivers', description: 'Manage your fleet and driver accounts', tier: 'basic', backendEnforced: false },
  { key: 'parent_management', label: 'Parent Management', description: 'Manage parent accounts and linked students', tier: 'basic', backendEnforced: false },
  { key: 'route_planner', label: 'Route Planner', description: 'Create and assign pickup/drop routes', tier: 'basic', backendEnforced: false },
  { key: 'alerts', label: 'Alerts', description: 'Safety and operational alerts', tier: 'basic', backendEnforced: false },
  { key: 'attendance', label: 'Attendance', description: 'Daily pickup/drop attendance records', tier: 'basic', backendEnforced: false },

  // ─── Premium ───────────────────────────────────────────────────────
  { key: 'analytics', label: 'Analytics Dashboard', description: 'School-wide trends, insights and route-optimization savings', tier: 'premium', backendEnforced: true },
  { key: 'route_optimization', label: 'AI Route Optimization', description: "Drivers can request an AI-optimized stop order, plus the school's savings log", tier: 'premium', backendEnforced: true },
  { key: 'safety_checklists', label: 'Safety Checklist Compliance', description: "School-wide visibility into drivers' daily pre-trip vehicle checks", tier: 'premium', backendEnforced: true },
  { key: 'ratings', label: 'Ratings & Reviews Log', description: 'Browsable, filterable school-wide driver/parent ratings log', tier: 'premium', backendEnforced: true },
  { key: 'complaints', label: 'Complaints & Reports', description: 'Manage and respond to driver/parent complaints and reports', tier: 'premium', backendEnforced: true },
  { key: 'fee_management', label: 'Fee Management', description: 'Set fees, generate monthly invoices, track payments and reminders', tier: 'premium', backendEnforced: true },
  { key: 'fleet_health', label: 'Fleet Health', description: 'Document compliance scoring and fleet readiness dashboard', tier: 'premium', backendEnforced: false },
];

export const FEATURE_KEY_SET = new Set(FEATURE_KEYS.map((f) => f.key));

function tierDefaultKeys(tier: string): string[] {
  // Premium includes every Basic feature too — it's additive, never a
  // smaller set than Basic.
  if (tier === 'premium') return FEATURE_KEYS.map((f) => f.key);
  return FEATURE_KEYS.filter((f) => f.tier === 'basic').map((f) => f.key);
}

/** The actual set of feature keys a school can use right now. */
export function effectiveFeatures(school: {
  featureTier?: string;
  enabledFeatures?: string[];
  disabledFeatures?: string[];
}): Set<string> {
  const result = new Set(tierDefaultKeys(school.featureTier || 'basic'));
  (school.enabledFeatures || []).forEach((k) => result.add(k));
  (school.disabledFeatures || []).forEach((k) => result.delete(k));
  return result;
}

export function hasFeature(
  school: { featureTier?: string; enabledFeatures?: string[]; disabledFeatures?: string[] },
  key: string,
): boolean {
  return effectiveFeatures(school).has(key);
}
