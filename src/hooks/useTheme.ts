import { useEffect, useState } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem('theme') === 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    const destBg = next ? '#060c1c' : '#eef2fa';
    const apply = () => setDark(d => !d);
    if (window.HoloTransition) {
      window.HoloTransition.fade(apply, { color: destBg });
    } else {
      apply();
    }
  };

  return { dark, toggle };
}
