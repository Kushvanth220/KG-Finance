"use client";

import { useState } from "react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { PERSON_LABELS, type Account, type AccountType, type Person } from "@/types";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Add or rename an account by hand.
 *
 * Until now the only way to create a card was to ask the assistant, which is a
 * strange place to have to go for something this ordinary. Editing keeps the
 * balance out of reach on purpose — a balance changes through recorded money
 * movement or the explicit "adjust balance" action, never by quietly retyping
 * it in a rename dialog.
 */

const TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: "debit", label: "Debit", hint: "Bank account or debit card" },
  { value: "credit", label: "Credit", hint: "Credit card — a balance is money owed" },
  { value: "cash", label: "Cash", hint: "Physical cash wallet" },
];

export type AccountDraft = Omit<Account, "id">;

export function AccountEditor({
  open,
  initial,
  defaultPerson,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Undefined when adding. */
  initial?: Account;
  defaultPerson: Person;
  onSave: (draft: AccountDraft) => void;
  onClose: () => void;
}) {
  const editing = initial !== undefined;

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "debit");
  const [person, setPerson] = useState<Person>(initial?.person ?? defaultPerson);
  const [shared, setShared] = useState(initial?.shared ?? false);
  const [balance, setBalance] = useState(
    initial ? String(initial.balance) : ""
  );
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimit != null ? String(initial.creditLimit) : ""
  );

  const parsedBalance = balance.trim() === "" ? 0 : Number(balance);
  const parsedLimit = creditLimit.trim() === "" ? undefined : Number(creditLimit);
  const balanceValid = Number.isFinite(parsedBalance);
  const limitValid = parsedLimit === undefined || (Number.isFinite(parsedLimit) && parsedLimit > 0);
  const canSave = name.trim().length > 0 && balanceValid && limitValid;

  const submit = () => {
    if (!canSave) return;
    onSave({
      person,
      name: name.trim(),
      type,
      // On an edit the balance is whatever it already was; this dialog does
      // not move money.
      balance: editing ? initial!.balance : parsedBalance,
      ...(type === "credit" && parsedLimit !== undefined ? { creditLimit: parsedLimit } : {}),
      ...(shared ? { shared: true } : {}),
    });
  };

  const label = "text-sm font-medium text-muted px-1";

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${initial!.name}` : "Add an account"}
    >
      <div className="space-y-4">
        <GlassInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Zolve Debit, Bank of America Credit Card…"
          autoFocus
        />

        <div>
          <label className={label}>What kind?</label>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                disabled={editing}
                className={cn(
                  "rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors disabled:opacity-45",
                  type === option.value ? "bg-[#007aff] text-white" : "glass text-muted"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted">
            {editing
              ? "The kind cannot change — past transactions were recorded against it."
              : TYPES.find((option) => option.value === type)?.hint}
          </p>
        </div>

        <div>
          <label className={label}>Whose account?</label>
          <div className="mt-1.5 flex gap-2">
            {(["kushvanth", "g"] as Person[]).map((who) => (
              <button
                key={who}
                type="button"
                onClick={() => setPerson(who)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors",
                  person === who ? "bg-[#007aff] text-white" : "glass text-muted"
                )}
              >
                {PERSON_LABELS[who]}
              </button>
            ))}
          </div>
        </div>

        {type === "credit" ? (
          <GlassInput
            label="Credit limit (optional)"
            value={creditLimit}
            onChange={(event) => setCreditLimit(event.target.value)}
            inputMode="decimal"
            placeholder="e.g. 2000"
          />
        ) : null}

        {editing ? (
          <p className="rounded-xl glass px-3 py-2.5 text-[11px] text-muted">
            Balance is {formatCurrency(initial!.balance)}. Change it with the balance
            button on the card, so the adjustment is recorded in History.
          </p>
        ) : (
          <GlassInput
            label={type === "credit" ? "Current balance owed" : "Current balance"}
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
          />
        )}

        <button
          type="button"
          onClick={() => setShared((value) => !value)}
          className="flex w-full items-center justify-between rounded-xl glass px-3 py-2.5 text-left"
        >
          <span>
            <span className="block text-xs font-semibold">Shared account</span>
            <span className="block text-[10px] text-muted">
              Both of you use it, like the Green Dot
            </span>
          </span>
          <span
            className={cn(
              "h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
              shared ? "bg-[#34c759]" : "bg-black/15 dark:bg-white/20"
            )}
          >
            <span
              className={cn(
                "block h-4 w-4 rounded-full bg-white transition-transform",
                shared && "translate-x-4"
              )}
            />
          </span>
        </button>

        <div className="flex gap-2 pt-1">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" onClick={submit} disabled={!canSave}>
            {editing ? "Save changes" : "Add account"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
