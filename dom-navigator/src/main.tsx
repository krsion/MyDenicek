import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeIcons } from '@fluentui/react'
import { FluentProvider, webLightTheme } from '@fluentui/react-components';


// Initialize Fluent UI icons (required by many Fluent components)
initializeIcons()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={webLightTheme}>
      <App />
    </FluentProvider>
  </StrictMode>,
)
