import { useState } from 'react';
import { useCollection } from '../context/CollectionContext';
import { BinderPageGrid } from '../components/Binder/BinderPageGrid';
import { CardPickerModal } from '../components/Binder/CardPickerModal';
import { BinderCardModal } from '../components/Binder/BinderCardModal';
import { BinderSizePicker } from '../components/Binder/BinderSizePicker';
import { BinderCoverPicker } from '../components/Binder/BinderCoverPicker';
import type { Binder, BinderPage, BinderSlot, Condition } from '../types';
import { BINDER_MAX_PAGES, DEFAULT_BINDER_COLS, DEFAULT_BINDER_ROWS } from '../types';
import type { ResolvedSlotData } from '../components/Binder/BinderSlot';
import './BinderPage.css';

type ModalState =
  | { kind: 'create' }
  | { kind: 'rename'; binderId: string }
  | { kind: 'cover'; binderId: string }
  | { kind: 'delete'; binderId: string; binderName: string }
  | { kind: 'picker'; pageId: string; slotIndex: number }
  | { kind: 'card'; pageId: string; slotIndex: number; slotData: ResolvedSlotData }
  | { kind: 'removePage'; pageId: string }
  | null;

type AnimState = 'idle' | 'out' | 'in';

export function BinderPage() {
  const { state, dispatch, createBinder, addBinderPage } = useCollection();

  const [selectedBinderId, setSelectedBinderId] = useState<string | null>(null);
  const [displayedSpreadIndex, setDisplayedSpreadIndex] = useState(0);
  const [pendingSpreadIndex, setPendingSpreadIndex] = useState<number | null>(null);
  const [animState, setAnimState] = useState<AnimState>('idle');
  const [flipDir, setFlipDir] = useState<'forward' | 'back'>('forward');
  const [modal, setModal] = useState<ModalState>(null);
  const [nameInput, setNameInput] = useState('');
  const [newCols, setNewCols] = useState(DEFAULT_BINDER_COLS);
  const [newRows, setNewRows] = useState(DEFAULT_BINDER_ROWS);
  const [coverInput, setCoverInput] = useState<string | null>(null);

  const [dragSource, setDragSource] = useState<{ pageId: string; slotIndex: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ pageId: string; slotIndex: number } | null>(null);

  const binder: Binder | null =
    state.binders.find((b) => b.id === selectedBinderId) ??
    state.binders[0] ??
    null;

  // ── Spread calculations ────────────────────────────────────────────────────
  // Spread 0: cover (left) + pages[0] (right)
  // Spread n (n≥1): pages[2n-1] (left) + pages[2n] (right)

  const totalCardPages = binder?.pages.length ?? 0;
  const spreadCount = 1 + Math.ceil(Math.max(0, totalCardPages - 1) / 2);
  const maxSpreadIndex = spreadCount - 1;
  const safeSpreadIndex = Math.min(displayedSpreadIndex, maxSpreadIndex);

  function getLeftPage(spreadIdx: number): BinderPage | null {
    if (spreadIdx === 0 || !binder) return null; // cover shown via JSX
    return binder.pages[spreadIdx * 2 - 1] ?? null;
  }

  function getRightPage(spreadIdx: number): BinderPage | null {
    if (!binder) return null;
    return binder.pages[spreadIdx * 2] ?? null;
  }

  const isSpread0 = safeSpreadIndex === 0;
  const leftPage = getLeftPage(safeSpreadIndex);
  const rightPage = getRightPage(safeSpreadIndex);

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

  function resolvePageSlots(page: BinderPage | null): (ResolvedSlotData | null)[] {
    if (!page) return Array<null>(slotCount).fill(null);
    return page.slots.map(resolveSlot);
  }

  // ── Flip animation ─────────────────────────────────────────────────────────

  function goToSpread(target: number) {
    if (animState !== 'idle' || !binder) return;
    const clamped = Math.max(0, Math.min(target, maxSpreadIndex));
    if (clamped === safeSpreadIndex) return;
    setFlipDir(clamped > safeSpreadIndex ? 'forward' : 'back');
    setPendingSpreadIndex(clamped);
    setAnimState('out');
  }

  function handleAnimEnd() {
    if (animState === 'out' && pendingSpreadIndex !== null) {
      setDisplayedSpreadIndex(pendingSpreadIndex);
      setAnimState('in');
    } else if (animState === 'in') {
      setPendingSpreadIndex(null);
      setAnimState('idle');
    }
  }

  const spreadClass = [
    'binder-spread',
    animState === 'out' ? `binder-spread--flip-out-${flipDir}` : '',
    animState === 'in' ? `binder-spread--flip-in-${flipDir}` : '',
  ].filter(Boolean).join(' ');

  // ── Binder management ──────────────────────────────────────────────────────

  const openCreate = () => {
    setNameInput('');
    setNewCols(DEFAULT_BINDER_COLS);
    setNewRows(DEFAULT_BINDER_ROWS);
    setCoverInput(null);
    setModal({ kind: 'create' });
  };

  const confirmCreate = async () => {
    if (!nameInput.trim()) return;
    const newBinder = await createBinder(nameInput.trim(), newCols, newRows, coverInput ?? undefined);
    if (newBinder) {
      setSelectedBinderId(newBinder.id);
      setDisplayedSpreadIndex(0);
    }
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

  const openCover = () => {
    if (!binder) return;
    setCoverInput(binder.coverUrl ?? null);
    setModal({ kind: 'cover', binderId: binder.id });
  };

  const confirmCover = () => {
    if (modal?.kind !== 'cover') return;
    dispatch({ type: 'SET_BINDER_COVER', binderId: modal.binderId, coverUrl: coverInput });
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
    setDisplayedSpreadIndex(0);
    setModal(null);
  };

  // ── Page management ────────────────────────────────────────────────────────

  const addTwoPages = async () => {
    if (!binder || binder.pages.length >= BINDER_MAX_PAGES || animState !== 'idle') return;
    const currentCount = binder.pages.length;
    const newSpreadIndex = Math.ceil(currentCount / 2);
    await addBinderPage(binder.id, binder.cols * binder.rows);
    if (currentCount + 1 < BINDER_MAX_PAGES) {
      await addBinderPage(binder.id, binder.cols * binder.rows);
    }
    setFlipDir('forward');
    setPendingSpreadIndex(newSpreadIndex);
    setAnimState('out');
  };

  const removePage = () => {
    if (!binder || binder.pages.length <= 1) return;
    const lastPage = binder.pages[binder.pages.length - 1];
    if (lastPage.slots.some((s) => s !== null)) {
      setModal({ kind: 'removePage', pageId: lastPage.id });
    } else {
      doRemovePage(lastPage.id);
    }
  };

  const doRemovePage = (pageId: string) => {
    if (!binder || binder.pages.length <= 1) return;
    dispatch({ type: 'REMOVE_BINDER_PAGE', binderId: binder.id, pageId });
    const newTotal = binder.pages.length - 1;
    const newMax = Math.max(0, Math.ceil(Math.max(0, newTotal - 1) / 2));
    setDisplayedSpreadIndex((i) => Math.min(i, newMax));
    setModal(null);
  };

  // ── Slot interactions ──────────────────────────────────────────────────────

  const handleSlotClick = (pageId: string, slotIndex: number) => {
    if (!binder) return;
    const page = binder.pages.find((p) => p.id === pageId);
    if (!page) return;
    const resolved = resolveSlot(page.slots[slotIndex] ?? null);
    if (resolved) {
      setModal({ kind: 'card', pageId, slotIndex, slotData: resolved });
    } else {
      setModal({ kind: 'picker', pageId, slotIndex });
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

  // ── Drag and drop ──────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, pageId: string, slotIndex: number) => {
    setDragSource({ pageId, slotIndex });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(slotIndex));
  };

  const handleDragOver = (e: React.DragEvent, pageId: string, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ pageId, slotIndex });
  };

  const handleDrop = (e: React.DragEvent, pageId: string, slotIndex: number) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragSource || !binder) return;
    if (dragSource.pageId === pageId && dragSource.slotIndex === slotIndex) {
      setDragSource(null);
      return;
    }
    dispatch({
      type: 'MOVE_BINDER_SLOT',
      binderId: binder.id,
      fromPageId: dragSource.pageId,
      fromSlot: dragSource.slotIndex,
      toPageId: pageId,
      toSlot: slotIndex,
    });
    setDragSource(null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOver(null);
    }
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
  };

  function makeGridProps(page: BinderPage | null, pageId: string | undefined) {
    return {
      cols: binder!.cols,
      rows: binder!.rows,
      resolvedSlots: resolvePageSlots(page),
      dragSourceSlot: dragSource?.pageId === pageId ? dragSource.slotIndex : null,
      dragOverSlot: dragOver?.pageId === pageId ? dragOver.slotIndex : null,
      onSlotClick: (slotIndex: number) => handleSlotClick(pageId!, slotIndex),
      onDragStart: (e: React.DragEvent, slotIndex: number) => handleDragStart(e, pageId!, slotIndex),
      onDragOver: (e: React.DragEvent, slotIndex: number) => handleDragOver(e, pageId!, slotIndex),
      onDrop: (e: React.DragEvent, slotIndex: number) => handleDrop(e, pageId!, slotIndex),
      onDragLeave: handleDragLeave,
      onDragEnd: handleDragEnd,
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeSpreadIndex = pendingSpreadIndex ?? safeSpreadIndex;

  const pageLabel = (() => {
    if (activeSpreadIndex === 0) {
      return totalCardPages > 0 ? `Cover + Page 1 of ${totalCardPages}` : 'Cover';
    }
    const l = activeSpreadIndex * 2;
    const r = Math.min(activeSpreadIndex * 2 + 1, totalCardPages);
    return l === r ? `Page ${l} of ${totalCardPages}` : `Pages ${l}–${r} of ${totalCardPages}`;
  })();

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
              setDisplayedSpreadIndex(0);
              setPendingSpreadIndex(null);
              setAnimState('idle');
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
              <button className="btn btn-ghost" onClick={openCover}>Cover</button>
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

      {binder && (
        <>
          {/* Navigation bar */}
          <div className="binder-page-nav">
            <button
              className="binder-page-nav__arrow"
              disabled={activeSpreadIndex === 0 || animState !== 'idle'}
              onClick={() => goToSpread(activeSpreadIndex - 1)}
              aria-label="Previous spread"
            >
              ‹
            </button>
            <span className="binder-page-nav__label">{pageLabel}</span>
            <button
              className="binder-page-nav__arrow"
              disabled={activeSpreadIndex >= maxSpreadIndex || animState !== 'idle'}
              onClick={() => goToSpread(activeSpreadIndex + 1)}
              aria-label="Next spread"
            >
              ›
            </button>
            <button
              className="btn btn-ghost"
              onClick={addTwoPages}
              disabled={binder.pages.length >= BINDER_MAX_PAGES}
              style={{ fontSize: '0.78rem' }}
            >
              + Pages
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

          {/* Spread view */}
          <div className="binder-spread-wrapper">
            <div className={spreadClass} onAnimationEnd={handleAnimEnd}>
              {/* Left side */}
              {isSpread0 ? (
                <div className="binder-spread__page binder-spread__page--left">
                  <div className="binder-cover">
                    {binder.coverUrl ? (
                      <img src={binder.coverUrl} alt="Binder cover" className="binder-cover__img" />
                    ) : (
                      <div className="binder-cover__title">
                        <span className="binder-cover__name">{binder.name}</span>
                        <span className="binder-cover__sub">{binder.cols}×{binder.rows}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="binder-spread__page binder-spread__page--left">
                  {leftPage
                    ? <BinderPageGrid {...makeGridProps(leftPage, leftPage.id)} />
                    : <div className="binder-spread__empty-page" />
                  }
                </div>
              )}

              <div className="binder-spread__spine" />

              {/* Right side — always a card page */}
              <div className="binder-spread__page binder-spread__page--right">
                {rightPage
                  ? <BinderPageGrid {...makeGridProps(rightPage, rightPage.id)} />
                  : <div className="binder-spread__empty-page" />
                }
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}

      {modal?.kind === 'create' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '400px' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cover image (optional)</span>
                <BinderCoverPicker selected={coverInput} onChange={setCoverInput} />
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

      {modal?.kind === 'cover' && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '400px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Change Cover</h2>
            <BinderCoverPicker selected={coverInput} onChange={setCoverInput} />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmCover}>Save</button>
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '360px' }}>
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
