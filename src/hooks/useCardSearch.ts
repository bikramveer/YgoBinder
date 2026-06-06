import { useState, useEffect, useRef, useCallback } from 'react';
import { searchCards } from '../services/ygoprodeck';
import type { YGOCard } from '../types';

interface UseCardSearchResult {
  cards: YGOCard[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
}

export function useCardSearch(
  query: string,
  cardType: string,
  rarity: string,
): UseCardSearchResult {
  const [cards, setCards] = useState<YGOCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(
    async (currentOffset: number, append: boolean) => {
      if (!query.trim()) {
        setCards([]);
        setHasMore(false);
        return;
      }
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const res = await searchCards(query.trim(), currentOffset, cardType || undefined);
        let results = res.data ?? [];

        // Client-side rarity filter
        if (rarity) {
          results = results.filter((c) =>
            c.card_sets?.some((s) =>
              s.set_rarity.toLowerCase() === rarity.toLowerCase(),
            ),
          );
        }

        setCards((prev) => (append ? [...prev, ...results] : results));
        const remaining = res.meta?.rows_remaining ?? 0;
        setHasMore(remaining > 0 && results.length > 0);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to fetch cards. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [query, cardType, rarity],
  );

  // Reset and search when query/filters change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      setOffset(0);
      fetchPage(0, false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, cardType, rarity, fetchPage]);

  const loadMore = useCallback(() => {
    const nextOffset = offset + 20;
    setOffset(nextOffset);
    fetchPage(nextOffset, true);
  }, [offset, fetchPage]);

  const reset = useCallback(() => {
    setCards([]);
    setOffset(0);
    setHasMore(false);
    setError(null);
  }, []);

  return { cards, loading, error, hasMore, loadMore, reset };
}
