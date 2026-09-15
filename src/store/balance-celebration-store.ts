import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import type { BalanceCelebrationPayload } from "@/lib/balance-celebration";

export interface BalanceCelebrationEvent extends BalanceCelebrationPayload {
  id: string;
}

interface BalanceCelebrationStore {
  event: BalanceCelebrationEvent | null;
  show: (payload: BalanceCelebrationPayload) => void;
  dismiss: () => void;
}

export const useBalanceCelebrationStore = create<BalanceCelebrationStore>((set) => ({
  event: null,
  show: (payload) => set({ event: { ...payload, id: uuidv4() } }),
  dismiss: () => set({ event: null }),
}));
