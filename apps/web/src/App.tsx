import { Route, Routes } from 'react-router-dom';
import { Lobby } from './features/lobby/Lobby.js';
import { TeamBuilder } from './features/team-builder/TeamBuilder.js';
import { AllocSheetDev } from './features/team-builder/AllocSheetDev.js';
import { LockedScreen } from './features/lobby/LockedScreen.js';
import { BrowseScreen } from './features/lobby/BrowseScreen.js';
import { StatusPage } from './features/status/StatusPage.js';
import { Live } from './features/live/Live.js';
import { LiveList } from './features/live-list/LiveList.js';
import { Rankings } from './features/rankings/Rankings.js';
import { Result } from './features/result/Result.js';
import { Loading } from './features/loading/Loading.js';
import { Tutorial } from './features/tutorial/Tutorial.js';
import { Profile } from './features/profile/Profile.js';
import { RefereeWelcome } from './features/referrals/RefereeWelcome.js';
import { CommissionToast } from './features/referrals/CommissionToast.js';
import { ReferralFriend } from './features/referrals/ReferralFriend.js';
import { ReferralsDetail } from './features/referrals/ReferralsDetail.js';
import { GlobalInviteSheet } from './features/referrals/GlobalInviteSheet.js';
import { BottomNav } from './features/lobby/BottomNav.js';

export function App() {
  return (
    <>
      <CommissionToast />
      <GlobalInviteSheet />
      <Routes>
        <Route path="/" element={<Loading />} />
        <Route path="/welcome" element={<RefereeWelcome />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/contests/:id/build" element={<TeamBuilder />} />
        <Route path="/contests/:id/locked" element={<LockedScreen />} />
        <Route path="/contests/:id/browse" element={<BrowseScreen />} />
        <Route path="/contests/:id/live" element={<Live />} />
        <Route path="/contests/:id/result" element={<Result />} />
        <Route path="/live" element={<LiveList />} />
        <Route path="/rankings" element={<Rankings />} />
        <Route path="/me" element={<Profile />} />
        <Route path="/me/referrals" element={<ReferralsDetail />} />
        <Route path="/me/referrals/:friendId" element={<ReferralFriend />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/dev/alloc-sheet" element={<AllocSheetDev />} />
        <Route
          path="*"
          element={
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper p-6 text-ink">
              <div className="text-[42px] font-extrabold">404</div>
              <a
                href="/lobby"
                className="font-mono text-[11px] uppercase tracking-[0.04em] text-accent"
              >
                ← back to lobby
              </a>
            </div>
          }
        />
      </Routes>
      <BottomNav />
    </>
  );
}
