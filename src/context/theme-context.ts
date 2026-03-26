import { createContext, useContext } from 'react';

type ColorMode = 'auto' | 'day' | 'night';

interface ThemeContextValue {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  colorMode: 'auto',
  setColorMode: () => {},
});

export function useColorMode() {
  return useContext(ThemeContext);
}
