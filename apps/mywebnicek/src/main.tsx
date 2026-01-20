import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DenicekProvider } from '@mydenicek/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { initializeDocument } from './initializeDocument.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <DenicekProvider initializer={initializeDocument}>
        <App />
      </DenicekProvider>
    </FluentProvider>
  </StrictMode>
);
