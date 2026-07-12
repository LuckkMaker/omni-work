import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import FlashPage from './pages/flash'
import CommanderPage from './pages/commander'
import RttPage from './pages/rtt'
import SwoPage from './pages/swo'
import ScopePage from './pages/scope'
import SettingsPage from './pages/settings'

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/flash" replace />} />
        <Route path="/flash" element={<FlashPage />} />
        <Route path="/commander" element={<CommanderPage />} />
        <Route path="/rtt" element={<RttPage />} />
        <Route path="/swo" element={<SwoPage />} />
        <Route path="/scope" element={<ScopePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
