const app = document.querySelector("#app");
const STORAGE_KEY = "slu-companion-dungeon-player";
const DEVICE_KEY = "slu-companion-device-id";
let receipt = null;
let latest = null;
let events = null;
let sequenceInput = [];
let busy = false;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function saveReceipt(value) {
  receipt = value;
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  else localStorage.removeItem(STORAGE_KEY);
}

function storedReceipt() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"); }
  catch { return null; }
}

async function post(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload;
}

function auth() {
  return { playerId: receipt.id, token: receipt.reconnectToken };
}

function joinScreen(message = "") {
  const roomFromUrl = new URL(location.href).searchParams.get("room") ?? "";
  app.innerHTML = `<section class="phone-card">
    <div class="eyebrow">The Sigil Vault</div>
    <h1>Join the party</h1>
    <p class="muted">Your phone is your private screen.</p>
    <form id="join-form" class="form-stack">
      <label>Room code<input name="room" type="text" inputmode="text" autocomplete="off" maxlength="8" value="${escapeHtml(roomFromUrl)}" required /></label>
      <label>Name<input name="name" type="text" autocomplete="nickname" maxlength="24" placeholder="Player" /></label>
      <button class="primary phone-action" type="submit">Join</button>
    </form>
    <div class="feedback status-bad">${escapeHtml(message)}</div>
  </section>`;
}

function latestFeedback(view) {
  const messages = view.messages ?? [];
  const message = [...messages].reverse().find((item) => item.type === "dungeon:incorrect" || item.type === "dungeon:solved");
  if (!message) return "";
  return message.type === "dungeon:solved" ? "Chamber resolved. Return your eyes to the shared screen." : "That did not open the seal. Try again.";
}

function meta(view) {
  return `<div class="phone-meta"><span>P${view.player.slot} · ${escapeHtml(view.player.displayName)}</span><span class="${view.player.connected ? "status-good" : "status-bad"}">${view.player.connected ? "Connected" : "Offline"}</span></div>`;
}

function lobby(view) {
  return `<section class="phone-card">${meta(view)}
    <div class="eyebrow">Lobby</div><h2>${view.player.ready ? "Ready." : "Join confirmed."}</h2>
    <p class="muted">Keep this screen open. The host will begin when the party is ready.</p>
    <button class="primary phone-action" data-action="ready" ${view.player.ready ? "disabled" : ""}>${view.player.ready ? "Ready" : "Ready Up"}</button>
  </section>`;
}

function waiting(view) {
  const encounter = view.publicState.encounter;
  if (encounter) return boss(view);
  return `<section class="phone-card">${meta(view)}
    <div class="eyebrow">Shared World</div><h2>Eyes up.</h2>
    <p class="muted">Your party is together. Follow the communal screen until your private chamber opens.</p>
  </section>`;
}

function sequenceTask(task, view) {
  return `<p class="muted">${escapeHtml(task.prompt)}</p>
    <div class="task-grid">${task.buttons.map((value) => `<button data-sequence="${value}">${value}</button>`).join("")}</div>
    <div class="feedback">Entered: ${sequenceInput.length ? sequenceInput.join(" · ") : "—"}</div>`;
}

function choiceTask(task) {
  return `<p class="muted">${escapeHtml(task.prompt)}</p>
    <div class="choice-grid">${task.choices.map((value) => `<button data-choice="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("")}</div>`;
}

function sliderTask(task) {
  return `<p class="muted">${escapeHtml(task.prompt)}</p>
    <div id="slider-value" class="slider-value">50</div>
    <input id="resonance" type="range" min="${task.min}" max="${task.max}" value="50" />
    <button class="primary phone-action" data-action="submit-slider">Lock Resonance</button>`;
}

function codeTask(task) {
  return `<p class="muted">${escapeHtml(task.prompt)}</p>
    <form id="code-form" class="form-stack">
      <input name="code" type="text" autocapitalize="characters" autocomplete="off" maxlength="12" placeholder="${escapeHtml(task.placeholder)}" required />
      <button class="primary phone-action" type="submit">Submit Rune</button>
    </form>`;
}

