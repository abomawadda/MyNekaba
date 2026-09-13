import React from 'react';
import clsx from 'clsx';
import { EmptyState, LoadingState } from './enterprise/FeedbackStates';

function renderCell(row, column, index) {
  if (column.render) return column.render(row, index);
  const value = row?.[column.key];
  return value === undefined || value === null || value === "" ? "-" : value;
}

function DataTableMobileCard({ row, columns, actions, rowIndex }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70">
      <div className="space-y-2">
        {columns.map((column) => (
          <div key={column.key || column.header} className="flex items-start justify-between gap-3 text-xs">
            <span className="shrink-0 font-semibold text-slate-500">{column.header || column.label}</span>
            <span className={clsx("min-w-0 text-left font-semibold text-slate-800 dark:text-slate-100", column.numeric && "num")}>
              {renderCell(row, column, rowIndex)}
            </span>
          </div>
        ))}
      </div>
      {actions && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-700/80">{actions(row, rowIndex)}</div>}
    </article>
  );
}

export function DataTable({
  columns = [],
  rows = [],
  rowKey = "id",
  loading = false,
  emptyTitle = "لا توجد بيانات مسجلة حتى الآن",
  emptyDescription = "",
  actions,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  stickyHeader = false,
  className = "",
}) {
  const selectedSet = new Set(selectedRows);

  const toggleRow = (key) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedSet);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(Array.from(next));
  };

  if (loading) return <LoadingState title="جاري تحميل البيانات..." rows={4} className={className} />;

  if (!rows || rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} className={className} />;
  }

  return (
    <div className={clsx("w-full", className)}>
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {rows.map((row, index) => (
          <DataTableMobileCard key={row?.[rowKey] || index} row={row} columns={columns} actions={actions} rowIndex={index} />
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70 md:block">
        <div className="overflow-x-auto">
          <table className="table-enterprise w-full text-right">
            <thead className={clsx("border-b border-slate-100 bg-slate-50/80 dark:border-slate-700/80 dark:bg-slate-900/50", stickyHeader && "sticky top-0 z-10")}>
              <tr>
                {selectable && <th className="w-10 p-3" />}
                {columns.map((column) => (
                  <th key={column.key || column.header} className={clsx("p-3 text-[11px] font-semibold text-slate-500", column.headerClassName)}>
                    {column.header || column.label}
                  </th>
                ))}
                {actions && <th className="w-24 p-3 text-[11px] font-semibold text-slate-500">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
              {rows.map((row, index) => {
                const key = row?.[rowKey] || index;
                return (
                  <tr key={key} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30">
                    {selectable && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(key)}
                          onChange={() => toggleRow(key)}
                          aria-label="تحديد الصف"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key || column.header} className={clsx("p-3 text-xs font-semibold text-slate-700 dark:text-slate-100", column.numeric && "num", column.className)}>
                        {renderCell(row, column, index)}
                      </td>
                    ))}
                    {actions && <td className="p-3"><div className="flex items-center gap-1">{actions(row, index)}</div></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ResponsiveTable({
  data,
  headers,
  renderDesktopRow,
  renderMobileCard,
  emptyMessage = "لا توجد بيانات مسجلة حتى الآن",
  ...props
}) {
  if (props.columns || props.rows) {
    return <DataTable rows={props.rows || data || []} emptyTitle={emptyMessage} {...props} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState title={emptyMessage} className="mt-4" />;
  }

  return (
    <div className="w-full mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:hidden">
        {data.map((item, index) => (
          <React.Fragment key={item.id || index}>
            {renderMobileCard(item)}
          </React.Fragment>
        ))}
      </div>

      <div className="hidden md:block rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700/80 dark:bg-slate-800/70">
        <div className="overflow-x-auto">
          <table className="table-enterprise w-full text-right">
            <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className={clsx("p-4 font-semibold text-slate-400 text-[11px]", h.className)}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {data.map((item, index) => (
                <React.Fragment key={item.id || index}>
                  {renderDesktopRow(item)}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
