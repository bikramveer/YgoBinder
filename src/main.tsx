import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './effects/holo.css'
import './effects/holo-circuit.js'
import './effects/holo-text.js'
import './effects/holo-transition.js'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
