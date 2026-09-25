'use client';

import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';
import { convertToCSV } from '@/lib/utils/csv-tools';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T extends Record<string, any>> {
  columns: Column<T>[];
  data: T[];
  searchKey?: string;
  searchPlaceholder?: string;
  exportFilename?: string;
  dense?: boolean;
  pageSize?: number;
  emptyMessage?: string;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Buscar...',
  exportFilename = 'export.csv',
  dense = true,
  pageSize = 15,
  emptyMessage = 'No se encontraron registros.',
  actions,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Search filter
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lower = searchTerm.toLowerCase();

    return data.filter((row) => {
      if (searchKey && row[searchKey]) {
        return String(row[searchKey]).toLowerCase().includes(lower);
      }
      return Object.values(row).some((val) => String(val).toLowerCase().includes(lower));
    });
  }, [data, searchTerm, searchKey]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return sortOrder === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
  }, [filteredData, sortKey, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const handleExportCSV = () => {
    const csvCols = columns.map((c) => ({ key: c.key as keyof T, header: c.header }));
    const csvContent = convertToCSV(sortedData, csvCols);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', exportFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#141820] border border-slate-800 rounded flex flex-col">
      {/* Table Toolbar */}
      <div className="p-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full bg-[#0c0f14] border border-slate-700/80 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-tabular">
            {sortedData.length} {sortedData.length === 1 ? 'registro' : 'registros'}
          </span>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-200">
          <thead className="bg-[#10141b] text-slate-400 font-medium border-b border-slate-800 sticky top-0 z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 select-none ${
                    col.sortable !== false ? 'cursor-pointer hover:text-white' : ''
                  } ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${
                    col.className || ''
                  }`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <div
                    className={`inline-flex items-center gap-1 ${
                      col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : 'justify-start'
                    }`}
                  >
                    <span>{col.header}</span>
                    {col.sortable !== false && (
                      <ArrowUpDown className="h-3 w-3 text-slate-500 hover:text-slate-300" />
                    )}
                  </div>
                </th>
              ))}
              {actions && <th className="px-3 py-2.5 text-right w-24">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="text-center py-8 text-slate-500 text-xs">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${dense ? 'py-2 px-3' : 'py-3 px-3'} ${
                        col.align === 'right'
                          ? 'text-right font-tabular'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                  {actions && <td className="py-2 px-3 text-right">{actions(row)}</td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Página <span className="font-tabular font-medium text-slate-200">{currentPage}</span> de{' '}
            <span className="font-tabular font-medium text-slate-200">{totalPages}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
