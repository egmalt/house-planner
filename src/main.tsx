import './i18n'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useTranslation } from 'react-i18next'
import './styles/tokens.css'
import './styles/ui.css'
import './index.css'
import App from './App.tsx'

// Remount on language change so memoized calc texts and warnings are rebuilt in the new language.
function Root() {
  const { i18n } = useTranslation()
  return <App key={i18n.resolvedLanguage} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
