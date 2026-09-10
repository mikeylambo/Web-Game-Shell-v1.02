import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CompanionSessionManager } from "../../dist/index.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "0.0.0.0";
const streams = new Set();

const TASKS = {
  1: { kind: "sequence", title: "Sun Chamber", prompt: "Repeat the rune order: 2 → 4 → 1 → 3", buttons: [1, 2, 3, 4], solution: [2, 4, 1, 3] },
  2: { kind: "choice", title: "Moon Chamber", prompt: "Which phase follows waxing gibbous?", choices: ["New", "Full", "Waning Crescent"], solution: "Full" },
  3: { kind: "slider", title: "Wave Chamber", prompt: "Tune resonance to 73.", min: 0, max: 100, target: 73, tolerance: 4 },
  4: { kind: "code", title: "Crown Chamber", prompt: "Enter the rune made from North, East, West, South.", placeholder: "4 letters", solution: "NEWS" }
};

let run = createRun();

function createRun() {
  return {
    session: new CompanionSessionManager(),
    solved: new Set(),
    tasks: new Map(),
    bossHp: 0,
    bossMaxHp: 0,
    lastStrike: new Map()
  };
}

function publicTask(task) {
  const { solution: _solution, target: _target, tolerance: _tolerance, ...safe } = task;
  return safe;
}

