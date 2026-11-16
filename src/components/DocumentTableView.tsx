import React, { useState } from 'react';
import {
  FileText,
  ArrowUpDown,
  ExternalLink,
  Sparkles,
  Download,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { SchoolDoc, ImportanceLevel } from '../types';

interface DocumentTableViewProps {
  documents: SchoolDoc[];
  onSelect: (doc: SchoolDoc) => void;
  onAskAI: (doc: SchoolDoc) => void;
  onDelete?: (doc: SchoolDoc) => void;
}

type SortKey = 'title' | 'category' | 'importance' | 'date' | 'piiCount' | 'version';

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  '緊急・重要': 3,
  '重要': 2,
  '通常': 1,
};

export const DocumentTableView: React.FC<DocumentTableViewProps> = ({
  documents,
  onSelect,
  onAskAI,
  onDelete,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('importance');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'title' || key === 'category');
    }
  };

  const sortedDocs = [...documents].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'importance':
        cmp = IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
        break;
      case 'piiCount':
        cmp = a.piiCount - b.piiCount;
        break;
      case 'version':
        cmp = a.version - b.version;
        break;
      case 'date':
        cmp = a.date.localeCompare(b.date);
        break;
      case 'category':
        cmp = a.category.localeCompare(b.category, 'ja');
        break;
      case 'title':
      default:
        cmp = a.title.localeCompare(b.title, 'ja');
        break;
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleExportCsv = () => {
    const headers = ['ID', '書類名', 'カテゴリ', '重要度', '秘匿度', '担当部署', '受領元（配布元）', '期限・開催日', '登録日', '版数', '仮名化件数'];
    const rows = sortedDocs.map((d) => [
      d.id,
      `"${d.title.replace(/"/g, '""')}"`,
      d.category,
      d.importance,
      d.securityLevel,
      d.department,
      `"${(d.receivedFrom || '').replace(/"/g, '""')}"`,
      d.deadlines[0] ? `"${d.deadlines[0].label}: ${d.deadlines[0].dateText}"` : 'なし',
      d.date,
      `v${d.version}`,
      String(d.piiCount),
    ]);
    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `school_documents_list_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Table Action Bar */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-600 font-medium">
          保存書類一覧（全 <span className="font-mono font-semibold tabular-nums text-slate-900">{sortedDocs.length}</span> 件）
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>CSV出力</span>
        </button>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('importance')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>重要度</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('title')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>書類名 / 担当部署</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('category')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>カテゴリ</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                期限・開催日
              </th>
              <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                秘匿度
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('piiCount')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>仮名化</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('version')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>版</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                <button
                  type="button"
                  onClick={() => handleSort('date')}
                  className="inline-flex items-center gap-1 hover:text-slate-900 whitespace-nowrap"
                >
                  <span>更新日</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {sortedDocs.map((doc) => {
              const primaryDeadline = doc.deadlines?.[0];
              return (
                <tr
                  key={doc.id}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {doc.importance === '緊急・重要' ? (
                      <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>緊急・重要</span>
                      </span>
                    ) : doc.importance === '重要' ? (
                      <span className="text-amber-700 font-semibold">重要</span>
                    ) : (
                      <span className="text-slate-500">通常</span>
                    )}
                  </td>

                  <td className="px-4 py-3 max-w-xs">
                    <button
                      type="button"
                      onClick={() => onSelect(doc)}
                      className="text-left font-semibold text-slate-900 hover:text-indigo-700 transition-colors line-clamp-1"
                    >
                      {doc.title}
                    </button>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {doc.department}
                      {doc.receivedFrom ? ` · 受領: ${doc.receivedFrom}` : ''}
                    </div>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-indigo-700 font-medium">
                    {doc.category}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    {primaryDeadline ? (
                      <div className="flex items-center gap-1.5 font-mono tabular-nums text-[11px]">
                        <Clock
                          className={`w-3.5 h-3.5 shrink-0 ${
                            primaryDeadline.urgency === '緊急'
                              ? 'text-rose-600'
                              : primaryDeadline.urgency === '近日'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                          }`}
                        />
                        <span
                          className={
                            primaryDeadline.urgency === '緊急'
                              ? 'text-rose-700 font-semibold'
                              : 'text-slate-700'
                          }
                        >
                          {primaryDeadline.dateText}
                        </span>
                        <span className="font-sans text-slate-400">({primaryDeadline.type})</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={
                        doc.securityLevel === '機密'
                          ? 'text-rose-700 font-medium'
                          : doc.securityLevel === '学年・部局限定'
                          ? 'text-slate-800 font-medium'
                          : 'text-slate-500'
                      }
                    >
                      {doc.securityLevel}
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-right font-mono tabular-nums text-emerald-700 font-medium">
                    <span className="inline-flex items-center gap-1 justify-end">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {doc.piiCount}件
                    </span>
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-600">
                    v{doc.version}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-500">
                    {doc.date}
                  </td>

                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelect(doc)}
                        className="h-7 px-2.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                        <span>詳細</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskAI(doc)}
                        className="h-7 px-2.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-600" />
                        <span>AI質問</span>
                      </button>
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(doc)}
                          title="削除（非表示にする）"
                          aria-label={`「${doc.title}」を削除`}
                          className="h-7 px-2 text-[11px] font-medium text-slate-500 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-md transition-colors inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sortedDocs.length === 0 && (
          <div className="p-12 text-center text-slate-500 text-xs">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            表示可能な書類がありません。
          </div>
        )}
      </div>
    </div>
  );
};
