import { useState, useCallback } from 'react';
import { getCardById } from '../services/ygoprodeck';
import { getCachedCard, setCachedCard } from '../utils/priceCache';
import type { YGOCard } from '../types';

interface UseCardDetailResult {
  card: YGOCard | null;
  loading: boolean;
  error: string | null;
  fetchCard: (id: number) => Promise<void>;
  clearCard: () => void;
}

export function useCardDetail(): UseCardDetailResult {
  const [card, setCard] = useState<YGOCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCard = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setCard(null);

    const cached = getCachedCard(id);
    if (cached) {
      setCard(cached);
      setLoading(false);
      return;
    }

    try {
      const data = await getCardById(id);
      setCachedCard(id, data);
      setCard(data);
    } catch {
      setError('Failed to load card details.');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearCard = useCallback(() => {
    setCard(null);
    setError(null);
  }, []);

  return { card, loading, error, fetchCard, clearCard };
}
