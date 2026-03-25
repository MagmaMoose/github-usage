import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@primer/primitives/dist/css/functional/themes/light.css';
import '@primer/primitives/dist/css/functional/themes/dark.css';
import { ThemeProvider, BaseStyles } from '@primer/react';
import App from './App';
import './global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider colorMode="day" dayScheme="light">
      <BaseStyles>
        <App />
      </BaseStyles>
    </ThemeProvider>
  </StrictMode>,
);
