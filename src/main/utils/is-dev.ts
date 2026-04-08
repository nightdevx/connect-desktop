export const isDev =
  process.env.NODE_ENV === "development" ||
  typeof process.env.VITE_DEV_SERVER_URL === "string";
