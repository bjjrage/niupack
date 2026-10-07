// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountsView } from '@/components/crm/views/AccountsView';
import type { CompanyRow, CrmActions, CrmData } from '@/components/crm/types';
import { emptyAccountDependencies, type AccountDeletionPreview } from '@/lib/crm/account-deletion';

vi.mock('@/components/crm/CommercialDataImporter', () => ({ CommercialDataImporter: () => null }));

const companies: CompanyRow[] = [
  { id: crypto.randomUUID(), name: 'Cuenta Importada', lifecycle_stage: 'CUSTOMER', source: 'IMPORT_CUSTOMER_LIST' },
  { id: crypto.randomUUID(), name: 'Cuenta Manual', lifecycle_stage: 'CUSTOMER', source: 'MANUAL' },
  { id: crypto.randomUUID(), name: 'Prospecto Importado', lifecycle_stage: 'PROSPECT', source: 'IMPORT_PROSPECT_LIST' },
];
const actions: CrmActions = { reload: vi.fn(), notify: vi.fn(), openAccount: vi.fn(), openOpp: vi.fn(), openConversation: vi.fn(), newTask: vi.fn() };
const data: CrmData = {
  companies, contacts: [], health: [], opps: [], tasks: [], owners: [], leads: [], inbox: [], alerts: [],
  catalog: [], catalogBySku: new Map(), companyById: new Map(companies.map(c => [c.id,c])),
  contactById: new Map(), leadById: new Map(), oppById: new Map(), dash: null, loading: false,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const preview = (ids: string[]): AccountDeletionPreview => ({
  requested: ids.length, deletable: ids.length, blocked: 0, not_found: 0,
  contacts_to_delete: 3, deletable_ids: ids, not_found_ids: [], blocked_accounts: [],
});
beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Accounts UI selection and confirmed deletion', () => {
  it('individual checkboxes and select-all include only current visible rows', async () => {
    const user = userEvent.setup(); render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar Cuenta Importada' }));
    expect(actions.openAccount).not.toHaveBeenCalled();
    const header = screen.getByRole('checkbox', { name: 'Seleccionar cuentas visibles' }) as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    await user.click(header);
    expect(screen.getByText('2 seleccionadas')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar Prospecto Importado' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Deseleccionar' }));
    expect((screen.getByRole('checkbox', { name: 'Seleccionar Cuenta Manual' }) as HTMLInputElement).checked).toBe(false);
    await user.type(screen.getByRole('textbox', { name: 'Buscar cuentas' }), 'Importada');
    await user.click(header);
    expect(screen.getByText('1 seleccionadas')).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar Cuenta Manual' })).toBeNull();
  });

  it('source filter excludes MANUAL and supports both customer and prospect imports', async () => {
    const user = userEvent.setup(); render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.selectOptions(screen.getByLabelText('Origen de cuentas'), 'imported');
    expect(screen.getByText('Cuenta Importada')).toBeTruthy();
    expect(screen.queryByText('Cuenta Manual')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Clientes potenciales/ }));
    expect(screen.getByText('Prospecto Importado')).toBeTruthy();
    expect(screen.queryByText('Cuenta Importada')).toBeNull();
  });

  it.each(['source', 'search', 'tab'])('changing %s explicitly resets selection before another deletion', async (scope) => {
    const user = userEvent.setup(); render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar cuentas visibles' }));
    if (scope === 'source') await user.selectOptions(screen.getByLabelText('Origen de cuentas'), 'imported');
    if (scope === 'search') await user.type(screen.getByRole('textbox', { name: 'Buscar cuentas' }), 'Importada');
    if (scope === 'tab') await user.click(screen.getByRole('button', { name: /Clientes potenciales/ }));
    expect(screen.queryByRole('button', { name: 'Eliminar seleccionadas' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Se restableció la selección');
    expect(screen.getAllByRole('checkbox').every(node => !(node as HTMLInputElement).checked)).toBe(true);
  });

  it('bulk preview preserves blocked accounts and sends only explicitly confirmed safe IDs, then reloads', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(response({
      ...preview(companies.slice(0,2).map(c => c.id)), deletable: 1, blocked: 1, deletable_ids: [companies[0].id],
      blocked_accounts: [{ id: companies[1].id, name: companies[1].name, reason: 'ACCOUNT_HAS_BUSINESS_DATA', dependencies: { ...emptyAccountDependencies(), purchases: 2 }, references: {} }],
    })).mockResolvedValueOnce(response({ requested: 1, deleted: 1, blocked: 0, not_found: 0, deleted_contacts: 3, deleted_ids: [companies[0].id], not_found_ids: [], blocked_accounts: [], failed_accounts: [] }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar cuentas visibles' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar seleccionadas' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Las 1 bloqueadas permanecerán intactas.')).toBeTruthy();
    expect(within(dialog).getByText('Compras: 2')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(actions.reload).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar 1 cuentas' }));
    await waitFor(() => expect(actions.reload).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ company_ids: [companies[0].id] });
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Cuenta Importada')).toBeNull();
    expect(screen.getByText('Cuenta Manual')).toBeTruthy();
    expect(screen.getByText('1 seleccionadas')).toBeTruthy();
  });

  it('row menu connects individual confirmation to DELETE and refreshes counts immediately', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(preview([companies[0].id])))
      .mockResolvedValueOnce(response({ company_id: companies[0].id, deleted: true, deleted_contacts: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.click(screen.getByLabelText('Acciones de Cuenta Importada'));
    const row = screen.getByText('Cuenta Importada').closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog');
    const confirm = await within(dialog).findByRole('button', { name: 'Eliminar' });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(confirm);
    await waitFor(() => expect(fetchMock.mock.calls[1][0]).toBe(`/api/crm/accounts/${companies[0].id}`));
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    await waitFor(() => expect(actions.reload).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByText('Cuenta Importada')).toBeNull();
  });

  it('cancel and blocked individual accounts never send a destructive request', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(response({
      ...preview([companies[0].id]), deletable: 0, blocked: 1, deletable_ids: [], contacts_to_delete: 0,
      blocked_accounts: [{ id: companies[0].id, name: companies[0].name, reason: 'ACCOUNT_HAS_BUSINESS_DATA', dependencies: { ...emptyAccountDependencies(), conversations: 1 }, references: {} }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountsView data={data} actions={actions} onNew={vi.fn()} />);
    await user.click(screen.getByLabelText('Acciones de Cuenta Importada'));
    await user.click(within(screen.getByText('Cuenta Importada').closest('tr')!).getByRole('button', { name: 'Eliminar cuenta' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/No se puede eliminar esta cuenta/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(actions.reload).not.toHaveBeenCalled();
    expect(screen.getByText('Cuenta Importada')).toBeTruthy();
  });
});
