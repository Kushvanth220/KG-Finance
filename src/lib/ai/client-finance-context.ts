"use client";

import { waitForStoreHydration, getFinanceState } from "@/store/finance-store";
import {
  buildFinanceContextSummary,
  scopeFinanceStateForUser,
} from "@/lib/ai/finance-scope";
import type { AiUserId } from "@/lib/ai/person";
import type { FinanceState } from "@/types";

/** Live finance context from the hydrated client store (matches what the user sees). */
export async function getClientFinancePayload(userId: AiUserId): Promise<FinanceState> {
  await waitForStoreHydration();
  return getFinanceState();
}

export async function getClientFinanceContext(userId: AiUserId): Promise<string> {
  const state = await getClientFinancePayload(userId);
  const scoped = scopeFinanceStateForUser(state, userId);
  return buildFinanceContextSummary(scoped, userId);
}
