import { StrictMode, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import '@primer/primitives/dist/css/base/motion/motion.css';
import { ThemeProvider, BaseStyles } from '@primer/react';
import App from './App';
import { ThemeContext } from './context/theme-context';
import './global.css';

export default function Root() {
  const [colorMode, setColorMode] = useState<'auto' | 'day' | 'night'>(() => {
    const stored = localStorage.getItem('tbb-color-mode');
    return (stored as 'auto' | 'day' | 'night') || 'auto';
  });

  const themeValue = useMemo(
    () => ({
      colorMode,
      setColorMode: (mode: 'auto' | 'day' | 'night') => {
        setColorMode(mode);
        localStorage.setItem('tbb-color-mode', mode);
      },
    }),
    [colorMode],
  );

  return (
    <ThemeProvider colorMode={colorMode} dayScheme="light" nightScheme="dark">
      <BaseStyles>
        <ThemeContext.Provider value={themeValue}>
          <App />
        </ThemeContext.Provider>
      </BaseStyles>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
