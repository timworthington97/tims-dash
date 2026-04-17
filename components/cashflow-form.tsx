"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { EMPTY_EXPENSE_VALUES, EMPTY_INCOME_VALUES } from "@/lib/constants";
import {
  buildExpenseFromDraft,
  buildIncomeFromDraft,
  validateExpenseDraft,
  validateIncomeDraft,
} from "@/lib/portfolio";
import type { ExpenseDraft, ExpenseEntry, IncomeDraft, IncomeEntry, IncomeFrequency } from "@/lib/types";

const incomeFrequencies: { label: string; value: IncomeFrequency }[] = [
  { label: "Monthly", value: "monthly" },
  { label: "Fortnightly", value: "fortnightly" },
  { label: "Weekly", value: "weekly" },
  { label: "Yearly", value: "yearly" },
  { label: "One-off", value: "oneOff" },
];

export function CashflowForm({
  kind,
  initialDraft,
  onClose,
  onSave,
}: {
  kind: "income" | "expense";
  initialDraft: IncomeDraft | ExpenseDraft;
  onClose: () => void;
  onSave: (entry: IncomeEntry | ExpenseEntry) => void;
}) {
  const [draft, setDraft] = useState<IncomeDraft | ExpenseDraft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<IncomeDraft & ExpenseDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    if (kind === "income") {
      const validation = validateIncomeDraft(draft as IncomeDraft);
      if (validation.length) {
        setErrors(validation);
        return;
      }
      onSave(buildIncomeFromDraft(draft as IncomeDraft));
      return;
    }

    const validation = validateExpenseDraft(draft as ExpenseDraft);
    if (validation.length) {
      setErrors(validation);
      return;
    }
    onSave(buildExpenseFromDraft(draft as ExpenseDraft));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">{(draft as IncomeDraft).id ? `Edit ${kind}` : `Add ${kind}`}</p>
            <h2>{kind === "income" ? "Track income" : "Track expenses"}</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button" aria-label={`Close ${kind} form`}>
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={kind === "income" ? "Salary" : "Rent"}
            />
          </label>
          <label>
            <span>Amount in AUD</span>
            <input
              inputMode="decimal"
              value={draft.amount}
              onChange={(event) => update({ amount: event.target.value })}
              placeholder="2500"
            />
          </label>

          {kind === "income" ? (
            <label>
              <span>Frequency</span>
              <select
                value={(draft as IncomeDraft).frequency}
                onChange={(event) => update({ frequency: event.target.value as IncomeFrequency })}
              >
                {incomeFrequencies.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="full-span">
            <span>Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Optional notes"
              rows={3}
            />
          </label>
        </div>

        {errors.length ? (
          <div className="form-errors">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="primary-button" onClick={submit} type="button">
            {(draft as IncomeDraft).id ? "Save changes" : kind === "income" ? "Add income" : "Add expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const defaultIncomeDraft = EMPTY_INCOME_VALUES;
export const defaultExpenseDraft = EMPTY_EXPENSE_VALUES;
