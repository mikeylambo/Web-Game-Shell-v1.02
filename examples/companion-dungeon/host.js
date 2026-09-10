const app = document.querySelector("#app");
let latest = null;
let requestPending = false;

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

async function post(path, body = {}) {
  if (requestPending) return;
  requestPending = true;
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Request failed");
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Request failed");
  } finally {
    requestPending = false;
  }
}

function playerCards(players, solvedCount = 0, split = false) {
  const bySlot = new Map(players.map((player) => [player.slot, player]));
  return Array.from({ length: 4 }, (_, index) => {
    const slot = index + 1;
    const player = bySlot.get(slot);
    if (!player) return `<article class="player-card empty"><div class="player-state">P${slot}</div><div class="muted">Waiting for player</div></article>`;
    const status = split
      ? player.view === "private" ? "Inside chamber" : "Regrouped"
      : player.ready ? "Ready" : "Not ready";
    return `<article class="player-card">
      <div class="player-state">P${slot} · ${player.connected ? "Connected" : "Offline"}</div>
      <div class="player-name">${escapeHtml(player.displayName)}</div>
      <div class="${player.connected ? "status-good" : "status-bad"}">${status}</div>
    </article>`;
  }).join("");
}

function header(session, joinUrl) {
  return `<header class="host-header">
    <div>
      <div class="eyebrow">SLU Companion Adventure · Dungeon Certification</div>
      <h1 class="host-title">THE SIGIL VAULT</h1>
    </div>
    <div class="room-block">
      <div class="eyebrow">Room Code</div>
      <div class="room-code">${escapeHtml(session.roomCode)}</div>
      <div class="join-url">${escapeHtml(joinUrl)}</div>
    </div>
  </header>`;
}

function lobby(session) {
  const players = session.players;
  const allReady = players.length > 0 && players.every((player) => player.connected && player.ready);
  return `<section class="host-stage"><div class="stage-content">
    <div class="eyebrow">Assemble</div>
    <h2 class="phase-title">Bring the party together.</h2>
    <p class="phase-copy">Open the phone URL, enter the room code, then ready up. One player is enough for development; the intended test is two to four.</p>
    <div class="player-grid">${playerCards(players)}</div>
    <div class="host-actions"><button class="primary" data-action="start" ${allReady ? "" : "disabled"}>Begin Dungeon</button></div>
  </div></section>`;
}

function courtyard(session) {
  return `<section class="host-stage"><div class="stage-content">
    <div class="eyebrow">Shared World</div>
    <h2 class="phase-title">The Sigil Vault is sealed.</h2>
    <p class="phase-copy">Everyone is together on the communal screen. Entering the vault will split each player into a private chamber on their phone.</p>
    <div class="player-grid">${playerCards(session.players)}</div>
    <div class="host-actions"><button class="primary" data-action="enter-vault">Enter the Vault</button></div>
  </div></section>`;
}

function split(session, game) {
  const solved = Number(session.publicState.solvedCount ?? game.solvedCount ?? 0);
  return `<section class="host-stage"><div class="stage-content">
    <div class="eyebrow">Party Split</div>
    <h2 class="phase-title">Four chambers. Private truths.</h2>
    <p class="phase-copy">Each player now sees a different interaction. The shared display knows only who has cleared a chamber—not the solution.</p>
    <div class="player-grid">${playerCards(session.players, solved, true)}</div>
    <div class="vault-progress">
      ${Array.from({ length: Math.max(1, game.totalPlayers) }, (_, index) => `<div class="sigil ${index < solved ? "solved" : ""}">${index < solved ? "◆" : "◇"}</div>`).join("")}
    </div>
    <p class="phase-copy"><span class="progress-number">${solved}/${game.totalPlayers}</span> chambers resolved</p>
  </div></section>`;
}

function boss(session, game) {
  const max = Math.max(1, Number(game.bossMaxHp ?? 1));
  const hp = Math.max(0, Number(game.bossHp ?? 0));
  const percent = Math.round((hp / max) * 100);
  return `<section class="host-stage"><div class="stage-content">
    <div class="eyebrow">Regrouped · Shared Encounter</div>
    <h2 class="boss-name">Vault Warden</h2>
    <p class="phase-copy">The party has reunited. Personal screens are now action surfaces feeding one communal fight.</p>
    <div class="boss-wrap">
      <div class="health-track"><div class="health-fill" style="width:${percent}%"></div></div>
      <p class="muted">${hp} / ${max}</p>
    </div>
    <div class="player-grid">${playerCards(session.players)}</div>
  </div></section>`;
}

function results(session) {
  return `<section class="host-stage"><div class="stage-content">
    <div class="eyebrow">Results</div>
    <div class="result-mark">◆</div>
    <h2 class="phase-title">The vault is open.</h2>
    <p class="phase-copy">The full companion loop completed: join → shared world → private rooms → regroup → shared encounter → results.</p>
    <div class="player-grid">${playerCards(session.players)}</div>
    <p class="muted">Restart the demo server for a fresh room.</p>
  </div></section>`;
}

function render(snapshot) {
  latest = snapshot;
  const { session, game, joinUrl } = snapshot;
  let stage;
  if (session.phase === "lobby") stage = lobby(session);
  else if (session.phase === "split") stage = split(session, game);
  else if (session.phase === "results") stage = results(session);
  else if (session.publicState.encounter) stage = boss(session, game);
  else stage = courtyard(session);
  app.innerHTML = `${header(session, joinUrl)}${stage}`;
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !latest) return;
  if (button.dataset.action === "start") post("/api/start");
  if (button.dataset.action === "enter-vault") post("/api/enter-vault");
});

const events = new EventSource("/api/events?role=host");
events.onmessage = (event) => render(JSON.parse(event.data));
events.onerror = () => {
  if (!latest) app.innerHTML = `<section class="host-stage"><div class="stage-content"><h1>Reconnecting…</h1><p class="muted">The host stream is temporarily unavailable.</p></div></section>`;
};
