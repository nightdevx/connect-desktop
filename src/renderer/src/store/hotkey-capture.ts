// True while a settings field is recording a new shortcut. The keys pressed
// for it are often the current bindings, and they must not open or toggle the
// mic while they are being recorded.
let capturing = false;

export const setHotkeyCapturing = (value: boolean): void => {
  capturing = value;
};

export const isHotkeyCapturing = (): boolean => capturing;
