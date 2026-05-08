// Simple in-process event bus for SSE realtime updates.
// Isolated here so it can be replaced with Redis pub/sub or websockets later.

type Listener = (data: unknown) => void;

declare global {
  // eslint-disable-next-line no-var
  var __wcBus: Map<string, Set<Listener>> | undefined;
}

const bus: Map<string, Set<Listener>> =
  global.__wcBus ?? (global.__wcBus = new Map());

export function publish(channel: string, data: unknown) {
  const listeners = bus.get(channel);
  if (!listeners) return;
  for (const fn of listeners) {
    try {
      fn(data);
    } catch {
      // ignore listener errors
    }
  }
}

export function subscribe(channel: string, fn: Listener): () => void {
  let set = bus.get(channel);
  if (!set) {
    set = new Set();
    bus.set(channel, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

export function leagueChannel(leagueId: string) {
  return `league:${leagueId}`;
}

export function trashChannel(leagueId: string) {
  return `trash:${leagueId}`;
}
