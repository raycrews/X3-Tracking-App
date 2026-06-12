import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import "./styles.css";

const APP_PATH_KEY = "x3-tracker-data-file";
const THEME_KEY = "x3-tracker-theme";
const HISTORY_RANGE_KEY = "x3-tracker-history-range";
const PREVIEW_DATA_KEY = "x3-tracker-browser-preview";
const isTauri = "__TAURI_INTERNALS__" in window;

const workouts = {
  push: ["Chest Press", "Tricep Press", "Overhead Press", "Front Squats"],
  pull: ["Deadlift", "Bicep Curl", "Bent Row", "Calf Raise"],
};

const defaultBands = [
  "White Short",
  "White Long",
  "Light Gray Short",
  "Light Gray Long",
  "Heavy Gray Short",
  "Heavy Gray Long",
  "Black Short",
  "Black Long",
];

const themes = [
  ["system", "System"],
  ["orange", "Orange"],
  ["dark", "Dark"],
  ["light", "Light"],
  ["contrast", "High Contrast"],
];

const historyRangeOptions = [
  ["1m", "One month"],
  ["2m", "Two months"],
  ["3m", "Three months"],
  ["6m", "Six months"],
  ["1y", "One year"],
  ["all", "All entries"],
];

const validHistoryRanges = historyRangeOptions.map(([value]) => value);

const state = {
  currentDay: "push",
  selectedExercise: "Chest Press",
  date: todayISO(),
  theme: localStorage.getItem(THEME_KEY) || "system",
  historyRange: validHistoryRanges.includes(localStorage.getItem(HISTORY_RANGE_KEY))
    ? localStorage.getItem(HISTORY_RANGE_KEY)
    : "1m",
  path: null,
  revision: null,
  document: emptyDocument(),
  status: "no-file",
  statusMessage: "Choose or create a CSV data file to begin.",
  settingsOpen: false,
  settingsSection: "csv",
  editingKey: null,
  saveTimer: null,
};

function emptyDocument() {
  return { workouts: [], bands: [...defaultBands] };
}

function normalizeDocument(document) {
  const bands = [];
  for (const band of document.bands || []) {
    const trimmed = String(band || "").trim();
    if (trimmed && !bands.includes(trimmed)) bands.push(trimmed);
  }
  return {
    workouts: document.workouts || [],
    bands: bands.length ? bands : [...defaultBands],
  };
}

function todayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addMonths(date, amount) {
  const result = new Date(date);
  const day = result.getDate();
  result.setMonth(result.getMonth() + amount);
  if (result.getDate() !== day) result.setDate(0);
  return result;
}

