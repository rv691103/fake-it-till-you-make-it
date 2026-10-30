const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true }));

const rooms = new Map();
const prompts = [
  "I once met a famous person in a very unexpected place.",
  "I can name five countries in ten seconds.",
  "I have eaten something most people would never try.",
  "I once got lost in a place I thought I knew well.",
  "I have a hidden talent that surprises people.",
  "I have stayed awake for more than 24 hours.",
  "I have broken something and successfully blamed it on bad luck.",
  "I have done something brave that I almost regret.",
  "I can do a useful trick that most people cannot.",
  "I have had a very strange coincidence happen to me."
];

function cleanName(value) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, 18) || "Player";
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, score: p.score, connected: p.connected
    })),
    prompt: room.current ? room.current.prompt : null,
    storyteller: room.current ? room.current.storyteller : null,
    statement: room.current && room.current.revealed ? room.current.statement : null,
    votesCount: room.current ? Object.keys(room.current.votes).length : 0,
    totalVoters: room.current ? [...room.players.values()].filter(p => p.connected && p.id !== room.current.storytellerId).length : 0,
    result: room.current && room.current.revealed ? {
      truth: room.current.truth,
      votes: room.current.votes,
      storytellerName: room.players.get(room.current.storytellerId)?.name || "Player",
      statement: room.current.statement
    } : null
  };
}
function emitRoom(room) { io.to(room.code).emit("room:update", publicRoom(room)); }
function errorTo(socket, message) { socket.emit("app:error", message); }

function startRound(room) {
  if (room.round >= room.maxRounds) {
    room.status = "finished";
    room.current = null;
    emitRoom(room);
    return;
  }
  room.round += 1;
  const players = [...room.players.values()].filter(p => p.connected);
  if (players.length < 2) { room.status = "waiting"; emitRoom(room); return; }
  const storyteller = players[(room.round - 1) % players.length];
  room.status = "story";
  room.current = {
    prompt: prompts[Math.floor(Math.random() * prompts.length)],
    storytellerId: storyteller.id,
    storyteller: storyteller.name,
    statement: null,
    truth: null,
    votes: {},
    revealed: false
  };
  emitRoom(room);
  io.to(room.code).emit("round:private", { storytellerId: storyteller.id });
}

io.on("connection", socket => {
  socket.on("room:create", ({ name, maxRounds } = {}) => {
    let code = makeCode();
    while (rooms.has(code)) code = makeCode();
    const player = { id: socket.id, name: cleanName(name), score: 0, connected: true };
    const room = {
      code, hostId: socket.id, players: new Map([[socket.id, player]]),
      status: "waiting", round: 0,
      maxRounds: Math.max(3, Math.min(10, Number(maxRounds) || 5)),
      current: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room:joined", { code, playerId: socket.id });
    emitRoom(room);
  });

  socket.on("room:join", ({ name, code } = {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return errorTo(socket, "Room not found. Check the code and try again.");
    if (room.status !== "waiting") return errorTo(socket, "This game has already started.");
    if (room.players.size >= 8) return errorTo(socket, "This room is full (maximum 8 players).");
    const player = { id: socket.id, name: cleanName(name), score: 0, connected: true };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.roomCode = code;
    socket.emit("room:joined", { code, playerId: socket.id });
    emitRoom(room);
  });

  socket.on("game:start", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return errorTo(socket, "Only the host can start the game.");
    if (room.players.size < 2) return errorTo(socket, "Invite at least one more player first.");
    if (room.status !== "waiting") return;
    startRound(room);
  });

  socket.on("story:submit", ({ statement, truth } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "story" || !room.current) return;
    if (room.current.storytellerId !== socket.id) return errorTo(socket, "Only the storyteller can submit this round.");
    statement = String(statement || "").trim().slice(0, 240);
    if (statement.length < 5) return errorTo(socket, "Write a statement with at least 5 characters.");
    room.current.statement = statement;
    room.current.truth = truth === true;
    room.status = "voting";
    emitRoom(room);
  });

  socket.on("vote:submit", ({ vote } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.status !== "voting" || !room.current) return;
    if (socket.id === room.current.storytellerId) return errorTo(socket, "The storyteller cannot vote.");
    if (!room.players.has(socket.id)) return;
    if (room.current.votes[socket.id] !== undefined) return errorTo(socket, "You have already voted.");
    room.current.votes[socket.id] = vote === true;
    const eligible = [...room.players.values()].filter(p => p.connected && p.id !== room.current.storytellerId);
    const submitted = Object.keys(room.current.votes).length;
    if (submitted >= eligible.length) {
      const yes = Object.values(room.current.votes).filter(Boolean).length;
      const majorityThinksTruth = yes > Object.values(room.current.votes).length / 2;
      const actualTruth = room.current.truth;
      const storyteller = room.players.get(room.current.storytellerId);
      if (storyteller) {
        if (majorityThinksTruth !== actualTruth) storyteller.score += 2;
        else storyteller.score += 1;
      }
      for (const [id, v] of Object.entries(room.current.votes)) {
        const p = room.players.get(id);
        if (p && v === actualTruth) p.score += 1;
      }
      room.current.revealed = true;
      room.status = "result";
      emitRoom(room);
    } else emitRoom(room);
  });

  socket.on("round:next", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "result") return;
    startRound(room);
  });

  socket.on("game:restart", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.status !== "finished") return;
    room.players.forEach(p => p.score = 0);
    room.round = 0;
    room.status = "waiting";
    room.current = null;
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) p.connected = false;
    if (room.hostId === socket.id) {
      const next = [...room.players.values()].find(x => x.connected);
      if (next) room.hostId = next.id;
    }
    if ([...room.players.values()].every(x => !x.connected)) rooms.delete(code);
    else emitRoom(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Fake It Till You Make It running on port ${PORT}`));
