import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Capture from './pages/Capture'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {/* Route lama (backward compat) */}
        <Route path="/t/:trackId" element={<Capture />} />
        {/* Route baru bertema: /berita/info-terkini/{encoded} */}
        <Route path="/:cat/:slug/:trackId" element={<Capture />} />
      </Routes>
    </BrowserRouter>
  )
}