function privateRoom(view) {
  const task = view.privateState.task;
  const solved = view.privateState.solved === true;
  if (!task) return `<section class="phone-card">${meta(view)}<h2>Entering chamber…</h2></section>`;
  if (solved) return `<section class="phone-card">${meta(view)}<div class="eyebrow">${escapeHtml(task.title)}</div><h2>Seal released.</h2><p class="muted">Your work here is complete. The others may still be inside.</p></section>`;
  let control = "";
  if (task.kind === "sequence") control = sequenceTask(task, view);
  if (task.kind === "choice") control = choiceTask(task);
  if (task.kind === "slider") control = sliderTask(task);
  if (task.kind === "code") control = codeTask(task);
  return `<section class="phone-card">${meta(view)}
    <div class="eyebrow">Private Chamber</div><h2>${escapeHtml(task.title)}</h2>
    ${control}<div class="feedback">${escapeHtml(latestFeedback(view))}</div>
  </section>`;
}

function boss(view) {
  const hp = Number(view.publicState.bossHp ?? 0);
  const max = Math.max(1, Number(view.publicState.bossMaxHp ?? 1));
  return `<section class="phone-card">${meta(view)}
    <div class="eyebrow">Shared Encounter</div><h2>Vault Warden</h2>
    <p class="muted">The private chambers are gone. Your phone now contributes to the same fight everyone sees.</p>
    <div class="slider-value">${hp}/${max}</div>
    <button class="primary phone-action strike" data-action="strike">Strike</button>
  </section>`;
}

function results(view) {
  return `<section class="phone-card">${meta(view)}
    <div class="eyebrow">Run Complete</div><h2>The vault is open.</h2>
    <p class="muted">Shared truth and private truth rejoined successfully.</p>
  </section>`;
}

function render(snapshot) {
  latest = snapshot;
  if (snapshot.kind === "expired") {
    events?.close();
    saveReceipt(null);
    return joinScreen("Your previous player session expired.");
  }
  const view = snapshot.session;
  if (view.phase === "lobby") app.innerHTML = lobby(view);
  else if (view.phase === "split") app.innerHTML = privateRoom(view);
  else if (view.phase === "results") app.innerHTML = results(view);
  else app.innerHTML = waiting(view);
}

function connectEvents() {
  events?.close();
  events = new EventSource(`/api/events?role=player&playerId=${encodeURIComponent(receipt.id)}&token=${encodeURIComponent(receipt.reconnectToken)}`);
  events.onmessage = (event) => render(JSON.parse(event.data));
  events.onerror = () => {
    if (latest) {
      const badge = app.querySelector(".status-good");
      if (badge) { badge.textContent = "Reconnecting"; badge.className = "status-bad"; }
    }
  };
}

async function submitAction(type, payload) {
  if (busy) return;
  busy = true;
  try { await post("/api/action", { ...auth(), type, payload }); }
  catch (error) { window.alert(error instanceof Error ? error.message : "Action failed"); }
  finally { busy = false; }
}

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (event.target.id === "join-form") {
    const data = new FormData(event.target);
    try {
      const next = await post("/api/join", {
        roomCode: String(data.get("room") ?? "").toUpperCase(),
        displayName: String(data.get("name") ?? ""),
        deviceId: deviceId()
      });
      saveReceipt(next);
      connectEvents();
    } catch (error) {
      joinScreen(error instanceof Error ? error.message : "Could not join");
    }
  }
  if (event.target.id === "code-form") {
    const data = new FormData(event.target);
    await submitAction("dungeon:solve-room", { value: String(data.get("code") ?? "") });
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "resonance") {
    const output = app.querySelector("#slider-value");
    if (output) output.textContent = event.target.value;
  }
});

app.addEventListener("click", async (event) => {
  const sequence = event.target.closest("button[data-sequence]");
  if (sequence) {
    sequenceInput.push(Number(sequence.dataset.sequence));
    if (sequenceInput.length === 4) {
      const value = [...sequenceInput];
      sequenceInput = [];
      await submitAction("dungeon:solve-room", { value });
    } else if (latest) render(latest);
    return;
  }

  const choice = event.target.closest("button[data-choice]");
  if (choice) return submitAction("dungeon:solve-room", { value: choice.dataset.choice });

  const action = event.target.closest("button[data-action]")?.dataset.action;
  if (action === "ready") {
    try { await post("/api/ready", { ...auth(), ready: true }); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Could not ready"); }
  }
  if (action === "submit-slider") {
    const value = Number(app.querySelector("#resonance")?.value ?? 0);
    await submitAction("dungeon:solve-room", { value });
  }
  if (action === "strike") await submitAction("dungeon:strike", {});
});

async function boot() {
  joinScreen();
  const previous = storedReceipt();
  if (!previous?.reconnectToken) return;
  try {
    const next = await post("/api/reconnect", { token: previous.reconnectToken, deviceId: deviceId() });
    saveReceipt(next);
    connectEvents();
  } catch {
    saveReceipt(null);
  }
}

boot();
