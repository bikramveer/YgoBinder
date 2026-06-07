import { useAuth } from '../../context/AuthContext';
import { SUPPORTED_CURRENCIES } from '../../types';
import type { CurrencyCode } from '../../types';
import './CurrencySelector.css';

export function CurrencySelector() {
  const { preferredCurrency, updateCurrency } = useAuth();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    void updateCurrency(e.target.value as CurrencyCode);
  }

  return (
    <select
      className="currency-selector"
      value={preferredCurrency}
      onChange={handleChange}
      aria-label="Preferred currency"
    >
      {SUPPORTED_CURRENCIES.map(({ code, label }) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
  );
}
