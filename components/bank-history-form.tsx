"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { EMPTY_BANK_HISTORY_VALUES } from "@/lib/constants";
import { buildBankHistoryEntryFromDraft, validateBankHistoryDraft } from "@/lib/portfolio";
import type { BankHistoryDraft, BankHistoryEntry } from "@/lib/types";

export function BankHistoryForm({
  initialDraft,
  onClose,
  onSave,
}: {
  initialDraft: BankHistoryDraft;
  onClose: () => void;
  onSave: (entry: BankHistoryEntry) => void;
}) {
  const [draft, setDraft] = useState<BankHistoryDraft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<BankHistoryDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const submit = () => {
    const validation = validateBankHistoryDraft(draft);
    if (validation.length) {
      setErrors(validation);
      return;
    }

    onSave(buildBankHistoryEntryFromDraft(draft));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">{draft.id ? "Edit bank history" : "Add bank history"}</p>
            <h2>Track monthly bank balance</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button" aria-label="Close bank history form">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label>
            <span>Account name</span>
            <input value={draft.accountName} onChange={(event) => update({ accountName: event.target.value })} placeholder="UBank Everyday" />
          </label>
          <label>
            <span>Account identifier</span>
            <input value={draft.accountId} onChange={(event) => update({ accountId: event.target.value })} placeholder="Optional account number" />
          </label>
          <label>
            <span>Month</span>
            <input type="month" value={draft.month} onChange={(event) => update({ month: event.target.value })} />
          </label>
          <label>
            <span>Ending bank balance in AUD</span>
            <input
              inputMode="decimal"
              value={draft.endingBalanceAud}
              onChange={(event) => update({ endingBalanceAud: event.target.value })}
              placeholder="18250"
            />
          </label>
          <label className="full-span">
            <span>Note</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Optional note"
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
            {draft.id ? "Save changes" : "Add history entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const defaultBankHistoryDraft = EMPTY_BANK_HISTORY_VALUES;
