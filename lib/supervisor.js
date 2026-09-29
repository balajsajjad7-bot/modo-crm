// Monitoring areas an admin can grant to a SUPERVISOR account. Each maps to a nav item + its API area.
// Deliberately excludes salaries, payroll, users, settings, connectors — supervisors can never reach those.
export const SUP_AREAS = [
  ["attendance", "Attendance", "/admin/attendance"],
  ["whereabouts", "Whereabouts (geofence)", "/admin/whereabouts"],
  ["quality", "Call quality (QA)", "/admin/quality"],
  ["recordings", "Call recordings", "/admin/recordings"],
  ["chat", "Chat & huddles", "/admin/chat"],
];
export const SUP_KEYS = SUP_AREAS.map((a) => a[0]);
