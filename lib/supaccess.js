// Admin areas a supervisor can be granted. Login management & agent-access are intentionally
// NOT grantable — only true admins can create logins or change permissions.
export const SECTIONS = [
  { key: "sales", label: "Sales", path: "/admin/sales" },
  { key: "budgetease", label: "Budget Ease", path: "/admin/budgetease" },
  { key: "reports", label: "Reports", path: "/admin/reports" },
  { key: "pipeline", label: "Pipeline", path: "/admin/pipeline" },
  { key: "contacts", label: "Customers", path: "/admin/contacts" },
  { key: "notepad", label: "Notepad", path: "/admin/notepad" },
  { key: "email", label: "Email", path: "/admin/email" },
  { key: "tasks", label: "Tasks & callbacks", path: "/admin/tasks" },
  { key: "quality", label: "Call quality (QA)", path: "/admin/quality" },
  { key: "recordings", label: "Call recordings", path: "/admin/recordings" },
  { key: "dialer", label: "Dialer setup", path: "/admin/dialer" },
  { key: "autodial", label: "Auto dialer", path: "/admin/autodial" },
  { key: "phone", label: "Google Voice dialer", path: "/admin/phone" },
  { key: "attendance", label: "Attendance", path: "/admin/attendance" },
  { key: "whereabouts", label: "Whereabouts", path: "/admin/whereabouts" },
  { key: "agents", label: "Agents", path: "/admin/agents" },
  { key: "shifts", label: "Shifts", path: "/admin/shifts" },
  { key: "breaks", label: "Break report", path: "/admin/breaks" },
  { key: "payroll", label: "Payroll", path: "/admin/payroll" },
  { key: "chat", label: "Chat", path: "/admin/chat" },
  { key: "ai", label: "Modo AI", path: "/admin/ai" },
  { key: "builder", label: "AI Builder", path: "/admin/builder" },
  { key: "lookups", label: "Lookups", path: "/admin/lookups" },
  { key: "calculator", label: "Discount calculator", path: "/admin/calculator" },
  { key: "train", label: "Train Modo AI", path: "/admin/train" },
  { key: "connectors", label: "Connectors", path: "/admin/connectors" },
];
export const SECTION_KEYS = SECTIONS.map((s) => s.key);
// Which section a given /admin path belongs to (Overview "/admin" is always allowed).
export const sectionForPath = (p) => (SECTIONS.find((s) => p === s.path || p.startsWith(s.path + "/")) || {}).key;
