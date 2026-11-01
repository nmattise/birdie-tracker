export type Player = { id: string; name: string; values: Record<string, string> };
export type Category = { id: string; name: string };
export type Board = { title: string; players: Player[]; categories: Category[] };

export const starter: Board = {
  title: 'Saturday skins',
  categories: [
    { id: 'cat-1', name: 'Cat 1' },
    { id: 'cat-2', name: 'Cat 2' },
    { id: 'cat-3', name: 'Cat 3' },
    { id: 'cat-4', name: 'Cat 4' },
  ],
  players: [
    { id: 'player-1', name: 'Alex Morgan', values: { 'cat-1': '4', 'cat-2': '3', 'cat-3': '5', 'cat-4': '2' } },
    { id: 'player-2', name: 'Jordan Lee', values: { 'cat-1': '5', 'cat-2': '4', 'cat-3': '4', 'cat-4': '3' } },
    { id: 'player-3', name: 'Sam Rivera', values: { 'cat-1': '3', 'cat-2': '5', 'cat-3': '4', 'cat-4': '4' } },
    { id: 'player-4', name: 'Casey Park', values: { 'cat-1': '4', 'cat-2': '4', 'cat-3': '3', 'cat-4': '5' } },
  ],
};

/** Google Apps Script web app URL. Set VITE_SHEETS_ENDPOINT to turn sync on. */
const endpoint = (import.meta.env.VITE_SHEETS_ENDPOINT as string | undefined)?.trim() ?? '';
export const syncEnabled = endpoint.length > 0;

const ID_PARAM = 'board';
const cacheKey = (id: string) => `clubhouse-board-v1:${id}`;
const legacyKey = 'clubhouse-board-v1';

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function isPlayer(value: unknown): value is Player {
  if (!value || typeof value !== 'object') return false;
  const player = value as Partial<Player>;
  return typeof player.id === 'string' && typeof player.name === 'string' && !!player.values && typeof player.values === 'object';
}

function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== 'object') return false;
  const category = value as Partial<Category>;
  return typeof category.id === 'string' && typeof category.name === 'string';
}

/** Accepts anything that looks like a card, filling in a title if one is missing. */
function toBoard(value: unknown): Board | null {
  if (!value || typeof value !== 'object') return null;
  const board = value as Partial<Board>;
  if (!Array.isArray(board.players) || !board.players.every(isPlayer)) return null;
  if (!Array.isArray(board.categories) || !board.categories.every(isCategory)) return null;
  return {
    title: typeof board.title === 'string' ? board.title : starter.title,
    players: board.players,
    categories: board.categories,
  };
}

/** Reads the board id from the URL, creating a short shareable one on first visit. */
export function resolveBoardId(): { id: string; isNew: boolean } {
  const params = new URLSearchParams(window.location.search);
  const existing = params.get(ID_PARAM)?.trim();
  if (existing) return { id: existing, isNew: false };

  const id = uid().replace(/-/g, '').slice(0, 12);
  params.set(ID_PARAM, id);
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
  return { id, isNew: true };
}

/** Instant, offline-safe cache; returns null when nothing valid is stored. */
export function readCache(id: string): Board | null {
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return toBoard(parsed);
  } catch {
    return null;
  }
}

export function writeCache(id: string, board: Board): boolean {
  try {
    localStorage.setItem(cacheKey(id), JSON.stringify(board));
    return true;
  } catch {
    return false;
  }
}

/** One-time pickup of a card saved before boards were shared by id. */
export function readLegacyBoard(): Board | null {
  try {
    const raw = localStorage.getItem(legacyKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return toBoard(parsed);
  } catch {
    return null;
  }
}

/**
 * Apps Script answers with HTTP 200 even when the script throws, and with an HTML
 * login page when the deployment is not public, so the body must be inspected
 * rather than just the status code.
 */
async function call(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${endpoint}${path}`, init);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from the sheet endpoint — ${text.slice(0, 300)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `The sheet endpoint returned ${response.headers.get('content-type') ?? 'unknown content'} instead of JSON. ` +
      'Usually the Web app is not deployed with access "Anyone", you are using the /dev URL instead of /exec, ' +
      `or the script threw. Response started with: ${text.slice(0, 200)}`,
    );
  }

  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`Apps Script reported: ${String((parsed as { error: unknown }).error)}`);
  }

  return parsed;
}

export async function fetchBoard(id: string): Promise<Board | null> {
  const data = await call(`?id=${encodeURIComponent(id)}`);
  return toBoard(data);
}

/**
 * Apps Script always answers POST with a 302 to script.googleusercontent.com, and
 * Safari refuses to follow that redirect under CORS. The response was never used,
 * so send the write outside CORS and confirm it with a read instead.
 */
export async function pushBoard(id: string, board: Board): Promise<void> {
  await fetch(endpoint, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ id, board }),
  });
}

/** Key-order-independent serialization, for comparing cards across the wire. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Writes the card, then reads it back so the caller knows it actually landed. */
export async function saveBoard(id: string, board: Board): Promise<void> {
  await pushBoard(id, board);
  const stored = await fetchBoard(id);
  if (!stored) throw new Error('The sheet has no copy of this card yet — will retry.');
  if (stable(stored) !== stable(board)) {
    throw new Error('The sheet returned a different card than the one just written — will retry.');
  }
}

export function shareLink(id: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(ID_PARAM, id);
  url.hash = '';
  return url.toString();
}
