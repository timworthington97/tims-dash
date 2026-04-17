"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { EMPTY_SCENARIO_VALUES } from "@/lib/constants";
import { buildScenarioFromDraft, validateScenarioDraft } from "@/lib/portfolio";
import type { Scenario, ScenarioDraft } from "@/lib/types";

export function ScenarioForm({
  initialDraft,
  onClose,
  onSave,
}: {
  initialDraft: ScenarioDraft;
  onClose: () => void;
  onSave: (scenario: Scenario) => void;
}) {
  const [draft, setDraft] = useState<ScenarioDraft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<ScenarioDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const submit = () => {
    const validation = validateScenarioDraft(draft);
    if (validation.length) {
      setErrors(validation);
      return;
    }

    onSave(buildScenarioFromDraft(draft));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">{draft.id ? "Edit scenario" : "Add scenario"}</p>
            <h2>Model a hypothetical change</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button" aria-label="Close scenario form">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label className="full-span">
            <span>Scenario name</span>
            <input value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="Sell the car and clear debt" />
          </label>
          <label>
            <span>One-time cash addition</span>
            <input
              inputMode="decimal"
              value={draft.cashAdditionAud}
              onChange={(event) => update({ cashAdditionAud: event.target.value })}
              placeholder="5000"
            />
          </label>
          <label>
            <span>Debt reduction</span>
            <input
              inputMode="decimal"
              value={draft.debtReductionAud}
              onChange={(event) => update({ debtReductionAud: event.target.value })}
              placeholder="2000"
            />
          </label>
          <label>
            <span>Manual asset sale amount</span>
            <input
              inputMode="decimal"
              value={draft.assetSaleAud}
              onChange={(event) => update({ assetSaleAud: event.target.value })}
              placeholder="16000"
            />
          </label>
          <label className="full-span">
            <span>Notes</span>
            <textarea value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Optional notes" rows={3} />
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
            {draft.id ? "Save changes" : "Add scenario"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const defaultScenarioDraft = EMPTY_SCENARIO_VALUES;
