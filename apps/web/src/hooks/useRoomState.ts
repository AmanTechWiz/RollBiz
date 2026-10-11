import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent } from "@rollbiz/engine";
import { createSnapshotter, type GameRoom, type RoomView } from "../lib/colyseus";

/**
 * Re-renders on every state patch with a plain snapshot of room.state.
 * Fine for a small board game; switch to `Callbacks.get(room)` (from @colyseus/sdk)
 * if fine-grained listeners or animations per field are needed later.
 */
export function useRoomState(room: GameRoom): RoomView {
  const snapshot = useMemo(createSnapshotter, []);
  const [view, setView] = useState(() => snapshot(room.state));

  useEffect(() => {
    const onChange = (state: unknown) => setView(snapshot(state));
    room.onStateChange(onChange);
    setView(snapshot(room.state));
    return () => room.onStateChange.remove(onChange);
  }, [room, snapshot]);

  return view;
}

export type LogEntry = { id: number; event: GameEvent };
export type Toast = { id: number; message: string };

const MAX_LOG = 40;
const TOAST_MS = 4000;

function isEvent(value: unknown): value is GameEvent {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

/** Collects `events` messages into a short activity log and `error` messages into a toast. */
export function useRoomFeed(room: GameRoom) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    const offEvents = room.onMessage("events", (payload: { events?: unknown }) => {
      const events = Array.isArray(payload?.events) ? payload.events.filter(isEvent) : [];
      if (events.length === 0) return;
      setLog((prev) => [...prev, ...events.map((event) => ({ id: ++counter.current, event }))].slice(-MAX_LOG));
    });
    const offError = room.onMessage("error", (payload: { message?: unknown }) => {
      const message = typeof payload?.message === "string" ? payload.message : "Something went wrong";
      setToast({ id: ++counter.current, message });
    });
    return () => {
      offEvents();
      offError();
    };
  }, [room]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const dismissToast = useCallback(() => setToast(null), []);
  return { log, toast, dismissToast };
}
