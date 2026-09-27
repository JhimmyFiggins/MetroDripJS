import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';


const LIGHT = {
  mode: 'light',
  background: '#FFFFFF',
  surface: '#F4F4F2',
  card: '#FFFFFF',
  border: '#E4E4DF',
  text: '#141414',
  textMuted: '#63635C',
  label: '#63635C',
  placeholder: '#A3A39A',
  accent: '#D3EE42',
  accentText: '#141414',
  link: '#5C6B12',
  error: '#B42318',
  footerBg: '#141414',
  footerText: '#D3EE42',
};

const DARK = {
  mode: 'dark',
  background: '#0F0F0F',
  surface: '#1A1A1A',
  card: '#1A1A1A',
  border: '#2E2E2C',
  text: '#F2F2EF',
  textMuted: '#A3A39A',
  label: '#A3A39A',
  placeholder: '#63635C',
  accent: '#D3EE42',
  accentText: '#141414',
  link: '#D3EE42',
  error: '#FF6B6B',
  footerBg: '#0F0F0F',
  footerText: '#D3EE42',
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