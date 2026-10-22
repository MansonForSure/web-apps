export const SHORTCUTS = Object.freeze([
  { code: "KeyQ", key: "Q", midi: 55 },
  { code: "Digit2", key: "2", midi: 56 },
  { code: "KeyW", key: "W", midi: 57 },
  { code: "Digit3", key: "3", midi: 58 },
  { code: "KeyE", key: "E", midi: 59 },
  { code: "KeyR", key: "R", midi: 60 },
  { code: "Digit5", key: "5", midi: 61 },
  { code: "KeyT", key: "T", midi: 62 },
  { code: "Digit6", key: "6", midi: 63 },
  { code: "KeyY", key: "Y", midi: 64 },
  { code: "KeyU", key: "U", midi: 65 },
  { code: "Digit8", key: "8", midi: 66 },
  { code: "KeyI", key: "I", midi: 67 },
  { code: "Digit9", key: "9", midi: 68 },
  { code: "KeyO", key: "O", midi: 69 },
  { code: "Digit0", key: "0", midi: 70 },
  { code: "KeyP", key: "P", midi: 71 },
  { code: "BracketLeft", key: "[", midi: 72 },
  { code: "Equal", key: "=", midi: 73 },
  { code: "BracketRight", key: "]", midi: 74 },
]);
export const BY_CODE = new Map(SHORTCUTS.map((item) => [item.code, item]));
export const SILENT_CODES = new Set(["Digit1", "Digit4", "Digit7", "Minus"]);
export const NUMBER_ROW = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
  "Minus",
  "Equal",
];
export const LETTER_ROW = [
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyT",
  "KeyY",
  "KeyU",
  "KeyI",
  "KeyO",
  "KeyP",
  "BracketLeft",
  "BracketRight",
];
export const PIANO_MIN = 43;
export const PIANO_MAX = 86;
export const TRANSPOSE_MIN = -12;
export const TRANSPOSE_MAX = 12;
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export function noteName(midi, octave = true) {
  return (
    NAMES[((midi % 12) + 12) % 12] + (octave ? Math.floor(midi / 12) - 1 : "")
  );
}
export function isBlack(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}
export function clampTranspose(value) {
  return Math.max(
    TRANSPOSE_MIN,
    Math.min(TRANSPOSE_MAX, Math.round(Number(value) || 0)),
  );
}
export function mappedMidi(code, transpose = 0) {
  const item = BY_CODE.get(code);
  return item ? item.midi + clampTranspose(transpose) : null;
}
