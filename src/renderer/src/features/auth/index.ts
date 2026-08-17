export * from "./services/service";
// The client-side authorization rules. Five files across the workspace ask
// "may this person moderate this lobby", and they used to reach past this
// barrel to ./permissions to do it — the one module every feature needs and the
// only one the feature's own entry point did not name.
export * from "./permissions";
export * from "./hooks/use-auth-actions";
export * from "./hooks/use-auth-session";
export * from "./hooks/use-auth-controller";
export { default as LoginPage } from "./pages/LoginPage";
export { default as RegisterPage } from "./pages/RegisterPage";
