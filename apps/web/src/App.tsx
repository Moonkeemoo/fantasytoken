import { Route, Routes } from 'react-router-dom';

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <main className="min-h-dvh p-4">
            <h1 className="text-xl font-semibold">Fantasy Token League</h1>
            <p className="text-tg-hint mt-2">Skeleton ready. Features coming.</p>
          </main>
        }
      />
    </Routes>
  );
}
