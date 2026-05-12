"use client";

import { useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, X } from "lucide-react";
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

interface PurchaseLotRow {
  id: string;
  date: string;
  quantity: string;
  costAud: string;
}

function rowId() {
  return `purchase-${Math.random().toString(36).slice(2, 10)}`;
}

function parsePurchaseRows(value: string): PurchaseLotRow[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [date = "", quantity = "", costAud = ""] = line.split(/[,|]/).map((part) => part.trim());
      return { id: rowId(), date, quantity, costAud };
    });
}

function serializePurchaseRows(rows: PurchaseLotRow[]) {
  return rows
    .filter((row) => row.date || row.quantity || row.costAud)
    .map((row) => `${row.date}, ${row.quantity}, ${row.costAud}`)
    .join("\n");
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [purchaseRows, setPurchaseRows] = useState<PurchaseLotRow[]>(() => parsePurchaseRows(initialDraft.purchaseLotsText));
  const [errors, setErrors] = useState<string[]>([]);

  const update = (patch: Partial<HoldingDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updatePurchaseRows = (rows: PurchaseLotRow[]) => {
    setPurchaseRows(rows);
    update({ purchaseLotsText: serializePurchaseRows(rows) });
  };

  const handleTypeChange = (type: HoldingType) => {
    setDraft((current) => ({
      ...EMPTY_FORM_VALUES,
      id: current.id,
      type,
      name: current.name,
      notes: current.notes,
    }));
    setPurchaseRows([]);
    setErrors([]);
  };

  const addPurchaseRow = () => {
    updatePurchaseRows([...purchaseRows, { id: rowId(), date: todayInputValue(), quantity: "", costAud: "" }]);
  };

  const updatePurchaseRow = (id: string, patch: Partial<PurchaseLotRow>) => {
    updatePurchaseRows(purchaseRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removePurchaseRow = (id: string) => {
    updatePurchaseRows(purchaseRows.filter((row) => row.id !== id));
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
            <h2>{draft.id ? "Update this holding" : "Add something you own or owe"}</h2>
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
              <span>Estimated value</span>
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
              <label>
                <span>Total invested</span>
                <input
                  inputMode="decimal"
                  value={draft.costBasisAud}
                  onChange={(event) => update({ costBasisAud: event.target.value })}
                  placeholder="2500"
                />
              </label>
              <div className="form-field full-span">
                <span>Purchase history</span>
                <PurchaseLotEditor
                  rows={purchaseRows}
                  quantityLabel="Units bought"
                  quantityPlaceholder="24"
                  onAdd={addPurchaseRow}
                  onRemove={removePurchaseRow}
                  onUpdate={updatePurchaseRow}
                />
                <small>Optional. Add dated buys so Tim&apos;s Dash can calculate gain/loss by period.</small>
              </div>
            </>
          ) : null}

          {draft.type === "crypto" ? (
            <>
              <label>
                <span>Coin symbol</span>
                <input
                  value={draft.symbol}
                  onChange={(event) => update({ symbol: event.target.value })}
                  placeholder="BTC"
                />
              </label>
              <label>
                <span>Amount you hold</span>
                <input
                  inputMode="decimal"
                  value={draft.cryptoAmount}
                  onChange={(event) => update({ cryptoAmount: event.target.value })}
                  placeholder="0.425"
                />
              </label>
              <label>
                <span>Total invested</span>
                <input
                  inputMode="decimal"
                  value={draft.costBasisAud}
                  onChange={(event) => update({ costBasisAud: event.target.value })}
                  placeholder="5000"
                />
              </label>
              <div className="form-field full-span">
                <span>Purchase history</span>
                <PurchaseLotEditor
                  rows={purchaseRows}
                  quantityLabel="Amount bought"
                  quantityPlaceholder="0.02"
                  onAdd={addPurchaseRow}
                  onRemove={removePurchaseRow}
                  onUpdate={updatePurchaseRow}
                />
                <small>Optional. Add dated buys so Tim&apos;s Dash can calculate gain/loss by period.</small>
              </div>
            </>
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
            {draft.id ? "Save changes" : "Add holding"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurchaseLotEditor({
  rows,
  quantityLabel,
  quantityPlaceholder,
  onAdd,
  onRemove,
  onUpdate,
}: {
  rows: PurchaseLotRow[];
  quantityLabel: string;
  quantityPlaceholder: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<PurchaseLotRow>) => void;
}) {
  return (
    <div className="purchase-lot-editor">
      {rows.length ? (
        <div className="purchase-lot-list">
          {rows.map((row, index) => (
            <div key={row.id} className="purchase-lot-row">
              <label>
                <span>Purchase date</span>
                <input
                  type="date"
                  value={row.date}
                  onChange={(event) => onUpdate(row.id, { date: event.target.value })}
                  aria-label={`Purchase ${index + 1} date`}
                />
              </label>
              <label>
                <span>{quantityLabel}</span>
                <input
                  inputMode="decimal"
                  value={row.quantity}
                  onChange={(event) => onUpdate(row.id, { quantity: event.target.value })}
                  placeholder={quantityPlaceholder}
                  aria-label={`Purchase ${index + 1} quantity`}
                />
              </label>
              <label>
                <span>Total paid AUD</span>
                <input
                  inputMode="decimal"
                  value={row.costAud}
                  onChange={(event) => onUpdate(row.id, { costAud: event.target.value })}
                  placeholder="500"
                  aria-label={`Purchase ${index + 1} total paid`}
                />
              </label>
              <button
                className="ghost-button danger purchase-lot-remove"
                onClick={() => onRemove(row.id)}
                type="button"
                aria-label={`Remove purchase ${index + 1}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="purchase-lot-empty">
          <span>No purchases added yet.</span>
          <small>You can still use Total invested, or add dated buys for better period insights.</small>
        </div>
      )}
      <button className="secondary-button purchase-lot-add" onClick={onAdd} type="button">
        <Plus size={16} />
        Add purchase
      </button>
    </div>
  );
}
