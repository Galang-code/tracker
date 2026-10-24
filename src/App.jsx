import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Capture from './pages/Capture'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/t/:trackId" element={<Capture />} />
      </Routes>
    </BrowserRouter>
  )
}
