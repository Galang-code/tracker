import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Capture from './pages/Capture'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {/* Route /t/:trackId — format lama */}
        <Route path="/t/:trackId" element={<Capture />} />
        {/* Route bertema satu level: /berita/{encoded} */}
        <Route path="/:cat/:trackId" element={<Capture />} />
        {/* Catch-all: apapun path-nya, coba decode segmen terakhir */}
        <Route path="*" element={<Capture />} />
      </Routes>
    </BrowserRouter>
  )
}
