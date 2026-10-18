import * as z from "zod/mini";

const ConfigurationIdSchema = z
  .string()
  .check(z.refine((value) => value.length > 0 && value === value.trim()));

export const SourceIdSchema = z.uuid().brand("SourceId");
export const DashboardIdSchema = ConfigurationIdSchema.brand("DashboardId");
export const LayoutItemIdSchema = ConfigurationIdSchema.brand("LayoutItemId");
export const ReportDimensionIdSchema = z.string().brand("ReportDimensionId");
export const ReportMeasureIdSchema = z.string().brand("ReportMeasureId");
export const ReportColumnIdSchema = z.string().brand("ReportColumnId");
export const ReportRowIdSchema = z.string().brand("ReportRowId");
export const UserIdSchema = z.string().brand("UserId");
export const AccountIdSchema = z.string().brand("AccountId");
export const CategoryIdSchema = z.string().brand("CategoryId");
export const MerchantIdSchema = z.string().brand("MerchantId");
export const TagIdSchema = z.string().brand("TagId");
export const TransactionIdSchema = z.string().brand("TransactionId");
export const EntryIdSchema = z.string().brand("EntryId");
export const TransferIdSchema = z.string().brand("TransferId");
export const StatementIdSchema = z.uuid().brand("StatementId");
export const RecurringTransactionIdSchema = z.string().brand("RecurringTransactionId");
export const ExternalIdSchema = z.string().brand("ExternalId");
export const ChatIdSchema = z.string().brand("ChatId");
export const MessageIdSchema = z.string().brand("MessageId");

export type SourceId = z.infer<typeof SourceIdSchema>;
export type DashboardId = z.infer<typeof DashboardIdSchema>;
export type LayoutItemId = z.infer<typeof LayoutItemIdSchema>;
export type ReportDimensionId = z.infer<typeof ReportDimensionIdSchema>;
export type ReportMeasureId = z.infer<typeof ReportMeasureIdSchema>;
export type ReportRowId = z.infer<typeof ReportRowIdSchema>;
export type ReportColumnId = z.infer<typeof ReportColumnIdSchema>;
export type UserId = z.infer<typeof UserIdSchema>;
export type AccountId = z.infer<typeof AccountIdSchema>;
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type MerchantId = z.infer<typeof MerchantIdSchema>;
export type TagId = z.infer<typeof TagIdSchema>;
export type TransactionId = z.infer<typeof TransactionIdSchema>;
export type EntryId = z.infer<typeof EntryIdSchema>;
export type TransferId = z.infer<typeof TransferIdSchema>;
export type StatementId = z.infer<typeof StatementIdSchema>;
export type RecurringTransactionId = z.infer<typeof RecurringTransactionIdSchema>;
export type ExternalId = z.infer<typeof ExternalIdSchema>;
export type ChatId = z.infer<typeof ChatIdSchema>;
export type MessageId = z.infer<typeof MessageIdSchema>;