function lanAddress() {
  for (const group of Object.values(networkInterfaces())) {
    for (const address of group ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

function joinUrl() {
  return `http://${lanAddress()}:${port}/phone?room=${run.session.roomCode}`;
}

function playerCount() {
  return run.session.listPlayers().length;
}

function gameSummary() {
  return {
    solvedCount: run.solved.size,
    totalPlayers: playerCount(),
    bossHp: run.bossHp,
    bossMaxHp: run.bossMaxHp
  };
}

function playerAuthorized(playerId, token) {
  try {
    return run.session.viewFor(playerId).player.reconnectToken === token;
  } catch {
    return false;
  }
}

function eventPayload(stream) {
  if (stream.role === "host") {
    const snapshot = run.session.hostSnapshot();
    const { privateStateByPlayer: _privateStateByPlayer, ...publicSnapshot } = snapshot;
    return { kind: "host", session: publicSnapshot, game: gameSummary(), joinUrl: joinUrl() };
  }
  if (!stream.playerId || !stream.token || !playerAuthorized(stream.playerId, stream.token)) {
    return { kind: "expired" };
  }
  return { kind: "player", session: run.session.viewFor(stream.playerId), game: gameSummary() };
}

function writeEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function publish() {
  for (const stream of [...streams]) {
    try {
      writeEvent(stream.response, eventPayload(stream));
    } catch {
      streams.delete(stream);
    }
  }
}

function setupPrivateRooms() {
  const assignments = {};
  for (const player of run.session.listPlayers()) {
    const task = structuredClone(TASKS[player.slot] ?? TASKS[1]);
    run.tasks.set(player.id, task);
    run.session.setPrivateState(player.id, "task", publicTask(task));
    run.session.setPrivateState(player.id, "solved", false);
    run.session.sendPrivate(player.id, "dungeon:room-entered", { title: task.title });
    assignments[player.id] = `chamber-${player.slot}`;
  }
  run.session.setPublicState("solvedCount", 0);
  run.session.split(assignments);
}

function taskSolved(task, payload) {
  if (task.kind === "sequence") {
    return Array.isArray(payload?.value) && JSON.stringify(payload.value) === JSON.stringify(task.solution);
  }
  if (task.kind === "choice") return payload?.value === task.solution;
  if (task.kind === "slider") {
    const value = Number(payload?.value);
    return Number.isFinite(value) && Math.abs(value - task.target) <= task.tolerance;
  }
  if (task.kind === "code") return String(payload?.value ?? "").trim().toUpperCase() === task.solution;
  return false;
}

function completePrivateTask(playerId, payload) {
  const task = run.tasks.get(playerId);
  if (!task || run.solved.has(playerId)) return;
  run.session.submitAction(playerId, "dungeon:solve-room", payload);

  if (!taskSolved(task, payload)) {
    run.session.sendPrivate(playerId, "dungeon:incorrect", { retry: true });
    return;
  }

  run.solved.add(playerId);
  run.session.setPrivateState(playerId, "solved", true);
  run.session.sendPrivate(playerId, "dungeon:solved", { title: task.title });
  run.session.setPublicState("solvedCount", run.solved.size);

  if (run.solved.size === playerCount()) {
    run.session.regroup();
    run.bossMaxHp = Math.max(8, playerCount() * 5);
    run.bossHp = run.bossMaxHp;
    run.session.setPublicState("encounter", "Vault Warden");
    run.session.setPublicState("bossHp", run.bossHp);
    run.session.setPublicState("bossMaxHp", run.bossMaxHp);
    run.session.resumeTogether();
    run.session.broadcast("dungeon:warden-awake", { name: "Vault Warden" });
  }
}

function strikeBoss(playerId) {
  if (run.session.phase() !== "together" || run.bossHp <= 0) return;
  const now = Date.now();
  const last = run.lastStrike.get(playerId) ?? 0;
  if (now - last < 350) return;
  run.lastStrike.set(playerId, now);
  run.session.submitAction(playerId, "dungeon:strike", { damage: 1 });
  run.bossHp = Math.max(0, run.bossHp - 1);
  run.session.setPublicState("bossHp", run.bossHp);
  if (run.bossHp === 0) {
    run.session.finish({ vault: "open", boss: "defeated", partySize: playerCount() });
  }
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_768) throw new Error("Request body too large");
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

function json(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function messageForError(error) {
  return error instanceof Error ? error.message : "Request failed";
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/meta") {
    return json(response, 200, { roomCode: run.session.roomCode, joinUrl: joinUrl(), phase: run.session.phase() });
  }

  if (request.method === "GET" && url.pathname === "/api/events") {
    const role = url.searchParams.get("role") === "host" ? "host" : "player";
    const playerId = url.searchParams.get("playerId") ?? undefined;
    const token = url.searchParams.get("token") ?? undefined;
    if (role === "player" && (!playerId || !token || !playerAuthorized(playerId, token))) {
      return json(response, 401, { error: "Player session expired" });
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    const stream = { role, playerId, token, response };
    streams.add(stream);
    writeEvent(response, eventPayload(stream));
    request.on("close", () => streams.delete(stream));
    return;
  }

  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
  const body = await readBody(request);

  if (url.pathname === "/api/join") {
    if (run.session.phase() !== "lobby") throw new Error("This run has already started");
    if (String(body.roomCode ?? "").trim().toUpperCase() !== run.session.roomCode) throw new Error("Room code does not match");
    const receipt = run.session.join(String(body.deviceId ?? ""), String(body.displayName ?? ""));
    publish();
    return json(response, 200, receipt);
  }

  if (url.pathname === "/api/reconnect") {
    const receipt = run.session.reconnect(String(body.token ?? ""), String(body.deviceId ?? ""));
    publish();
    return json(response, 200, receipt);
  }

  if (url.pathname === "/api/ready") {
    if (!playerAuthorized(body.playerId, body.token)) return json(response, 401, { error: "Player session expired" });
    run.session.setReady(body.playerId, body.ready !== false);
    publish();
    return json(response, 200, { ok: true });
  }

  if (url.pathname === "/api/start") {
    run.session.start(1);
    run.session.setPublicState("objective", "Open the sigil vault");
    publish();
    return json(response, 200, { ok: true });
  }

  if (url.pathname === "/api/enter-vault") {
    if (run.session.phase() !== "together" || run.session.hostSnapshot().publicState.encounter) throw new Error("Vault cannot be entered now");
    setupPrivateRooms();
    publish();
    return json(response, 200, { ok: true });
  }

  if (url.pathname === "/api/action") {
    if (!playerAuthorized(body.playerId, body.token)) return json(response, 401, { error: "Player session expired" });
    if (body.type === "dungeon:solve-room") completePrivateTask(body.playerId, body.payload ?? {});
    else if (body.type === "dungeon:strike") strikeBoss(body.playerId);
    else throw new Error("Unknown dungeon action");
    publish();
    return json(response, 200, { ok: true });
  }

  return json(response, 404, { error: "Unknown API route" });
}

const staticFiles = new Map([
  ["/", "host.html"],
  ["/host", "host.html"],
  ["/phone", "phone.html"],
  ["/host.js", "host.js"],
  ["/phone.js", "phone.js"],
  ["/styles.css", "styles.css"]
]);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
    const file = staticFiles.get(url.pathname);
    if (!file) return json(response, 404, { error: "Not found" });
    const data = await readFile(join(here, file));
    response.writeHead(200, { "content-type": contentTypes[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(data);
  } catch (error) {
    json(response, 400, { error: messageForError(error) });
  }
});

const keepAlive = setInterval(() => {
  for (const stream of streams) stream.response.write(": keepalive\n\n");
}, 15_000);
keepAlive.unref();

server.listen(port, host, () => {
  console.log(`Companion Dungeon host: http://localhost:${port}`);
  console.log(`Phone join: ${joinUrl()}`);
  console.log(`Room code: ${run.session.roomCode}`);
});
