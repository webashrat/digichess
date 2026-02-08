import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

const logoUrl = new URL('../logo.png', import.meta.url).href
const faviconLink = document.querySelector("link[rel~='icon']")
if (faviconLink) {
  faviconLink.type = 'image/png'
  faviconLink.href = logoUrl
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
