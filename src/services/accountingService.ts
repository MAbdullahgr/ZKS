// src/services/accountingService.ts
//
// BACKWARD-COMPATIBILITY BARREL.
//
// The original 1,614-line accountingService.ts has been decomposed into
// focused modules under src/services/accounting/:
//
//   accounting/constants.ts  — ACCOUNT_CODES, account-code → expense-category map
//   accounting/types.ts      — JournalLineInput, PostJournalEntryInput, Tx, etc.
//   accounting/core.ts       — postJournalEntry, reverseJournalEntry, getAccountByCode
//   accounting/reports.ts    — getAccountBalance, getTrialBalance, getProfitAndLoss, getBalanceSheet
//   accounting/posting.ts    — postSaleJournalEntry, postSaleReturnJournalEntry, …
//                              (one helper per business event)
//
// This file re-exports everything so that existing imports keep working
// without any code changes at call sites:
//
//   import { postSaleJournalEntry, ACCOUNT_CODES } from "@/services/accountingService";
//   import { getTrialBalance } from "./accountingService";
//
// New code SHOULD import from the specific submodules for better tree-shaking
// and clearer dependency graphs:
//
//   import { postSaleJournalEntry } from "@/services/accounting/posting";
//   import { getTrialBalance } from "@/services/accounting/reports";
//   import { ACCOUNT_CODES } from "@/services/accounting/constants";
//
// The barrel will be kept indefinitely — removing it would be a breaking
// change for no real benefit.

export { ACCOUNT_CODES, EXPENSE_CATEGORY_TO_ACCOUNT } from "./accounting/constants";
export type { AccountCode } from "./accounting/constants";

export type {
  JournalLineInput,
  PostJournalEntryInput,
  JournalEntryResult,
  AccountRef,
  Tx,
} from "./accounting/types";

export {
  getAccountByCode,
  postJournalEntry,
  reverseJournalEntry,
  logAutoPostFailure,
} from "./accounting/core";

export type {
  AccountBalanceResult,
  TrialBalanceRow,
  TrialBalanceResult,
  ProfitAndLossResult,
  BalanceSheetResult,
} from "./accounting/reports";

export {
  getAccountBalance,
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
} from "./accounting/reports";

export type {
  SaleJournalInput,
  SaleReturnJournalInput,
  SaleReturnSplit,
  ExpenseJournalInput,
  InventoryAdjustmentJournalInput,
  SupplierPaymentJournalInput,
  KhataPaymentJournalInput,
  PurchaseReceiptJournalInput,
  PayrollJournalInput,
  CashAdjustmentJournalInput,
  TransferJournalInput,
} from "./accounting/posting";

export {
  postSaleJournalEntry,
  postSaleReturnJournalEntry,
  postExpenseJournalEntry,
  postInventoryAdjustmentJournalEntry,
  postSupplierPaymentJournalEntry,
  postKhataPaymentJournalEntry,
  postPurchaseReceiptJournalEntry,
  postPayrollJournalEntry,
  postCashAdjustmentJournalEntry,
  postTransferDispatchJournalEntry,
  postTransferReceiveJournalEntry,
  postTransferCancelJournalEntry,
  postTransferSettlementJournalEntry,
} from "./accounting/posting";
