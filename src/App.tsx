import { useEffect, useRef, useState } from 'react';
import { Flag, Pencil, Plus, Settings2, Share2, Trash2, X } from 'lucide-react';
import {
  fetchBoard, pushBoard, readCache, readLegacyBoard, resolveBoardId, shareLink,
  starter, syncEnabled, uid, writeCache,
  type Board, type Category, type Player,
} from './boardApi';

type SyncState = 'loading' | 'saved' | 'saving' | 'offline' | 'local';

const syncLabel: Record<SyncState, string> = {
  loading: 'LOADING CARD',
  saved: 'SAVED TO SHARED CARD',
  saving: 'SAVING…',
  offline: 'OFFLINE — SAVED HERE',
  local: 'SAVED ON THIS DEVICE',
};

// Resolved once per page load; adds ?board=<id> to the URL on the first visit.
const { id: boardId, isNew } = resolveBoardId();

function initialBoard(): Board {
  const cached = readCache(boardId);
  if (cached) return cached;
  // Pick up a card saved before boards were shared by id.
  if (isNew) return readLegacyBoard() ?? starter;
  return starter;
}

const isEditing = () => {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
};

function App() {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [customizing, setCustomizing] = useState(false);
  const [notice, setNotice] = useState('');
  const [syncState, setSyncState] = useState<SyncState>(syncEnabled ? 'loading' : 'local');
  const boardRef = useRef(board);
  const savedRef = useRef('');        // JSON last confirmed on the sheet
  const hydratedRef = useRef(false);  // don't push until the server copy is known
  const timerRef = useRef<number>();

  // Load the shared copy once, then keep the sheet as the source of truth.
  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchBoard(boardId);
        if (cancelled) return;
        if (remote) {
          savedRef.current = JSON.stringify(remote);
          setBoard(remote);
        }
        hydratedRef.current = true;
        setSyncState('saved');
        // A brand new board needs a first row before anyone can join it.
        if (!remote) await save(boardRef.current);
      } catch {
        if (cancelled) return;
        hydratedRef.current = true;
        setSyncState('offline');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function save(next: Board) {
    const json = JSON.stringify(next);
    if (json === savedRef.current) return;
    setSyncState('saving');
    try {
      await pushBoard(boardId, next);
      savedRef.current = json;
      setSyncState('saved');
    } catch {
      setSyncState('offline');
    }
  }

  // Cache locally right away, then debounce a write to the sheet.
  useEffect(() => {
    boardRef.current = board;
    if (!writeCache(boardId, board)) setNotice('Unable to save changes on this device');
    if (!syncEnabled || !hydratedRef.current) return;
    if (JSON.stringify(board) === savedRef.current) return;

    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void save(board); }, 800);
    return () => window.clearTimeout(timerRef.current);
  }, [board]);

  // Pick up other players' edits, but never while this device is mid-edit.
  // Doubles as the retry loop for anything that failed to save while offline.
  useEffect(() => {
    if (!syncEnabled) return;
    const interval = window.setInterval(async () => {
      if (document.hidden || !hydratedRef.current) return;
      if (JSON.stringify(boardRef.current) !== savedRef.current) {
        if (!isEditing()) void save(boardRef.current);
        return;
      }
      if (isEditing()) return;
      try {
        const remote = await fetchBoard(boardId);
        if (!remote || isEditing()) return;
        if (JSON.stringify(boardRef.current) !== savedRef.current) return;
        const json = JSON.stringify(remote);
        if (json === savedRef.current) return;
        savedRef.current = json;
        setBoard(remote);
        setNotice('Scorecard updated');
      } catch { /* keep the local copy on a failed refresh */ }
    }, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const copyShareLink = async () => {
    const link = shareLink(boardId);
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Share link copied');
    } catch {
      window.prompt('Copy this link to share the card', link);
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const updatePlayer = (id: string, update: (player: Player) => Player) => setBoard((current) => ({ ...current, players: current.players.map((player) => player.id === id ? update(player) : player) }));
  const updateCategory = (id: string, update: (category: Category) => Category) => setBoard((current) => ({ ...current, categories: current.categories.map((category) => category.id === id ? update(category) : category) }));
  const addPlayer = () => {
    const id = uid();
    setBoard((current) => ({ ...current, players: [...current.players, { id, name: `Player ${current.players.length + 1}`, values: Object.fromEntries(current.categories.map((category) => [category.id, ''])) }] }));
    setNotice('Player added');
  };
  const addCategory = () => {
    const id = uid();
    setBoard((current) => ({ ...current, categories: [...current.categories, { id, name: `Cat ${current.categories.length + 1}` }], players: current.players.map((player) => ({ ...player, values: { ...player.values, [id]: '' } })) }));
    setNotice('Category added');
  };
  const removePlayer = (id: string) => setBoard((current) => ({ ...current, players: current.players.filter((player) => player.id !== id) }));
  const removeCategory = (id: string) => setBoard((current) => ({ ...current, categories: current.categories.filter((category) => category.id !== id), players: current.players.map((player) => { const values = { ...player.values }; delete values[id]; return { ...player, values }; }) }));
  const updateValue = (playerId: string, categoryId: string, value: string) => updatePlayer(playerId, (player) => ({ ...player, values: { ...player.values, [categoryId]: value } }));

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#scorecard"><span className="brand-mark"><Flag size={17} /></span><span>clubhouse<span className="brand-period">.</span></span></a>
        <div className="topbar-actions">
          <div className={`saved-status is-${syncState}`}><span /> {syncLabel[syncState]}</div>
          {syncEnabled && <button className="share-button" onClick={copyShareLink} title="Copy a link others can open"><Share2 size={12} /> Share</button>}
        </div>
      </header>

      <section className="page-intro" id="scorecard">
        <div className="intro-kicker"><Flag size={12} /> THE GROUP SCORECARD</div>
        {customizing ? <input className="scorecard-title" value={board.title} onChange={(event) => setBoard((current) => ({ ...current, title: event.target.value }))} aria-label="Scorecard title" /> : <h1 className="scorecard-title">{board.title}</h1>}
        <p>One card. Your group. Keep score.</p>
      </section>

      <div className="toolbar">
        <span className="card-label"><span className="card-label-dot" /> SCORECARD <span className="toolbar-divider">/</span> {board.players.length} PLAYERS</span>
        <button className={`customize-button ${customizing ? 'active' : ''}`} onClick={() => setCustomizing(!customizing)}><Settings2 size={15} /> {customizing ? 'Done' : 'Customize card'}</button>
      </div>

      {customizing && <section className="customize-panel" aria-label="Customize scorecard">
        <div className="customize-heading"><div><span className="panel-kicker">MAKE IT YOURS</span><h2>Edit your scorecard</h2></div><button className="close-button" onClick={() => setCustomizing(false)} aria-label="Close customization"><X size={17} /></button></div>
        <div className="customize-grid">
          <div className="customize-column"><h3>PLAYERS <span>{board.players.length}</span></h3>{board.players.map((player) => <div className="edit-row" key={player.id}><input value={player.name} onChange={(event) => updatePlayer(player.id, (current) => ({ ...current, name: event.target.value }))} aria-label="Player name" /><button onClick={() => removePlayer(player.id)} aria-label={`Remove ${player.name}`} title="Remove player"><Trash2 size={15} /></button></div>)}<button className="add-row-button" onClick={addPlayer}><Plus size={14} /> Add a player</button></div>
          <div className="customize-column"><h3>CATEGORIES <span>{board.categories.length}</span></h3>{board.categories.map((category) => <div className="edit-row" key={category.id}><input value={category.name} onChange={(event) => updateCategory(category.id, (current) => ({ ...current, name: event.target.value }))} aria-label="Category name" /><button onClick={() => removeCategory(category.id)} aria-label={`Remove ${category.name}`} title="Remove category"><Trash2 size={15} /></button></div>)}<button className="add-row-button" onClick={addCategory}><Plus size={14} /> Add a category</button></div>
        </div>
        <div className="panel-note"><Pencil size={13} /> Rename, add, or remove players and categories here. Scores stay editable on the card.</div>
      </section>}

      <section className="paper-card" aria-label="Editable group scorecard">
        <div className="paper-topline"><span>PLAYER SCORECARD</span><span>GROUP <b>{board.title || 'Untitled card'}</b></span><span>DATE <b>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</b></span></div>
        <div className="score-grid-scroller"><table className="score-grid"><thead><tr><th className="name-heading"><span>PLAYER</span><span className="name-rule" /></th>{board.categories.map((category, index) => <th className="category-heading" key={category.id}><span className="category-number">{index + 1}</span><span className="category-name">{category.name}</span><span className="header-rule" />{customizing && <button className="remove-category" onClick={() => removeCategory(category.id)} aria-label={`Remove ${category.name}`}><X size={11} /></button>}</th>)}<th className="add-category-cell">{customizing && <button className="add-category-button" onClick={addCategory} aria-label="Add category"><Plus size={14} /></button>}</th></tr></thead><tbody>{board.players.map((player, index) => <tr key={player.id}><th className="player-name-cell"><span className="player-number">{String(index + 1).padStart(2, '0')}</span><span className="player-name-text">{player.name || 'Player name'}</span></th>{board.categories.map((category) => <td key={category.id}><input className="score-input" value={player.values[category.id] ?? ''} onChange={(event) => updateValue(player.id, category.id, event.target.value)} aria-label={`${player.name}, ${category.name}`} inputMode="decimal" /></td>)}<td className="empty-grid-cell" /></tr>)}</tbody><tfoot><tr><th className="totals-label">TOTAL</th>{board.categories.map((category) => <td className="total-cell" key={category.id}>{board.players.reduce((sum, player) => sum + (Number(player.values[category.id]) || 0), 0) || ''}</td>)}<td className="empty-grid-cell" /></tr></tfoot></table></div>
        {board.players.length === 0 && <div className="empty-message"><span>YOUR CARD IS READY</span><p>Open Customize card to add players and categories.</p></div>}
        <div className="paper-bottomline"><span>GOOD COMPANY. GOOD GAME.</span><span>{board.players.length} PLAYERS <b>·</b> {board.categories.length} CATEGORIES</span></div>
      </section>

      <div className="bottom-actions"><span>Click a score cell to enter a value. {syncEnabled ? 'Use Share to send this card to the rest of your group.' : 'Customize players, categories, and card title with the button above.'}</span></div>
      <footer className="page-footer"><span>MADE FOR THE LOVE OF THE GAME</span></footer>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}

export default App;
