import { Info } from 'lucide-react';
import type { CurrencyCode } from '../../types';
import './EstValueTooltip.css';

interface Props {
  children: React.ReactNode;
  marketValue: number;
  manualValue: number;
  manualCount: number;
  unpricedCount: number;
  currency: CurrencyCode;
  rates: Record<string, number>;
}

function fmt(usd: number, currency: CurrencyCode, rates: Record<string, number>): string {
  const rate = currency === 'USD' ? 1 : (rates[currency] ?? 1);
  const val = usd * rate;
  const symbols: Record<string, string> = { USD: '$', CAD: '$', EUR: '€', GBP: '£', AUD: '$', JPY: '¥' };
  const sym = symbols[currency] ?? '$';
  if (currency === 'JPY') return `${sym}${Math.round(val).toLocaleString()} ${currency}`;
  return `${sym}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function EstValueTooltip({
  children,
  marketValue,
  manualValue,
  manualCount,
  unpricedCount,
  currency,
  rates,
}: Props) {
  const hasManual = manualCount > 0;
  const hasUnpriced = unpricedCount > 0;
  const showBreakdown = hasManual;

  return (
    <span className="est-tooltip">
      <span className="est-tooltip__trigger">
        {children}
        {hasManual && <span className="est-tooltip__indicator" aria-hidden="true">*</span>}
        <Info className="est-tooltip__info-icon" size={11} aria-hidden="true" />
      </span>

      <div className="est-tooltip__panel holo-frame" role="tooltip">
        {showBreakdown ? (
          <>
            <div className="est-tooltip__row">
              <span className="est-tooltip__label">Market prices</span>
              <span className="est-tooltip__value">{fmt(marketValue, currency, rates)}</span>
            </div>
            <div className="est-tooltip__row">
              <span className="est-tooltip__label">
                Manually set{manualCount > 0 ? ` (${manualCount} card${manualCount !== 1 ? 's' : ''})` : ''}
              </span>
              <span className="est-tooltip__value">{fmt(manualValue, currency, rates)}</span>
            </div>
            <div className="est-tooltip__divider" />
          </>
        ) : null}

        <p className="est-tooltip__note">
          Market prices from TCGPlayer via YGOPRODeck, updated daily.
        </p>
        {hasUnpriced && (
          <p className="est-tooltip__note est-tooltip__note--dim">
            {unpricedCount} card{unpricedCount !== 1 ? 's' : ''} excluded — no market or manual price set.
          </p>
        )}
      </div>
    </span>
  );
}
