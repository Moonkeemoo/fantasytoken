import { create } from 'zustand';

/**
 * Tiny global toggle so any "Invite" trigger anywhere in the app — Lobby
 * carousel, Profile section, Referrals leaderboard — opens the same
 * <InviteCardModal>. The modal itself is mounted once at App root.
 */
interface InviteSheetState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useInviteSheet = create<InviteSheetState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
