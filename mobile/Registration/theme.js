import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';


const LIGHT = {
  mode: 'light',
  background: 'rgb(255, 255, 255)',
  surface: '#FFFFFF',
  border: '#D8D8D6',
  text: '#111111',
  textMuted: '#777777',
  label: '#333333',
  placeholder: '#999999',
  accent: '#BFFF00',
  accentText: '#111111',
  error: '#E23F3F',
  footerBg: '#111111',
  footerText: '#BFFF00',
};

const DARK = {
  mode: 'dark',
  background: '#0D0D0D',
  surface: '#1A1A1A',
  border: '#333333',
  text: '#FFFFFF',
  textMuted: '#999999',
  label: '#CCCCCC',
  placeholder: '#777777',
  accent: '#BFFF00',
  accentText: '#111111',
  error: '#FF6B6B',
  footerBg: '#000000',
  footerText: '#BFFF00',
};

const ThemeContext = createContext({
  theme: LIGHT,
  mode: 'system',
  setMode: () => {},
});


export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setMode] = useState('system'); // 'system' | 'light' | 'dark'

  const resolvedScheme = mode === 'system' ? systemScheme : mode;
  const theme = resolvedScheme === 'dark' ? DARK : LIGHT;

  const value = useMemo(() => ({ theme, mode, setMode }), [theme, mode]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}