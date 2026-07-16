// src/services/poStateMachine.ts
//
// Explicit state machine for PurchaseOrder.status. The previous code allowed
// PATCH /api/purchases/[id] to set ANY status — including jumping straight
// from `draft` to `received` (skipping `ordered` and `partial`), or moving
// a `received` order back to `draft`. Those transitions corrupt downstream
// accounting (PO receipt JEs, supplier ledger entries) and confuse the
// warehouse UI ("why is this received order still showing as draft?").
//
// This module exports:
//   - `canTransition(from, to)`     — pure boolean check
//   - `assertTransition(from, to)`  — throws HttpError on invalid transition
//   - `PATCH_ALLOWED_TRANSITIONS`   — the subset allowed via PATCH
//                                    (everything else goes through
//                                    /receive or /send)

import { HttpError } from "@/lib/api-error";

export type POStatus = "draft" | "ordered" | "partial" | "received" | "cancelled";

const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  draft: ["ordered", "cancelled"],
  ordered: ["partial", "received", "cancelled"],
  partial: ["received", "cancelled"],
  received: [], // terminal state
  cancelled: [], // terminal state
};

export function canTransition(from: POStatus, to: POStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: POStatus, to: POStatus): void {
  if (!canTransition(from, to)) {
    throw new HttpError(
      `Cannot transition purchase order from "${from}" to "${to}". Valid transitions: ${VALID_TRANSITIONS[from].join(", ") || "none (terminal state)"}`,
      400,
      "INVALID_STATUS_TRANSITION",
    );
  }
}

// For PATCH /api/purchases/[id] — only allow these fields to be set via PATCH:
//   draft → ordered (when user clicks "Send/Confirm")
//   Any active → cancelled (when user clicks "Cancel")
// Receiving must go through /api/purchases/[id]/receive — never via PATCH,
// because receiving posts a journal entry, updates supplier ledger, and
// increments stock. PATCH must remain a status-only mutation.
export const PATCH_ALLOWED_TRANSITIONS: Array<[POStatus, POStatus]> = [
  ["draft", "ordered"],
  ["ordered", "cancelled"],
  ["partial", "cancelled"],
];

/**
 * Returns true if the (from → to) transition is one of the PATCH-allowed
 * transitions. Use this on the PATCH route to gate which status changes
 * are permitted without going through /receive or /send.
 */
export function isPatchAllowedTransition(
  from: POStatus,
  to: POStatus,
): boolean {
  return PATCH_ALLOWED_TRANSITIONS.some(
    ([f, t]) => f === from && t === to,
  );
}
