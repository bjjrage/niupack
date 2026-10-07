import { z } from 'zod';

export const accountIdsSchema = z.array(z.string().uuid()).min(1).max(500);
export const accountDeleteBodySchema = z.object({ company_ids: accountIdsSchema }).strict();

export interface AccountDependencies {
  purchases: number;
  opportunities: number;
  conversations: number;
  leads: number;
  tasks: number;
  activities: number;
  aliases: number;
  staged_rows: number;
  campaign_recipients: number;
  shared_contacts: number;
  other: number;
}

export const emptyAccountDependencies = (): AccountDependencies => ({
  purchases: 0, opportunities: 0, conversations: 0, leads: 0, tasks: 0,
  activities: 0, aliases: 0, staged_rows: 0, campaign_recipients: 0,
  shared_contacts: 0, other: 0,
});

export interface AccountDeletionInspection {
  company_id: string;
  name: string;
  status: 'SAFE_TO_DELETE' | 'BLOCKED_BY_BUSINESS_DATA' | 'NOT_FOUND' | 'DELETED' | 'FAILED';
  dependencies: AccountDependencies;
  references: Record<string, number>;
  contacts: number;
  deleted: boolean;
  deleted_contacts: number;
}

export interface BlockedAccount {
  id: string;
  name: string;
  reason: 'ACCOUNT_HAS_BUSINESS_DATA';
  dependencies: AccountDependencies;
  references: Record<string, number>;
}

export interface AccountDeletionPreview {
  requested: number;
  deletable: number;
  blocked: number;
  not_found: number;
  contacts_to_delete: number;
  deletable_ids: string[];
  not_found_ids: string[];
  blocked_accounts: BlockedAccount[];
}

export interface BulkAccountDeletionResult {
  requested: number;
  deleted: number;
  blocked: number;
  not_found: number;
  deleted_contacts: number;
  deleted_ids: string[];
  not_found_ids: string[];
  blocked_accounts: BlockedAccount[];
  failed_accounts: Array<{ id: string; reason: string }>;
}
