// Where the Go backend is checked out, for the checks that hold this repo to
// it: CONNECT_BACKEND_DIR when set, else the sibling folder connect-backend.
// The backend is not part of this repository and is absent in its CI, so every
// check that reads it skips its cross-repo half, and says so, when it is not
// there.
const path = require("node:path");

module.exports = process.env.CONNECT_BACKEND_DIR
  ? path.resolve(process.env.CONNECT_BACKEND_DIR)
  : path.join(__dirname, "..", "..", "connect-backend");
