// Rooms: every visitor of a public deploy gets an isolated Runtime (its own simulated world,
// cases and audit log). Idle rooms are evicted. A room id can be shared via ?room= to co-watch.

import type { Response } from "express";
import { Runtime } from "./core/runtime.js";
import { archive } from "./core/archive.js";
import type { ChatMessage } from "./core/types.js";

type OutboundHook = (room: Room, m: ChatMessage) => void;
const outboundHooks: OutboundHook[] = [];
export const onAgentMessage = (h: OutboundHook) => outboundHooks.push(h);

export interface Room {
  id: string;
  rt: Runtime;
  clients: Set<Response>;
  lastSeen: number;
}

const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 200);
const IDLE_MS = 2 * 60 * 60 * 1000;
const rooms = new Map<string, Room>();

export const cleanRoomId = (raw: unknown) => {
  const s = String(raw ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return s || "default";
};

function makeRuntime(room: Room, keep?: Runtime["config"]) {
  const rt = new Runtime({
    pacingMs: Number(process.env.PACING_MS ?? 450),
    brain: (keep?.brain ?? (process.env.BRAIN as Runtime["config"]["brain"])) || "auto",
    shadow: keep?.shadow ?? false,
  });
  // Archive key is per runtime instance, so a reset room never collides with its earlier audit chain.
  const key = `${room.id}/${Date.now().toString(36)}`;
  const push = (type: string, data: unknown) => {
    const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of room.clients) c.write(line);
  };
  let pending = false;
  rt.on("update", () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      push("state", rt.snapshot());
      archive.saveCases(key, [...rt.cases.values()]);
    }, 60);
  });
  rt.on("trace", (e) => push("trace", e));
  rt.on("message", (m: ChatMessage) => {
    push("message", m);
    for (const h of outboundHooks) h(room, m);
  });
  rt.on("audit", (e) => archive.saveAudit(key, e));
  rt.on("world", (e) => e.type === "soundbox.announce" && push("soundbox", e.announcement));
  return rt;
}

export function getRoom(id: string): Room {
  let room = rooms.get(id);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) evict(true);
    room = { id, rt: undefined as unknown as Runtime, clients: new Set(), lastSeen: Date.now() };
    room.rt = makeRuntime(room);
    rooms.set(id, room);
  }
  room.lastSeen = Date.now();
  return room;
}

export function resetRoom(room: Room) {
  const keep = { ...room.rt.config };
  room.rt.removeAllListeners();
  room.rt = makeRuntime(room, keep);
  const line = `event: state\ndata: ${JSON.stringify(room.rt.snapshot())}\n\n`;
  for (const c of room.clients) c.write(line);
}

function evict(force = false) {
  const now = Date.now();
  const idle = [...rooms.values()].filter((r) => r.clients.size === 0).sort((a, b) => a.lastSeen - b.lastSeen);
  for (const r of idle) {
    if (force || now - r.lastSeen > IDLE_MS) {
      r.rt.removeAllListeners();
      rooms.delete(r.id);
      if (force) return;
    }
  }
}

setInterval(() => evict(false), 10 * 60 * 1000).unref();

export const roomCount = () => rooms.size;
