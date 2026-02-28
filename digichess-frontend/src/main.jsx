import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

const LOCAL_STORAGE_UI_THEME = 'uiTheme'

const logoUrl = new URL('../logo.png', import.meta.url).href
const faviconLink = document.querySelector("link[rel~='icon']")
if (faviconLink) {
  faviconLink.type = 'image/png'
  faviconLink.href = logoUrl
}

const storedTheme = window.localStorage.getItem(LOCAL_STORAGE_UI_THEME)
if (storedTheme === 'light' || storedTheme === 'dark') {
  document.documentElement.classList.toggle('dark', storedTheme === 'dark')
}

// GCS static hosting returns index.html for unknown paths as 404.
// Canonicalize deep links to hash routes so SPA navigation works reliably.
if (!window.location.hash && window.location.pathname !== '/') {
  const hashPath = `${window.location.pathname}${window.location.search}`
  window.history.replaceState(null, '', `/#${hashPath}`)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <HashRouter>
        <App />
      </HashRouter>
    </AuthProvider>
  </StrictMode>,
)

requestAnimationFrame(() => {
  document.body.classList.add('app-ready')
})
