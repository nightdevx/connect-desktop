// Thin JS wrapper around the compiled native addon. Kept separate so the main
// process can require a stable path and so a load failure degrades gracefully.
module.exports = require("./build/Release/audio_loopback.node");
