import { Route, Routes } from 'react-router-dom';
import { StatusPage } from './features/status/StatusPage.js';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StatusPage />} />
    </Routes>
  );
}
