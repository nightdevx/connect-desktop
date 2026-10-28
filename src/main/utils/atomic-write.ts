import fs from "node:fs";

// Writes a whole file or leaves the old one untouched.
//
// writeFileSync on the real path truncates it first and then writes: a power
// cut or a crash in between leaves half a JSON document, which the stores read
// back as "no session" (signed out) or "defaults" (every shortcut gone).
// Writing a sibling file, flushing it to disk and renaming it over the target
// means a reader only ever sees the old file or the new one. Same directory on
// purpose: a rename is only atomic within one volume.
export const writeFileAtomic = (filePath: string, contents: string): void => {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, contents, {
      encoding: "utf-8",
      mode: 0o600,
      flush: true,
    });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
};
