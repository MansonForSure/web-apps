import { PianoAudio } from "./audio-engine.js";
import {
  SHORTCUTS,
  BY_CODE,
  NUMBER_ROW,
  LETTER_ROW,
  PIANO_MIN,
  PIANO_MAX,
  noteName,
  isBlack,
  clampTranspose,
} from "./mapping.js";

const $ = (id) => document.getElementById(id);
const audio = new PianoAudio();
const inputs = new Map();
const pointers = new Map();
const pianoButtons = new Map();
const shortcutButtons = new Map();
const settings = loadSettings();
let transpose = clampTranspose(settings.transpose);
let showLabels = settings.labels !== false;
let pedalToggle = false;
let spaceHeld = false;
let minMidi = PIANO_MIN;
let maxMidi = PIANO_MAX;

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem("keyroom-settings") || "{}") || {};
  } catch {
    return {};
  }
}
function saveSettings() {
  try {
    localStorage.setItem(
      "keyroom-settings",
      JSON.stringify({
        transpose,
        labels: showLabels,
        volume: Number($("volume").value),
      }),
    );
  } catch {
    /* Private mode or full storage must not prevent playing. */
  }
}
function setAudioStatus(ready, message) {
  $("audio-status").textContent = message;
  $("status-light").classList.toggle("ready", ready);
  $("status-light").classList.toggle(
    "error",
    !ready && message !== "Press a key to enable sound",
  );
  $("enable-audio").hidden = ready;
}
async function ensureAudio() {
  if (audio.ready) return true;
  try {
    // Retry resume within each new gesture, even if a previous attempt is pending.
    await audio.unlock();
    setAudioStatus(true, "Sound on · synthesized piano");
    return true;
  } catch (error) {
    setAudioStatus(
      false,
      error.message || "Sound unavailable. Tap Enable sound to retry.",
    );
    return false;
  }
}
function renderPiano() {
  const piano = $("piano");
  piano.replaceChildren();
  pianoButtons.clear();
  const notes = Array.from(
    { length: maxMidi - minMidi + 1 },
    (_, i) => minMidi + i,
  );
  const whites = notes.filter((midi) => !isBlack(midi));
  piano.style.setProperty("--white-count", whites.length);
  let whiteIndex = 0;
  for (const midi of notes) {
    const black = isBlack(midi);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `piano-key ${black ? "black" : "white"}`;
    button.dataset.midi = midi;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute(
      "aria-label",
      `${noteName(midi)}${transpose ? `, plays ${noteName(midi + transpose)}` : ""}`,
    );
    button.title = `${noteName(midi)}${transpose ? ` → ${noteName(midi + transpose)}` : ""}`;
    const width = 100 / whites.length;
    button.style.width = `${width * (black ? 0.61 : 1)}%`;
    button.style.left = `${width * (black ? whiteIndex - 0.305 : whiteIndex)}%`;
    if (!black) whiteIndex++;
    const pitch = document.createElement("span");
    pitch.className = "piano-note";
    pitch.textContent = noteName(midi);
    const shortcut = document.createElement("span");
    shortcut.className = "piano-shortcut";
    shortcut.textContent =
      SHORTCUTS.find((item) => item.midi + transpose === midi)?.key || "";
    button.append(pitch, shortcut);
    piano.append(button);
    pianoButtons.set(midi, button);
    // Keyboard navigation and assistive-technology activation.
    button.addEventListener("keydown", (event) => {
      if (event.code === "Enter" && !event.repeat) {
        event.preventDefault();
        press(`enter:${midi}`, midi);
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.code === "Enter") {
        event.preventDefault();
        release(`enter:${midi}`);
      }
    });
    button.addEventListener("click", (event) => {
      if (event.detail === 0 && !inputs.has(`enter:${midi}`))
        tap(`assist:${midi}`, midi);
    });
  }
  piano.setAttribute(
    "aria-label",
    `Playable piano, ${noteName(minMidi)} to ${noteName(maxMidi)}`,
  );
}
function renderShortcuts() {
  $("shortcut-deck").replaceChildren();
  for (const [rowName, codes] of [
    ["numbers", NUMBER_ROW],
    ["letters", LETTER_ROW],
  ]) {
    const row = document.createElement("div");
    row.className = `shortcut-row ${rowName}`;
    for (const code of codes) {
      const item = BY_CODE.get(code);
      const key =
        item?.key ||
        { Digit1: "1", Digit4: "4", Digit7: "7", Minus: "−" }[code];
      const button = document.createElement("button");
      button.type = "button";
      button.className = `shortcut-key ${item ? (isBlack(item.midi) ? "sharp" : "natural") : "silent"}${code === "KeyR" ? " anchor" : ""}`;
      button.dataset.code = code;
      if (item) {
        button.dataset.baseMidi = item.midi;
        button.setAttribute("aria-pressed", "false");
        button.setAttribute(
          "aria-label",
          `${key}: ${noteName(item.midi + transpose)}`,
        );
        button.addEventListener("click", (event) => {
          if (event.detail === 0) tap(`assist-pad:${code}`, item.midi, code);
        });
      } else {
        button.disabled = true;
        button.setAttribute("aria-label", `${key}: no sound`);
      }
      const letter = document.createElement("span");
      letter.className = "key-letter";
      letter.textContent = key;
      const pitch = document.createElement("span");
      pitch.className = "key-pitch";
      pitch.textContent = item ? noteName(item.midi + transpose, false) : "—";
      button.append(letter, pitch);
      row.append(button);
      shortcutButtons.set(code, button);
    }
    $("shortcut-deck").append(row);
  }
}
function paintHeld() {
  const heldPitches = new Set([...inputs.values()].map((input) => input.pitch));
  const heldCodes = new Set(
    [...inputs.values()].map((input) => input.code).filter(Boolean),
  );
  for (const [midi, button] of pianoButtons) {
    const held = heldPitches.has(midi);
    button.classList.toggle("active", held);
    button.setAttribute("aria-pressed", String(held));
  }
  for (const [code, button] of shortcutButtons) {
    const held = heldCodes.has(code);
    button.classList.toggle("active", held);
    if (!button.disabled) button.setAttribute("aria-pressed", String(held));
  }
  const pitches = [...heldPitches].sort((a, b) => a - b);
  $("active-notes").textContent = pitches.length
    ? pitches.map((midi) => noteName(midi)).join(" · ")
    : "—";
  $("active-notes").classList.toggle("chord", pitches.length > 1);
  $("note-count").textContent = pitches.length
    ? `${pitches.length} ${pitches.length === 1 ? "note" : "notes"} held`
    : pedalToggle || spaceHeld
      ? "Pedal down. Let it linger."
      : "Make a little music.";
}
function includePitch(pitch) {
  if (pitch >= minMidi && pitch <= maxMidi) return;
  minMidi = Math.min(minMidi, pitch);
  maxMidi = Math.max(maxMidi, pitch);
  // Use natural-key boundaries for an intact piano silhouette.
  if (isBlack(minMidi)) minMidi--;
  if (isBlack(maxMidi)) maxMidi++;
  renderPiano();
}
async function press(token, base, code = null) {
  if (inputs.has(token)) return;
  const pitch = Math.max(21, Math.min(108, base + transpose));
  const input = { base, pitch, code };
  inputs.set(token, input);
  includePitch(pitch);
  paintHeld();
  if (await ensureAudio()) {
    if (inputs.get(token) === input) audio.noteOn(token, pitch);
  }
}
function release(token) {
  if (!inputs.has(token)) return;
  inputs.delete(token);
  audio.noteOff(token);
  paintHeld();
}
function tap(token, midi, code = null) {
  press(token, midi, code);
  setTimeout(() => release(token), 240);
}
function syncPedal() {
  const active = pedalToggle || spaceHeld;
  audio.setSustain(active);
  $("sustain").setAttribute("aria-pressed", String(active));
  paintHeld();
}
function allNotesOff() {
  inputs.clear();
  pointers.clear();
  pedalToggle = false;
  spaceHeld = false;
  audio.setSustain(false);
  audio.panic();
  syncPedal();
}
function setTranspose(value) {
  const next = clampTranspose(value);
  if (transpose !== next) allNotesOff();
  transpose = next;
  $("transpose").value = transpose;
  $("transpose-down").disabled = transpose === -12;
  $("transpose-up").disabled = transpose === 12;
  $("transpose-reset").disabled = transpose === 0;
  $("pitch-hint").replaceChildren();
  ["KeyR", "Digit5", "KeyE"].forEach((code, index) => {
    if (index) {
      const dot = document.createElement("span");
      dot.className = "divider-dot";
      dot.textContent = "·";
      $("pitch-hint").append(dot);
    }
    const item = BY_CODE.get(code);
    $("pitch-hint").append(`${item.key} → ${noteName(item.midi + transpose)}`);
  });
  renderPiano();
  renderShortcuts();
  paintHeld();
  saveSettings();
}
function editableTarget(target) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input,textarea,select,[contenteditable=true]"))
  );
}
document.addEventListener("keydown", (event) => {
  if (event.code === "Escape") {
    allNotesOff();
    return;
  }
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    editableTarget(event.target) ||
    $("help-dialog").open
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    if (!event.repeat) {
      spaceHeld = true;
      ensureAudio();
      syncPedal();
    }
    return;
  }
  const mapping = BY_CODE.get(event.code);
  if (!mapping) return;
  event.preventDefault();
  if (!event.repeat) press(`key:${event.code}`, mapping.midi, event.code);
});
document.addEventListener("keyup", (event) => {
  release(`key:${event.code}`);
  if (event.code === "Space" && spaceHeld) {
    spaceHeld = false;
    syncPedal();
  }
});
function pointerNote(surface, x, y) {
  const target = document.elementFromPoint(x, y);
  const button = target?.closest(
    surface === "piano" ? ".piano-key" : ".shortcut-key",
  );
  if (!button || button.disabled) return null;
  if (surface === "piano" && $("piano").contains(button))
    return { base: Number(button.dataset.midi), code: null };
  if (surface === "shortcuts" && $("shortcut-deck").contains(button))
    return { base: Number(button.dataset.baseMidi), code: button.dataset.code };
  return null;
}
function bindPointers(element, surface) {
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const note = pointerNote(surface, event.clientX, event.clientY);
    if (!note) return;
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { surface, ...note });
    press(`pointer:${event.pointerId}`, note.base, note.code);
  });
  element.addEventListener("pointermove", (event) => {
    const old = pointers.get(event.pointerId);
    if (!old || old.surface !== surface) return;
    const next = pointerNote(surface, event.clientX, event.clientY);
    if (next?.base === old.base && next?.code === old.code) return;
    release(`pointer:${event.pointerId}`);
    pointers.set(event.pointerId, {
      surface,
      base: next?.base ?? null,
      code: next?.code ?? null,
    });
    if (next) press(`pointer:${event.pointerId}`, next.base, next.code);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    element.addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      release(`pointer:${event.pointerId}`);
    });
  }
}
bindPointers($("piano-scroll"), "piano");
bindPointers($("shortcut-deck"), "shortcuts");
function bindScrollRail(rail, scroll) {
  const drags = new Map();
  rail.style.touchAction = "none";
  rail.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (scroll.scrollWidth <= scroll.clientWidth) return;
    event.preventDefault();
    rail.setPointerCapture(event.pointerId);
    drags.set(event.pointerId, { x: event.clientX, left: scroll.scrollLeft });
  });
  rail.addEventListener("pointermove", (event) => {
    const drag = drags.get(event.pointerId);
    if (drag) scroll.scrollLeft = drag.left + drag.x - event.clientX;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    rail.addEventListener(type, (event) => drags.delete(event.pointerId));
  }
}
bindScrollRail(document.querySelector(".instrument-bottom"), $("piano-scroll"));
bindScrollRail(
  document.querySelector(".guide-footer"),
  document.querySelector(".shortcut-scroll"),
);
window.addEventListener("blur", allNotesOff);
window.addEventListener("pagehide", allNotesOff);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) allNotesOff();
});
$("enable-audio").addEventListener("click", ensureAudio);
$("transpose-down").addEventListener("click", () =>
  setTranspose(transpose - 1),
);
$("transpose-up").addEventListener("click", () => setTranspose(transpose + 1));
$("transpose-reset").addEventListener("click", () => setTranspose(0));
$("transpose").addEventListener("change", () =>
  setTranspose($("transpose").value),
);
$("sustain").addEventListener("click", () => {
  pedalToggle = !pedalToggle;
  ensureAudio();
  syncPedal();
});
$("stop-notes").addEventListener("click", allNotesOff);
$("labels").addEventListener("click", () => {
  showLabels = !showLabels;
  $("piano").classList.toggle("hide-labels", !showLabels);
  $("labels").setAttribute("aria-pressed", String(showLabels));
  saveSettings();
});
$("volume").value =
  Number.isFinite(Number(settings.volume)) && settings.volume !== undefined
    ? Math.max(0, Math.min(100, Number(settings.volume)))
    : 70;
function setVolume() {
  audio.setVolume(Number($("volume").value) / 100);
  $("volume-value").textContent = `${$("volume").value}%`;
  saveSettings();
}
$("volume").addEventListener("input", setVolume);
$("help-open").addEventListener("click", () => {
  allNotesOff();
  $("help-dialog").showModal();
});
$("help-close").addEventListener("click", () => $("help-dialog").close());
$("help-dialog").addEventListener("click", (event) => {
  if (event.target === $("help-dialog")) {
    const box = $("help-dialog").getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      $("help-dialog").close();
  }
});
setTranspose(transpose);
setVolume();
$("piano").classList.toggle("hide-labels", !showLabels);
$("labels").setAttribute("aria-pressed", String(showLabels));
// On phones, begin around the mapped G3–D5 range rather than the low extension.
requestAnimationFrame(() => {
  const scroll = $("piano-scroll");
  if (scroll.scrollWidth > scroll.clientWidth) {
    const key = pianoButtons.get(55);
    scroll.scrollLeft = Math.max(0, key.offsetLeft - 18);
  }
});
