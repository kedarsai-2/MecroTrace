import React, { createContext, useContext, useState, useCallback } from 'react';

type FontSizeLevel = 0 | 1 | 2;
const LABELS: Record<FontSizeLevel, string> = { 0: 'Default', 1: 'Large', 2: 'Extra Large' };
/** Readable steps without oversized UI or layout blowout when applied app-wide */
const SCALE: Record<FontSizeLevel, number> = { 0: 1, 1: 1.08, 2: 1.16 };

type FontSizeContextType = {
  level: FontSizeLevel;
  scale: number;
  label: string;
  setLevel: (level: FontSizeLevel) => void;
  decrease: () => void;
  reset: () => void;
  increase: () => void;
};

const FontSizeContext = createContext<FontSizeContextType>({
  level: 0, scale: 1, label: 'Default',
  setLevel: () => {},
  decrease: () => {}, reset: () => {}, increase: () => {},
});

export const useFontSize = () => useContext(FontSizeContext);

export const FontSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [level, setLevel] = useState<FontSizeLevel>(() => {
    const saved = localStorage.getItem('mercotrace-font-size');
    return (saved !== null && [0, 1, 2].includes(Number(saved))) ? Number(saved) as FontSizeLevel : 0;
  });

  const persist = (l: FontSizeLevel) => {
    setLevel(l);
    localStorage.setItem('mercotrace-font-size', String(l));
  };

  const setLevelExplicit = useCallback((l: FontSizeLevel) => persist(l), []);
  const decrease = useCallback(() => persist(Math.max(0, level - 1) as FontSizeLevel), [level]);
  const reset = useCallback(() => persist(0), []);
  const increase = useCallback(() => persist(Math.min(2, level + 1) as FontSizeLevel), [level]);

  return (
    <FontSizeContext.Provider value={{ level, scale: SCALE[level], label: LABELS[level], setLevel: setLevelExplicit, decrease, reset, increase }}>
      {children}
    </FontSizeContext.Provider>
  );
};
