import { useState, useEffect, useRef, useMemo } from 'react';
import { useCollection } from '../context/CollectionContext';
import { useAuth } from '../context/AuthContext';
import { BinderPageGrid } from '../components/Binder/BinderPageGrid';
import { CardPickerModal } from '../components/Binder/CardPickerModal';
import type { TrayItem } from '../components/Binder/CardPickerModal';
import { BinderCardModal } from '../components/Binder/BinderCardModal';
import { BinderSizePicker } from '../components/Binder/BinderSizePicker';
import { BinderCoverPicker } from '../components/Binder/BinderCoverPicker';
import type { Binder, BinderPage, BinderSlot, CurrencyCode } from '../types';
import { BINDER_MAX_PAGES, DEFAULT_BINDER_COLS, DEFAULT_BINDER_ROWS, SUPPORTED_CURRENCIES } from '../types';
import type { ResolvedSlotData } from '../components/Binder/BinderSlot';
import { HoloRing } from '../components/progress/HoloRing';
import { EstValueTooltip } from '../components/EstValueTooltip/EstValueTooltip';
import { pricesApi } from '../services/api';
import { getPriceFromCache } from '../utils/priceCache';
import './BinderPage.css';

function formatValue(usd: number, currency: CurrencyCode, rates: Record<string, number>): string {
  const rate = currency === 'USD' ? 1 : (rates[currency] ?? 1);
  const val = usd * rate;
  const sym = SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? '$';
  if (currency === 'JPY') return `${sym}${Math.round(val).toLocaleString()}`;
  return `${sym}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


type ModalState =
  | { kind: 'create' }
  | { kind: 'rename'; binderId: string }
  | { kind: 'cover'; binderId: string }
  | { kind: 'delete'; binderId: string; binderName: string }
  | { kind: 'picker'; pageId: string; slotIndex: number; emptySlotCount: number }
  | { kind: 'card'; pageId: string; slotIndex: number; slotData: ResolvedSlotData }
  | { kind: 'removePage'; pageId: string }
  | null;

type AnimState = 'idle' | 'out' | 'in';

export function BinderPage() {
  const { state, dispatch, createBinder, addBinderPage } = useCollection();
  const { isLoggedIn, preferredCurrency } = useAuth();

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
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  const [rates, setRates] = useState<Record<string, number>>({});
  const valueRef = useRef<HTMLSpanElement>(null);
  const prevFormattedValue = useRef<string>('');

  useEffect(() => {
    pricesApi.getLatestRates().then(setRates).catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      pricesApi.getCollectionValue().then(setPriceMap).catch(() => {});
    } else {
      const map = new Map<string, number>();
      for (const entry of state.collection) {
        const price = getPriceFromCache(entry.cardId, entry.setCode, entry.rarity);
        if (price !== null) map.set(entry.id, price);
      }
      setPriceMap(map);
    }
  }, [isLoggedIn, state.collection]);

  const binder: Binder | null =
    state.binders.find((b) => b.id === selectedBinderId) ??
    (state.binders.length === 1 ? state.binders[0] : null);

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
        : state.wishlist.find((e) => e.id === slot.entryId);
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

  const allSlots = binder?.pages.flatMap((p) => p.slots) ?? [];
  const totalSlots = allSlots.length;
  const filledSlots = allSlots.filter(Boolean).length;
  const ownedSlots = allSlots.filter((s) => s?.source === 'collection').length;

  const binderValueBreakdown = useMemo(() => {
    let marketTotal = 0;
    let manualTotal = 0;
    let manualCount = 0;
    let unpricedCount = 0;
    for (const slot of allSlots) {
      if (slot?.source !== 'collection') continue;
      const marketPrice = priceMap.get(slot.entryId);
      const entry = state.collection.find((e) => e.id === slot.entryId);
      if (marketPrice != null) {
        marketTotal += marketPrice;
      } else if (entry?.customPriceUsd != null) {
        manualTotal += entry.customPriceUsd;
        manualCount++;
      } else {
        unpricedCount++;
      }
    }
    return { marketTotal, manualTotal, manualCount, unpricedCount, total: marketTotal + manualTotal };
  }, [binder, allSlots, priceMap, state.collection]);

  const binderValue = binderValueBreakdown.total;

  const binderValues = useMemo(() => {
    const m = new Map<string, { total: number; market: number; manual: number; manualCount: number; unpriced: number }>();
    for (const b of state.binders) {
      let market = 0;
      let manual = 0;
      let manualCount = 0;
      let unpriced = 0;
      for (const slot of b.pages.flatMap((p) => p.slots)) {
        if (slot?.source !== 'collection') continue;
        const marketPrice = priceMap.get(slot.entryId);
        const entry = state.collection.find((e) => e.id === slot.entryId);
        if (marketPrice != null) {
          market += marketPrice;
        } else if (entry?.customPriceUsd != null) {
          manual += entry.customPriceUsd;
          manualCount++;
        } else {
          unpriced++;
        }
      }
      const total = market + manual;
      if (total > 0) m.set(b.id, { total, market, manual, manualCount, unpriced });
    }
    return m;
  }, [state.binders, state.collection, priceMap]);

  const formattedBinderValue = binderValue > 0 ? formatValue(binderValue, preferredCurrency, rates) : '';

  useEffect(() => {
    const el = valueRef.current;
    if (!el || !formattedBinderValue || formattedBinderValue === prevFormattedValue.current) return;
    prevFormattedValue.current = formattedBinderValue;
    el.removeAttribute('data-decode-text');
    el.textContent = formattedBinderValue;
    window.HoloText?.decode(el);
  }, [formattedBinderValue]);

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
      const pagesToAdd = BINDER_MAX_PAGES - 1; // binder starts with 1 page
      const slotCount = newCols * newRows;
      await Promise.all(Array.from({ length: pagesToAdd }, () => addBinderPage(newBinder.id, slotCount)));
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
      // Count empty slots from this position forward so the modal can show the cap
      let emptySlotCount = 0;
      let started = false;
      for (const p of binder.pages) {
        for (let i = 0; i < slotCount; i++) {
          if (!started) {
            if (p.id === pageId && i === slotIndex) started = true;
            else continue;
          }
          if (!p.slots[i]) emptySlotCount++;
        }
      }
      setModal({ kind: 'picker', pageId, slotIndex, emptySlotCount });
    }
  };

  const handlePickCards = (items: TrayItem[]) => {
    if (modal?.kind !== 'picker' || !binder) return;

    // Collect empty slots in order starting from the clicked slot
    const emptySlots: Array<{ pageId: string; slotIndex: number }> = [];
    let started = false;
    for (const p of binder.pages) {
      for (let i = 0; i < slotCount; i++) {
        if (!started) {
          if (p.id === modal.pageId && i === modal.slotIndex) started = true;
          else continue;
        }
        if (!p.slots[i]) emptySlots.push({ pageId: p.id, slotIndex: i });
      }
    }

    for (let i = 0; i < Math.min(items.length, emptySlots.length); i++) {
      const { pageId, slotIndex } = emptySlots[i];
      const item = items[i];
      dispatch({
        type: 'ASSIGN_BINDER_SLOT',
        binderId: binder.id,
        pageId,
        slotIndex,
        entry: { entryId: item.entryId, source: item.source, condition: item.condition },
      });
    }

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
      dragSourceSlot: dragSource !== null && dragSource.pageId === pageId ? dragSource.slotIndex : null,
      dragOverSlot: dragOver !== null && dragOver.pageId === pageId ? dragOver.slotIndex : null,
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
      <h1 data-decode data-caret style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--accent)' }}>
        Binders
      </h1>

      {/* ── No binders ── */}
      {state.binders.length === 0 && (
        <>
          <div className="binder-selector">
            <div className="binder-selector__actions">
              <button className="btn btn-primary" onClick={openCreate}>+ New</button>
            </div>
          </div>
          <div className="empty-state">
            <strong>No binders yet</strong>
            <p>Create a binder to start planning your pages.</p>
            <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={openCreate}>
              Create your first binder
            </button>
          </div>
        </>
      )}

      {/* ── Binder selection screen ── */}
      {state.binders.length > 1 && !binder && (
        <div className="binder-selection-screen">
          <div className="binder-selection-header">
            <button className="btn btn-primary" onClick={openCreate}>+ New</button>
          </div>
          <div className="binder-selection-grid">
            {state.binders.map((b) => {
              const allSlots = b.pages.flatMap((p) => p.slots);
              const totalSlots = allSlots.length;
              const filledSlots = allSlots.filter(Boolean).length;
              const ownedSlots = allSlots.filter((s) => s?.source === 'collection').length;
              const pct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
              return (
                <button
                  key={b.id}
                  className="binder-card"
                  onClick={() => {
                    setSelectedBinderId(b.id);
                    setDisplayedSpreadIndex(0);
                    setPendingSpreadIndex(null);
                    setAnimState('idle');
                  }}
                >
                  <div className="binder-card__cover">
                    {b.coverUrl ? (
                      <img src={b.coverUrl} alt={b.name} className="binder-card__cover-img" />
                    ) : (
                      <div className="binder-card__cover-placeholder">
                        <span className="binder-card__cover-name">{b.name}</span>
                        <span className="binder-card__cover-size">{b.cols}×{b.rows}</span>
                      </div>
                    )}
                  </div>
                  <div className="binder-card__info">
                    <span className="binder-card__name">{b.name}</span>
                    <span className="binder-card__meta">
                      {b.cols}×{b.rows} · {b.pages.length} {b.pages.length === 1 ? 'page' : 'pages'}
                    </span>
                    {totalSlots > 0 && (
                      <span className="binder-card__fill">{filledSlots}/{totalSlots} · {pct}%</span>
                    )}
                    {ownedSlots > 0 && (
                      <span className="binder-card__owned">{ownedSlots} owned</span>
                    )}
                    {isLoggedIn && binderValues.get(b.id) && (
                      <EstValueTooltip
                        marketValue={binderValues.get(b.id)!.market}
                        manualValue={binderValues.get(b.id)!.manual}
                        manualCount={binderValues.get(b.id)!.manualCount}
                        unpricedCount={binderValues.get(b.id)!.unpriced}
                        currency={preferredCurrency}
                        rates={rates}
                      >
                        <span className="binder-card__value">
                          {formatValue(binderValues.get(b.id)!.total, preferredCurrency, rates)}
                        </span>
                      </EstValueTooltip>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Binder view ── */}
      {binder && (
        <>
          <div className="binder-selector">
            {state.binders.length > 1 && (
              <button className="btn btn-ghost" onClick={() => setSelectedBinderId(null)}>
                ← All Binders
              </button>
            )}
            <div className="binder-selector__actions">
              <button className="btn btn-primary" onClick={openCreate}>+ New</button>
              <button className="btn btn-ghost" onClick={openRename}>Rename</button>
              <button className="btn btn-ghost" onClick={openCover}>Cover</button>
              <button className="btn btn-danger" onClick={openDelete}>Delete</button>
            </div>
          </div>

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
          <div className="binder-spread-layout">

            {/* ── Left HUD column ── */}
            <div className="binder-side-col binder-side-col--left">
              {isLoggedIn && formattedBinderValue && (
                <div className="binder-hud-value">
                  <EstValueTooltip
                    marketValue={binderValueBreakdown.marketTotal}
                    manualValue={binderValueBreakdown.manualTotal}
                    manualCount={binderValueBreakdown.manualCount}
                    unpricedCount={binderValueBreakdown.unpricedCount}
                    currency={preferredCurrency}
                    rates={rates}
                  >
                    <span ref={valueRef} data-decode className="binder-hud-value__amount">
                      {formattedBinderValue}
                    </span>
                  </EstValueTooltip>
                  <span className="binder-hud-value__label">Est. Value</span>
                </div>
              )}
              <HoloRing
                value={filledSlots}
                max={Math.max(totalSlots, 1)}
                size={160}
                sublabel={`${filledSlots}/${totalSlots}`}
                caption="FILLED"
              />
            </div>

            {/* ── Left connector ── */}
            {/* <div className="binder-hud-connector" aria-hidden="true">
              <svg viewBox="0 0 48 100" preserveAspectRatio="none"> */}
                {/* Value line → binder center */}
                {/* {isLoggedIn && formattedBinderValue && (
                  <>
                    <line x1="0" y1="12" x2="48" y2="50" stroke="var(--accent)" strokeWidth="1" opacity="0.38"/>
                    <circle cx="0" cy="12" r="2.5" fill="var(--accent)" opacity="0.55"/>
                  </>
                )} */}
                {/* Ring line → binder center */}
                {/* <line x1="0" y1="82" x2="48" y2="50" stroke="var(--accent)" strokeWidth="1" opacity="0.45"/>
                <circle cx="0" cy="82" r="2.5" fill="var(--accent)" opacity="0.55"/> */}
                {/* Binder edge node */}
                {/* <circle cx="48" cy="50" r="3.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.7"/>
                <circle cx="48" cy="50" r="1.5" fill="var(--accent)" opacity="0.8"/>
              </svg>
            </div> */}

            {/* ── Binder spread ── */}
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
                <div className="binder-spread__page binder-spread__page--right">
                  {rightPage
                    ? <BinderPageGrid {...makeGridProps(rightPage, rightPage.id)} />
                    : <div className="binder-spread__empty-page" />
                  }
                </div>
              </div>
            </div>

            {/* ── Right connector ── */}
            {/* <div className="binder-hud-connector" aria-hidden="true">
              <svg viewBox="0 0 48 100" preserveAspectRatio="none"> */}
                {/* Binder edge node */}
                {/* <circle cx="0" cy="50" r="3.5" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.7"/>
                <circle cx="0" cy="50" r="1.5" fill="var(--accent)" opacity="0.8"/> */}
                {/* Ring line from binder center */}
                {/* <line x1="0" y1="50" x2="48" y2="22" stroke="var(--accent)" strokeWidth="1" opacity="0.45"/>
                <circle cx="48" cy="22" r="2.5" fill="var(--accent)" opacity="0.55"/>
              </svg>
            </div> */}

            {/* ── Right HUD column ── */}
            <div className="binder-side-col binder-side-col--right">
              <HoloRing
                value={ownedSlots}
                max={Math.max(filledSlots, 1)}
                size={160}
                sublabel={`${ownedSlots}/${filledSlots}`}
                caption="OWNED"
              />
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
              "{modal.binderName}" and all its page layouts will be deleted. Your Collection and Wishlist entries are not affected.
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ padding: '1.25rem', maxWidth: '600px', width: '95vw', display: 'flex', flexDirection: 'column' }}>
            <CardPickerModal
              emptySlotCount={modal.emptySlotCount}
              onConfirm={handlePickCards}
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
