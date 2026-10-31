// Generic undo/redo stack. Kept pure so the editor's history rules are
// testable without mounting React.

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 100;

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

export function pushHistory<T>(
  h: HistoryState<T>,
  present: T,
  coalesce: boolean,
  limit = HISTORY_LIMIT,
): HistoryState<T> {
  if (present === h.present) return h;
  return {
    past: coalesce ? h.past : [...h.past.slice(-(limit - 1)), h.present],
    present,
    future: [],
  };
}

export function undoHistory<T>(h: HistoryState<T>, limit = HISTORY_LIMIT): HistoryState<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future].slice(0, limit),
  };
}

export function redoHistory<T>(h: HistoryState<T>, limit = HISTORY_LIMIT): HistoryState<T> {
  if (h.future.length === 0) return h;
  return {
    past: [...h.past.slice(-(limit - 1)), h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
