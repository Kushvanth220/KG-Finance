"use client";

import {
  accountChoicePrompt,
  buildToolConfirmationPreview,
  EXPENSE_PAID_BY_CHIPS,
  EXPENSE_PERSON_CHIPS,
  withExpensePerson,
  withPaidBy,
  withPickedAccount,
} from "@/lib/ai/assistant-confirmation";
import { allCategoryChips, type AssistantChat } from "@/components/assistant/use-assistant-chat";

/**
 * The card a money write waits on: what will be saved, the choices it still
 * needs (who it was for, who paid, which account, which category), and the
 * two buttons. Nothing reaches the ledger without "Yes, save".
 *
 * Shared by every face of the text assistant so the consent step looks and
 * behaves the same wherever it appears. After a save, the same slot shows
 * what was recorded.
 */
export function ConfirmWriteCard({ chat }: { chat: AssistantChat }) {
  const { savedBanner, pendingConfirm, pendingRest, accountChoices, accountChoiceKind, loading } = chat;

  if (savedBanner) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky bottom-0 z-20 rounded-xl bg-positive/15 border border-positive/30 px-3 py-2 text-[12px] text-positive text-center font-semibold backdrop-blur-md"
      >
        {savedBanner}
      </div>
    );
  }

  if (!pendingConfirm) return null;

  return (
    <div
      role="region"
      aria-label="Confirm this money change"
      className="sticky bottom-0 z-20 rounded-xl bg-caution/10 border border-caution/25 px-3 py-2.5 space-y-2 backdrop-blur-md"
    >
      <p className="text-[11px] text-caution text-center font-medium">
        {buildToolConfirmationPreview(pendingConfirm)}
        {pendingRest.length > 0 ? (
          <span className="mt-1 block text-[11px] text-muted">{pendingRest.length} more after this one.</span>
        ) : null}
      </p>
      {accountChoices.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[11px] text-accent text-center font-medium">
            {accountChoicePrompt(pendingConfirm.name, accountChoiceKind)}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {accountChoices.map((account) => (
              <button
                key={account.id}
                type="button"
                disabled={loading}
                onClick={() => {
                  chat.setPendingConfirm(withPickedAccount(pendingConfirm, account, accountChoiceKind));
                  chat.setAccountChoices([]);
                }}
                className="min-h-11 rounded-full border border-black/10 dark:border-white/10 px-3.5 py-2 text-[12px] font-semibold"
              >
                {account.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {pendingConfirm.name === "record_expense" ? (
            <>
              <div className="flex flex-wrap justify-center gap-2">
                {EXPENSE_PERSON_CHIPS.map((chip) => {
                  const selected = String(pendingConfirm.args.expense_for ?? "") === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        chat.setPendingConfirm({
                          ...pendingConfirm,
                          args: withExpensePerson(pendingConfirm.args, chip.id),
                        });
                      }}
                      className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        selected ? "border-accent bg-accent/15 text-accent" : "border-black/10 dark:border-white/10"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {EXPENSE_PAID_BY_CHIPS.map((chip) => {
                  const selected = String(pendingConfirm.args.paid_by ?? "") === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        chat.setPendingConfirm({
                          ...pendingConfirm,
                          args: withPaidBy(pendingConfirm.args, chip.id),
                        });
                      }}
                      className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                        selected ? "border-accent bg-accent/15 text-accent" : "border-black/10 dark:border-white/10"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          {pendingConfirm.name === "record_expense" && !String(pendingConfirm.args.category ?? "").trim() ? (
            <div className="flex flex-wrap justify-center gap-2">
              {allCategoryChips().map((category) => (
                <button
                  key={category.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    chat.setPendingConfirm({
                      ...pendingConfirm,
                      args: { ...pendingConfirm.args, category: category.name },
                    });
                  }}
                  className="min-h-11 rounded-full border border-black/10 dark:border-white/10 px-3.5 py-2 text-[12px] font-semibold"
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              autoFocus
              disabled={loading}
              onClick={() => void chat.confirmPending()}
              className="flex-1 min-h-11 rounded-lg bg-positive text-white py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              Yes, save
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={chat.declinePending}
              className="flex-1 min-h-11 rounded-lg bg-black/5 dark:bg-white/10 text-foreground py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              No
            </button>
          </div>
        </>
      )}
    </div>
  );
}
