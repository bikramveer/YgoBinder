import { useState } from 'react';
import { useCollection } from '../context/CollectionContext';
import { BinderPageGrid } from '../components/Binder/BinderPageGrid';
import { CardPickerModal } from '../components/Binder/CardPickerModal';
import { BinderCardModal } from '../components/Binder/BinderCardModal';
import { BinderSizePicker } from '../components/Binder/BinderSizePicker';
import type { Binder, BinderPage, BinderSlot, Condition } from '../types';
import { BINDER_MAX_PAGES, DEFAULT_BINDER_COLS, DEFAULT_BINDER_ROWS } from '../types';
import type { ResolvedSlotData } from '../components/Binder/BinderSlot';
import './BinderPage.css';

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function emptyPage(slotCount: number): BinderPage {
  return { id: newId(), slots: Array<BinderSlot | null>(slotCount).fill(null) };
}

type ModalState =
  | { kind: 'create' }
  | { kind: 'rename'; binderId: string }
  | { kind: 'delete'; binderId: string; binderName: string }
  | { kind: 'picker'; pageId: string; slotIndex: number }
  | { kind: 'card'; pageId: string; slotIndex: number; slotData: ResolvedSlotData }
  | { kind: 'removePage'; pageId: string }
  | null;

export function BinderPage() {
  const { state, dispatch } = useCollection();

  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [nameInput, setNameInput] = useState('');
  const [newCols, setNewCols] = useState(DEFAULT_BINDER_COLS);
  const [newRows, setNewRows] = useState(DEFAULT_BINDER_ROWS);

  // Drag state
  const [dragSource, setDragSource] = useState<{ pageId: string; slotIndex: number } | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);

  const binder: Binder | null =
    state.binders.find((b) => b.id === selectedBinderId) ??
    state.binders[0] ??
    null;

  const safePageIndex = Math.min(currentPageIndex, Math.max(0, (binder?.pages.length ?? 1) - 1));
  const currentPage: BinderPage | null = binder?.pages[safePageIndex] ?? null;

  function resolveSlot(slot: BinderSlot | null): ResolvedSlotData | null {
    if (!slot) return null;
    const entry =
      slot.source === 'collection'
        ? state.collection.find((e) => e.id === slot.entryId)
        : state.toGet.find((e) => e.id === slot.entryId);
    if (!entry) return null;
    return {
      entryId: slot.entryId,
      source: slot.source,
      cardName: entry.cardName,
      cardImageUrl: entry.cardImageUrl,
      condition: slot.condition,
    };
  }

  const slotCount = binder ? binder.cols * binder.rows : DEFAULT_BINDER_COLS * DEFAULT_BINDER_ROWS;
  const resolvedSlots: (ResolvedSlotData | null)[] = currentPage
    ? currentPage.slots.map(resolveSlot)
    : Array<null>(slotCount).fill(null);

  // ── Binder management ────────────────────────────────────────────────────────

  const openCreate = () => {
    setNameInput('');
    setNewCols(DEFAULT_BINDER_COLS);
    setNewRows(DEFAULT_BINDER_ROWS);
    setModal({ kind: 'create' });
  };

  const confirmCreate = () => {
    if (!nameInput.trim()) return;
    const sc = newCols * newRows;
    const newBinder: Binder = {
      id: newId(),
      name: nameInput.trim(),
      cols: newCols,
      rows: newRows,
      createdAt: new Date().toISOString(),
      pages: [emptyPage(sc)],
    };
    dispatch({ type: 'CREATE_BINDER', binder: newBinder });
    setSelectedBinderId(newBinder.id);
    setCurrentPageIndex(0);
    setModal(null);
  };

  const openRename = () => {
    if (!binder) return;
    setNameInput(binder.name);
    setModal({ kind: 'rename', binderId: binder.id });
  };

  const confirmRename = () => {
    if (modal?.kind !== 'rename' || !nameInput.trim()) return;
    dispatch({ type: 'RENAME_BINDER', binderId: modal.binderId, name: nameInput.trim() });
    setModal(null);
  };

  const openDelete = () => {
    if (!binder) return;
    setModal({ kind: 'delete', binderId: binder.id, binderName: binder.name });
  };

  const confirmDelete = () => {
    if (modal?.kind !== 'delete') return;
    dispatch({ type: 'DELETE_BINDER', binderId: modal.binderId });
    setSelectedBinderId(null);
    setCurrentPageIndex(0);
    setModal(null);
  };

  // ── Page management ──────────────────────────────────────────────────────────

  const addPage = () => {
    if (!binder || binder.pages.length >= BINDER_MAX_PAGES) return;
    const page = emptyPage(binder.cols * binder.rows);
    dispatch({ type: 'ADD_BINDER_PAGE', binderId: binder.id, page });
    setCurrentPageIndex(binder.pages.length);
  };

  const removePage = () => {
    if (!binder || !currentPage) return;
    const hasCards = currentPage.slots.some((s) => s !== null);
    if (hasCards) {
      setModal({ kind: 'removePage', pageId: currentPage.id });
    } else {
      doRemovePage(currentPage.id);
    }
  };

  const doRemovePage = (pageId: string) => {
    if (!binder || binder.pages.length <= 1) return;
    dispatch({ type: 'REMOVE_BINDER_PAGE', binderId: binder.id, pageId });
    setCurrentPageIndex((i) => Math.max(0, i - 1));
    setModal(null);
  };

  // ── Slot interactions ────────────────────────────────────────────────────────

  const handleSlotClick = (slotIndex: number) => {
    if (!binder || !currentPage) return;
    const resolved = resolvedSlots[slotIndex];
    if (resolved) {
      setModal({ kind: 'card', pageId: currentPage.id, slotIndex, slotData: resolved });
    } else {
      setModal({ kind: 'picker', pageId: currentPage.id, slotIndex });
    }
  };

  const handlePickCard = (entryId: string, source: 'collection' | 'toGet', condition?: Condition) => {
    if (modal?.kind !== 'picker' || !binder) return;
    dispatch({
      type: 'ASSIGN_BINDER_SLOT',
      binderId: binder.id,
      pageId: modal.pageId,
      slotIndex: modal.slotIndex,
      entry: { entryId, source, condition },
    });
    setModal(null);
  };

  const handleRemoveFromSlot = () => {
    if (modal?.kind !== 'card' || !binder) return;
    dispatch({
      type: 'ASSIGN_BINDER_SLOT',
      binderId: binder.id,
      pageId: modal.pageId,
      slotIndex: modal.slotIndex,
      entry: null,
    });
    setModal(null);
  };

  // ── Drag and drop ────────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, slotIndex: number) => {
    if (!currentPage) return;
    setDragSource({ pageId: currentPage.id, slotIndex });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(slotIndex));
  };

  const handleDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slotIndex);
  };

  const handleDrop = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    if (!dragSource || !binder || !currentPage) return;
    if (dragSource.slotIndex === slotIndex) {
      setDragSource(null);
      return;
    }
    dispatch({
      type: 'MOVE_BINDER_SLOT',
      binderId: binder.id,
      fromPageId: dragSource.pageId,
      fromSlot: dragSource.slotIndex,
      toPageId: currentPage.id,
      toSlot: slotIndex,
    });
    setDragSource(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverSlot(null);
    }
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOverSlot(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="page">
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent)' }}>
        Binders
      </h1>

      {/* Binder selector */}
      <div className="binder-selector">
        {state.binders.length > 0 ? (
          <select
            className="binder-selector__select"
            value={binder?.id ?? ''}
            onChange={(e) => {
              setSelectedBinderId(e.target.value);
              setCurrentPageIndex(0);
            }}
          >
            {state.binders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.cols}×{b.rows})
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', flex: 1 }}>
            No binders yet
          </span>
        )}
        <div className="binder-selector__actions">
          <button className="btn btn-primary" onClick={openCreate}>+ New</button>
          {binder && (
            <>
              <button className="btn btn-ghost" onClick={openRename}>Rename</button>
              <button className="btn btn-danger" onClick={openDelete}>Delete</button>
            </>
          )}
        </div>
      </div>

      {!binder && (
        <div className="empty-state">
          <strong>No binders yet</strong>
          <p>Create a binder to start planning your pages.</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openCreate}>
            Create your first binder
          </button>
        </div>
      )}

      {binder && currentPage && (
        <>
          <div className="binder-page-nav">
            <button
              className="binder-page-nav__arrow"
              disabled={safePageIndex === 0}
              onClick={() => setCurrentPageIndex((i) => i - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="binder-page-nav__label">
              Page {safePageIndex + 1} of {binder.pages.length}
            </span>
            <button
              className="binder-page-nav__arrow"
              disabled={safePageIndex >= binder.pages.length - 1}
              onClick={() => setCurrentPageIndex((i) => i + 1)}
              aria-label="Next page"
            >
              ›
            </button>
            <button
              className="btn btn-ghost"
              onClick={addPage}
              disabled={binder.pages.length >= BINDER_MAX_PAGES}
              style={{ fontSize: '0.78rem' }}
            >
              + Page
            </button>
            {binder.pages.length > 1 && (
              <button
                className="btn btn-danger"
                onClick={removePage}
                style={{ fontSize: '0.78rem' }}
              >
                − Page
              </button>
            )}
          </div>

          <BinderPageGrid
            cols={binder.cols}
            rows={binder.rows}
            resolvedSlots={resolvedSlots}
            dragSourceSlot={dragSource?.pageId === currentPage.id ? dragSource.slotIndex : null}
            dragOverSlot={dragOverSlot}
            onSlotClick={handleSlotClick}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragLeave={handleDragLeave}
            onDragEnd={handleDragEnd}
          />
        </>
      )}

      {/* ── Modals ── */}

      {modal?.kind === 'create' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>New Binder</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Binder name
                <input
                  type="text"
                  placeholder="e.g. Blue-Eyes Binder"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmCreate(); }}
                  autoFocus
                />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Binder size</span>
                <BinderSizePicker
                  cols={newCols}
                  rows={newRows}
                  onChange={(c, r) => { setNewCols(c); setNewRows(r); }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmCreate} disabled={!nameInput.trim()}>
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'rename' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '340px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Rename Binder</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmRename(); }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={confirmRename} disabled={!nameInput.trim()}>
                  Rename
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'delete' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '340px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Delete Binder?</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              "{modal.binderName}" and all its page layouts will be deleted. Your Collection and To Get entries are not affected.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'removePage' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '340px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Remove Page?</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              This page has cards placed in it. Remove it anyway?
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => doRemovePage(modal.pageId)}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === 'picker' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '420px', display: 'flex', flexDirection: 'column' }}>
            <CardPickerModal
              onSelect={handlePickCard}
              onCancel={() => setModal(null)}
            />
          </div>
        </div>
      )}

      {modal?.kind === 'card' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem' }}>
            <BinderCardModal
              slotData={modal.slotData}
              onRemoveFromSlot={handleRemoveFromSlot}
              onClose={() => setModal(null)}
            />
          </div>
        </div>
      )}
    </main>
  );
}
