"use client";

import { useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { EMPTY_FORM_VALUES } from "@/lib/constants";
import { buildHoldingFromDraft, validateHoldingDraft } from "@/lib/portfolio";
import type { Holding, HoldingDraft, HoldingType } from "@/lib/types";

const tabs: { label: string; value: HoldingType }[] = [
  { label: "Cash", value: "cash" },
  { label: "ETF", value: "etf" },
  { label: "Crypto", value: "crypto" },
  { label: "Debt", value: "debt" },
  { label: "Asset", value: "manualAsset" },
];

export function HoldingForm({
  initialDraft,
  onClose,
  onSave,
}: {
  initialDraft: HoldingDraft;
  onClose: () => void;
  onSave: (holding: Holding) => void;
}) {
  const [draft, setDraft] = useState<HoldingDraft>(initialDraft);
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<HoldingDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const handleTypeChange = (type: HoldingType) => {
    setDraft((current) => ({
      ...EMPTY_FORM_VALUES,
      id: current.id,
      type,
      name: current.name,
      notes: current.notes,
    }));
    setErrors([]);
  };

  const submit = () => {
    const validation = validateHoldingDraft(draft);
    if (validation.length) {
      setErrors(validation);
      return;
    }

    onSave(buildHoldingFromDraft(draft));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <p className="eyebrow">{draft.id ? "Edit holding" : "Add holding"}</p>
            <h2>{draft.id ? "Update portfolio item" : "Create a new portfolio item"}</h2>
          </div>
          <button className="ghost-button" onClick={onClose} type="button" aria-label="Close holding form">
            <X size={18} />
          </button>
        </div>

        <div className="type-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              className={clsx(draft.type === tab.value && "active")}
              onClick={() => handleTypeChange(tab.value)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="form-grid">
          <label>
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder={
                draft.type === "cash"
                  ? "UBank Cash"
                  : draft.type === "debt"
                    ? "Mortgage"
                    : draft.type === "manualAsset"
                      ? "Car"
                      : "Holding name"
              }
            />
          </label>

          {draft.type === "cash" || draft.type === "debt" ? (
            <label>
              <span>Amount in AUD</span>
              <input
                inputMode="decimal"
                value={draft.amountAud}
                onChange={(event) => update({ amountAud: event.target.value })}
                placeholder="10000"
              />
            </label>
          ) : null}

          {draft.type === "manualAsset" ? (
            <label>
              <span>Estimated value in AUD</span>
              <input
                inputMode="decimal"
                value={draft.assetValueAud}
                onChange={(event) => update({ assetValueAud: event.target.value })}
                placeholder="15000"
              />
            </label>
          ) : null}

          {draft.type === "etf" ? (
            <>
              <label>
                <span>Ticker</span>
                <input
                  value={draft.ticker}
                  onChange={(event) => update({ ticker: event.target.value.toUpperCase() })}
                  placeholder="ETHI"
                />
              </label>
              <label>
                <span>Units</span>
                <input
                  inputMode="decimal"
                  value={draft.units}
                  onChange={(event) => update({ units: event.target.value })}
                  placeholder="52.4"
                />
              </label>
              <label>
                <span>Market</span>
                <input
                  value={draft.market}
                  onChange={(event) => update({ market: event.target.value.toUpperCase() })}
                  placeholder="ASX"
                />
              </label>
            </>
          ) : null}

          {draft.type === "crypto" ? (
            <>
              <label>
                <span>Coin symbol or ID</span>
                <input
                  value={draft.symbol}
                  onChange={(event) => update({ symbol: event.target.value })}
                  placeholder="BTC"
                />
              </label>
              <label>
                <span>Amount held</span>
                <input
                  inputMode="decimal"
                  value={draft.cryptoAmount}
                  onChange={(event) => update({ cryptoAmount: event.target.value })}
                  placeholder="0.425"
                />
              </label>
            </>
          ) : null}

          <label className="full-span">
            <span>Notes</span>
            <textarea
              value={draft.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Optional manual notes"
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
            {draft.id ? "Save changes" : "Add holding"}
          </button>
        </div>
      </div>
    </div>
  );
}