function cutoffForHistoryRange() {
  if (state.historyRange === "all") return null;
  const monthsByRange = {
    "1m": 1,
    "2m": 2,
    "3m": 3,
    "6m": 6,
    "1y": 12,
  };
  const months = monthsByRange[state.historyRange] || 1;
  const cutoff = addMonths(new Date(), -months);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function keyFor(date, dayType, exercise) {
  return `${date}__${dayType}__${exercise}`;
}

function keyForEntry(entry) {
  return keyFor(entry.date, entry.dayType, entry.exercise);
}

function findEntryIndexByKey(key) {
  return state.document.workouts.findIndex((entry) => keyForEntry(entry) === key);
}

function selectedEntry() {
  if (!state.editingKey) return null;
  const index = findEntryIndexByKey(state.editingKey);
  return index === -1 ? null : state.document.workouts[index];
}

function getEntry(date, dayType, exercise) {
  return (
    state.document.workouts.find(
      (entry) => keyFor(entry.date, entry.dayType, entry.exercise) === keyFor(date, dayType, exercise),
    ) || {
      date,
      dayType,
      exercise,
      band: state.document.bands[0] || "",
      fullReps: "",
      intermediateReps: "",
      shortReps: "",
      notes: "",
    }
  );
}

function hasContent(entry) {
  return Boolean(entry.fullReps || entry.intermediateReps || entry.shortReps || entry.notes);
}

function updateEntry(exercise, field, value) {
  let entry = { ...getEntry(state.date, state.currentDay, exercise), [field]: value };
  let key = keyForEntry(entry);
  let index = findEntryIndexByKey(key);

  if (state.editingKey) {
    const editingIndex = findEntryIndexByKey(state.editingKey);
    if (editingIndex !== -1) {
      index = editingIndex;
      entry = { ...state.document.workouts[editingIndex], [field]: value };
      key = keyForEntry(entry);
    }
  }

  if (index === -1) {
    state.document.workouts.push(entry);
  } else {
    state.document.workouts[index] = entry;
  }
  state.editingKey = key;
  updateHistoryPanel();
  scheduleSave();
}

function clearEntry(exercise) {
  const key = keyFor(state.date, state.currentDay, exercise);
  state.document.workouts = state.document.workouts.filter(
    (entry) => keyForEntry(entry) !== key,
  );
  if (state.editingKey === key) state.editingKey = null;
  scheduleSave();
  render();
}

function historyFor(exercise) {
  const cutoff = cutoffForHistoryRange();
  const entries = state.document.workouts
    .filter((entry) => entry.dayType === state.currentDay && entry.exercise === exercise)
    .filter(hasContent)
    .filter((entry) => {
      if (!cutoff) return true;
      const entryDate = parseISODate(entry.date);
      return entryDate && entryDate >= cutoff;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  return entries;
}

function totalHistoryFor(exercise) {
  return state.document.workouts
    .filter((entry) => entry.dayType === state.currentDay && entry.exercise === exercise)
    .filter(hasContent).length;
}

function historyLabel() {
  const selected = historyRangeOptions.find(([value]) => value === state.historyRange);
  return selected ? selected[1] : "One month";
}

function selectHistoryEntry(key) {
  const index = findEntryIndexByKey(key);
  if (index === -1) return;
  const entry = state.document.workouts[index];
  state.currentDay = entry.dayType;
  state.selectedExercise = entry.exercise;
  state.date = entry.date;
  state.editingKey = key;
  render();
}

function changeWorkoutDate(date) {
  if (!state.editingKey) {
    state.date = date;
    render();
    return;
  }

  const index = findEntryIndexByKey(state.editingKey);
  if (index === -1) {
    state.date = date;
    state.editingKey = null;
    render();
    return;
  }

  const oldEntry = state.document.workouts[index];
  const updatedEntry = { ...oldEntry, date };
  const updatedKey = keyForEntry(updatedEntry);
  const existingIndex = findEntryIndexByKey(updatedKey);
  if (existingIndex !== -1 && existingIndex !== index) {
    setStatus("error", "That date already has an entry for this day and exercise.");
    render();
    return;
  }

  state.document.workouts[index] = updatedEntry;
  state.date = date;
  state.editingKey = updatedKey;
  updateHistoryPanel();
  scheduleSave();
  render();
}

function setStatus(status, message) {
  state.status = status;
  state.statusMessage = message;
  renderStatus();
}

function scheduleSave() {
  if (!state.path || state.status === "conflict") return;
  clearTimeout(state.saveTimer);
  setStatus("dirty", "Unsaved changes");
  state.saveTimer = setTimeout(persistDocument, 450);
}

async function persistDocument() {
  if (!state.path || state.status === "conflict") return;
  state.document = normalizeDocument(state.document);
  setStatus("saving", "Saving...");
  try {
    const result = await callBackend("save_data_file", {
      path: state.path,
      document: state.document,
      expectedRevision: state.revision,
    });
    state.revision = result.revision;
    setStatus("saved", "Saved");
  } catch (error) {
    const message = String(error);
    if (message.includes("changed on another computer")) {
      setStatus("conflict", message);
    } else {
      setStatus("error", message);
    }
  }
}

async function loadDataFile(path) {
  clearTimeout(state.saveTimer);
  try {
    const result = await callBackend("load_data_file", { path });
    state.path = path;
    state.revision = result.revision;
    state.document = normalizeDocument(result.document);
    localStorage.setItem(APP_PATH_KEY, path);
    setStatus("saved", "Saved");
    render();
  } catch (error) {
    setStatus("error", String(error));
    render();
  }
}

async function createDataFile() {
  const path = await chooseSavePath("Create X3 workout CSV", "x3-workouts.csv");
  if (!path) return;
  state.document = emptyDocument();
  state.revision = null;
  state.path = path;
  await persistDocument();
  if (state.status === "saved") {
    localStorage.setItem(APP_PATH_KEY, path);
    render();
  }
}

async function openDataFile() {
  const path = await chooseOpenPath();
  if (path) await loadDataFile(path);
}

async function exportCopy() {
  if (!state.path) return;
  const path = await chooseSavePath("Export a CSV copy", "x3-workouts-backup.csv");
  if (!path) return;
  try {
    await callBackend("export_data_file", { path, document: state.document });
    setStatus("saved", "Exported CSV copy");
  } catch (error) {
    setStatus("error", String(error));
  }
}

async function chooseOpenPath() {
  if (!isTauri) return "Browser preview CSV";
  return open({
    multiple: false,
    directory: false,
    title: "Open an X3 workout CSV",
    filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
  });
}

async function chooseSavePath(title, defaultPath) {
  if (!isTauri) return defaultPath;
  return save({
    title,
    defaultPath,
    filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
  });
}

async function callBackend(command, args) {
  if (isTauri) return invoke(command, args);
  return browserPreviewBackend(command, args);
}

async function browserPreviewBackend(command, args) {
  if (command === "load_data_file") {
    const stored = JSON.parse(localStorage.getItem(PREVIEW_DATA_KEY) || "null");
    return stored || { document: emptyDocument(), revision: "preview-0" };
  }
  if (command === "save_data_file") {
    const revision = `preview-${Date.now()}`;
    const stored = { document: args.document, revision };
    localStorage.setItem(PREVIEW_DATA_KEY, JSON.stringify(stored));
    return { revision };
  }
  if (command === "export_data_file") return null;
  throw new Error(`Unknown preview command: ${command}`);
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fieldId(exercise, type) {
  return `${exercise.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${type}`;
}

function renderBandOptions(selectedBand) {
  const options = [...state.document.bands];
  if (selectedBand && !options.includes(selectedBand)) options.unshift(selectedBand);
  return options
    .map(
      (band) =>
        `<option value="${escapeHtml(band)}" ${band === selectedBand ? "selected" : ""}>${escapeHtml(band)}</option>`,
    )
    .join("");
}

function renderExerciseCards() {
  return workouts[state.currentDay]
    .map((exercise, index) => {
      const entry = getEntry(state.date, state.currentDay, exercise);
      const isOpen = exercise === state.selectedExercise;
      const isEditing = state.editingKey === keyForEntry(entry) && hasContent(entry);
      return `
        <article class="exercise-card ${isOpen ? "is-open" : ""}">
          <button class="exercise-heading" type="button" data-action="select-exercise" data-exercise="${escapeHtml(exercise)}">
            <span class="exercise-number">${String(index + 1).padStart(2, "0")}</span>
            <span>${escapeHtml(exercise)}</span>
            <span class="exercise-toggle">${isOpen ? "&minus;" : "+"}</span>
          </button>
          ${
            isOpen
              ? `
                <div class="exercise-form">
                  ${
                    isEditing
                      ? `<div class="edit-notice">Editing ${escapeHtml(formatDate(entry.date))} from history. Change the date above to correct this record's date.</div>`
                      : ""
                  }
                  <div class="rep-fields">
                    ${renderInput(exercise, "fullReps", "Full Reps", entry.fullReps)}
                    ${renderInput(exercise, "intermediateReps", "Intermediate", entry.intermediateReps)}
                    ${renderInput(exercise, "shortReps", "Short Reps", entry.shortReps)}
                  </div>
                  <label class="field">
                    <span>Band</span>
                    <select data-exercise="${escapeHtml(exercise)}" data-field="band">
                      ${renderBandOptions(entry.band)}
                    </select>
                  </label>
                  <label class="field">
                    <span>Notes</span>
                    <textarea data-exercise="${escapeHtml(exercise)}" data-field="notes" placeholder="Form notes, tempo, adjustments...">${escapeHtml(entry.notes)}</textarea>
                  </label>
                  <button class="text-button danger" type="button" data-action="clear-entry" data-exercise="${escapeHtml(exercise)}">Clear this entry</button>
                </div>
              `
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderInput(exercise, field, label, value) {
  return `
    <label class="field">
      <span>${label}</span>
      <input id="${fieldId(exercise, field)}" type="number" min="0" inputmode="numeric"
        data-exercise="${escapeHtml(exercise)}" data-field="${field}" value="${escapeHtml(value)}" />
    </label>
  `;
}

function renderHistoryLegacy() {
  const history = historyFor(state.selectedExercise);
  if (!history.length) {
    return `<div class="empty-history">No saved reps yet for <strong>${escapeHtml(state.selectedExercise)}</strong>.</div>`;
  }
  return `
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Date</th><th>Full</th><th>Intermediate</th><th>Short</th><th>Band</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${history
            .map(
              (entry) => `
                <tr>
                  <td>${formatDate(entry.date)}</td>
                  <td>${entry.fullReps || "&mdash;"}</td>
                  <td>${entry.intermediateReps || "&mdash;"}</td>
                  <td>${entry.shortReps || "&mdash;"}</td>
                  <td>${escapeHtml(entry.band || "—")}</td>
                  <td class="notes-cell">${escapeHtml(entry.notes || "—")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistory() {
  const history = historyFor(state.selectedExercise);
  if (!history.length) {
    return `<div class="empty-history">No saved reps yet for <strong>${escapeHtml(state.selectedExercise)}</strong>.</div>`;
  }
  return `
    <p class="history-help">Select a row to bring that entry into the exercise panel for editing.</p>
    <div class="table-scroll">
      <table>
        <thead>
          <tr><th>Date</th><th>Full</th><th>Intermediate</th><th>Short</th><th>Band</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${history
            .map((entry) => {
              const key = keyForEntry(entry);
              return `
                <tr class="history-row ${state.editingKey === key ? "is-selected" : ""}" role="button" tabindex="0" data-action="edit-history-entry" data-entry-key="${escapeHtml(key)}">
                  <td>${formatDate(entry.date)}</td>
                  <td>${entry.fullReps || "&mdash;"}</td>
                  <td>${entry.intermediateReps || "&mdash;"}</td>
                  <td>${entry.shortReps || "&mdash;"}</td>
                  <td>${entry.band ? escapeHtml(entry.band) : "&mdash;"}</td>
                  <td class="notes-cell">${entry.notes ? escapeHtml(entry.notes) : "&mdash;"}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSettingsLegacy() {
  if (!state.settingsOpen) return "";
  return `
    <div class="modal-backdrop" data-action="close-settings">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">CSV settings</p>
            <h2 id="settings-title">Band options</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Close settings" data-action="close-settings">&times;</button>
        </div>
        <p class="modal-copy">Band options are stored in the CSV file and shared with every computer that uses it.</p>
        <div class="band-editor">
          ${state.document.bands
            .map(
              (band, index) => `
                <div class="band-row">
                  <input type="text" data-band-index="${index}" value="${escapeHtml(band)}" aria-label="Band option ${index + 1}" />
                  <button class="icon-button danger" type="button" data-action="remove-band" data-band-index="${index}" aria-label="Remove ${escapeHtml(band)}">&times;</button>
                </div>
              `,
            )
            .join("")}
        </div>
        <button class="secondary-button" type="button" data-action="add-band">+ Add band option</button>
      </section>
    </div>
  `;
}

function renderSettings() {
  if (!state.settingsOpen) return "";
  const hasFile = Boolean(state.path);
  return `
    <div class="modal-backdrop" data-action="close-settings">
      <section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">App settings</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button class="icon-button" type="button" aria-label="Close settings" data-action="close-settings">&times;</button>
        </div>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings sections">
            <button type="button" data-action="show-settings-section" data-section="csv" class="${state.settingsSection === "csv" ? "active" : ""}">Workout CSV</button>
            <button type="button" data-action="show-settings-section" data-section="history" class="${state.settingsSection === "history" ? "active" : ""}">History</button>
            <button type="button" data-action="show-settings-section" data-section="bands" class="${state.settingsSection === "bands" ? "active" : ""}" ${hasFile ? "" : "disabled"}>Bands</button>
            <button type="button" data-action="show-settings-section" data-section="theme" class="${state.settingsSection === "theme" ? "active" : ""}">Theme</button>
          </nav>
          <div class="settings-content">
            ${renderSettingsSection()}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderSettingsSection() {
  if (state.settingsSection === "csv") {
    const shownPath = state.path || "No CSV selected";
    return `
      <section class="settings-section">
        <p class="eyebrow">Storage</p>
        <h3>Workout CSV</h3>
        <p class="modal-copy">Choose the spreadsheet file that stores your workout history and shared band settings.</p>
        <div class="csv-settings-card">
          <span class="file-label">Current CSV</span>
          <strong title="${escapeHtml(shownPath)}">${escapeHtml(shownPath)}</strong>
        </div>
        <div class="settings-actions">
          <button class="secondary-button" type="button" data-action="new-file">New CSV</button>
          <button class="secondary-button" type="button" data-action="open-file">Open CSV</button>
          <button class="secondary-button" type="button" data-action="export-copy" ${state.path ? "" : "disabled"}>Export copy</button>
        </div>
      </section>
    `;
  }

  if (state.settingsSection === "theme") {
    return `
      <section class="settings-section">
        <p class="eyebrow">Theme</p>
        <h3>Visual theme</h3>
        <p class="modal-copy">Choose the app theme for this computer.</p>
        <label class="field">
          <span>Theme</span>
          <select data-action="change-theme" aria-label="Theme">
            ${themes.map(([value, label]) => `<option value="${value}" ${state.theme === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
      </section>
    `;
  }

  if (state.settingsSection === "bands") {
    return `
      <section class="settings-section">
        <p class="eyebrow">CSV settings</p>
        <h3>Band options</h3>
        <p class="modal-copy">Band options are stored in the CSV file and shared with every computer that uses it.</p>
        <div class="band-editor">
          ${state.document.bands
            .map(
              (band, index) => `
                <div class="band-row">
                  <input type="text" data-band-index="${index}" value="${escapeHtml(band)}" aria-label="Band option ${index + 1}" />
                  <button class="icon-button danger" type="button" data-action="remove-band" data-band-index="${index}" aria-label="Remove ${escapeHtml(band)}">&times;</button>
                </div>
              `,
            )
            .join("")}
        </div>
        <button class="secondary-button" type="button" data-action="add-band">+ Add band option</button>
      </section>
    `;
  }

  return `
    <section class="settings-section">
      <p class="eyebrow">History</p>
      <h3>History entries shown</h3>
      <p class="modal-copy">Choose the date range shown in the History section for the selected exercise. Newest entries stay at the top.</p>
      <label class="field">
        <span>Visible history range</span>
        <select data-action="change-history-range" aria-label="Visible history range">
          ${historyRangeOptions.map(([value, label]) => `<option value="${value}" ${state.historyRange === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </label>
    </section>
  `;
}

function render() {
  document.documentElement.dataset.theme = state.theme;
  const hasFile = Boolean(state.path);
  document.querySelector("#app").innerHTML = `
    <header class="app-header">
      <div>
        <p class="eyebrow">Offline workout log</p>
        <h1>X3 Tracker</h1>
      </div>
      <div class="header-actions">
        <div class="save-status ${state.status}" id="save-status">
          <span class="status-dot"></span>
          <span>${escapeHtml(state.statusMessage)}</span>
          ${state.status === "conflict" ? `<button class="status-action" type="button" data-action="reload-file">Reload file</button>` : ""}
        </div>
        <button class="menu-button" type="button" data-action="open-settings" aria-label="Open settings" aria-expanded="${state.settingsOpen}">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>

    ${
      hasFile
        ? `
          <main>
            <section class="workout-toolbar">
              <div class="workout-controls">
                <div class="day-tabs" role="tablist" aria-label="Workout day">
                  <button type="button" data-action="set-day" data-day="push" class="${state.currentDay === "push" ? "active" : ""}">Push Day</button>
                  <button type="button" data-action="set-day" data-day="pull" class="${state.currentDay === "pull" ? "active" : ""}">Pull Day</button>
                </div>
                <label class="date-picker">
                  <span>Workout date</span>
                  <input type="date" data-action="change-date" value="${state.date}" />
                </label>
              </div>
            </section>

            <div class="workspace-grid">
              <section class="panel exercise-panel">
                <div class="panel-heading">
                  <p class="eyebrow">${state.currentDay} routine</p>
                  <h2>Exercises</h2>
                </div>
                <div class="exercise-list">${renderExerciseCards()}</div>
              </section>

              <section class="panel history-panel" id="history-panel">
                <div class="panel-heading history-heading">
                  <div>
                    <p class="eyebrow">${historyLabel()}</p>
                    <h2>${escapeHtml(state.selectedExercise)} History</h2>
                  </div>
                  <span class="history-count">${historyFor(state.selectedExercise).length} of ${totalHistoryFor(state.selectedExercise)} entries</span>
                </div>
                ${renderHistory()}
              </section>
            </div>
          </main>
        `
        : `
          <main class="welcome-card">
            <p class="eyebrow">First step</p>
            <h2>Connect a workout spreadsheet</h2>
            <p>Create a new CSV file or open an existing one from a local folder, your NAS, Google Drive, or Nextcloud Files.</p>
            <div class="welcome-actions">
              <button class="primary-button" type="button" data-action="new-file">Create CSV</button>
              <button class="secondary-button" type="button" data-action="open-file">Open CSV</button>
            </div>
          </main>
        `
    }
    ${renderSettings()}
  `;
}

function renderStatus() {
  const status = document.querySelector("#save-status");
  if (!status) return;
  status.className = `save-status ${state.status}`;
  status.innerHTML = `
    <span class="status-dot"></span>
    <span>${escapeHtml(state.statusMessage)}</span>
    ${state.status === "conflict" ? `<button class="status-action" type="button" data-action="reload-file">Reload file</button>` : ""}
  `;
}

function updateHistoryPanel() {
  const panel = document.querySelector("#history-panel");
  if (!panel) return;
  panel.outerHTML = `
    <section class="panel history-panel" id="history-panel">
      <div class="panel-heading history-heading">
        <div>
          <p class="eyebrow">${historyLabel()}</p>
          <h2>${escapeHtml(state.selectedExercise)} History</h2>
        </div>
        <span class="history-count">${historyFor(state.selectedExercise).length} of ${totalHistoryFor(state.selectedExercise)} entries</span>
      </div>
      ${renderHistory()}
    </section>
  `;
}

document.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;

  if (action === "new-file") await createDataFile();
  if (action === "open-file") await openDataFile();
  if (action === "export-copy") await exportCopy();
  if (action === "reload-file" && state.path) await loadDataFile(state.path);
  if (action === "edit-history-entry") selectHistoryEntry(control.dataset.entryKey);

  if (action === "set-day") {
    state.currentDay = control.dataset.day;
    state.selectedExercise = workouts[state.currentDay][0];
    state.editingKey = null;
    render();
  }
  if (action === "select-exercise") {
    state.selectedExercise = control.dataset.exercise;
    state.editingKey = null;
    render();
  }
  if (action === "clear-entry") clearEntry(control.dataset.exercise);
  if (action === "open-settings") {
    state.settingsOpen = true;
    render();
  }
  if (action === "close-settings" && event.target === control) {
    state.settingsOpen = false;
    render();
  }
  if (action === "show-settings-section") {
    state.settingsSection = control.dataset.section;
    render();
  }
  if (action === "add-band") {
    state.document.bands.push("New band");
    scheduleSave();
    render();
  }
  if (action === "remove-band") {
    state.document.bands.splice(Number(control.dataset.bandIndex), 1);
    scheduleSave();
    render();
  }
});

document.addEventListener("input", (event) => {
  const input = event.target;
  if (input.dataset.field) updateEntry(input.dataset.exercise, input.dataset.field, input.value);
  if (input.dataset.bandIndex !== undefined) {
    const index = Number(input.dataset.bandIndex);
    const previousBand = state.document.bands[index];
    state.document.bands[index] = input.value;
    state.document.workouts = state.document.workouts.map((entry) =>
      entry.band === previousBand ? { ...entry, band: input.value } : entry,
    );
    updateHistoryPanel();
    scheduleSave();
  }
});

document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.dataset.action === "change-date") {
    changeWorkoutDate(input.value);
  }
  if (input.dataset.action === "change-theme") {
    state.theme = input.value;
    localStorage.setItem(THEME_KEY, state.theme);
    render();
  }
  if (input.dataset.action === "change-history-range") {
    state.historyRange = input.value;
    localStorage.setItem(HISTORY_RANGE_KEY, state.historyRange);
    render();
  }
});

document.addEventListener("keydown", (event) => {
  const control = event.target.closest('[data-action="edit-history-entry"]');
  if (!control || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  selectHistoryEntry(control.dataset.entryKey);
});

async function initialize() {
  if (!isTauri) {
    await loadDataFile("Browser preview CSV");
    return;
  }
  const recentPath = localStorage.getItem(APP_PATH_KEY);
  if (recentPath) await loadDataFile(recentPath);
  else render();
}

initialize();
