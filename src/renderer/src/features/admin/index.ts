// The admin feature's public surface: one panel.
//
// Everything else under components/ is its own internals — the sidebar and the
// five sections it switches between — and nothing outside this feature has any
// business reaching them. This barrel was the only one missing, which is why the
// app shell used to import `features/admin/components/admin-panel` by path.
export { default as AdminPanel } from "./components/admin-panel";
export { adminService } from "./services/admin-service";
