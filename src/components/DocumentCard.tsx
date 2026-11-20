import React from 'react';
import {
  FileText,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Building2,
  FileSpreadsheet,
  AlertTriangle,
  Clock,
  History,
  Trash2,
} from 'lucide-react';
import { SchoolDoc } from '../types';

interface DocumentCardProps {
  doc: SchoolDoc;
  onSelect: (doc: SchoolDoc) => void;
  onAskAI: (doc: SchoolDoc) => void;
  onSelectTag?: (tag: string) => void;
  onDelete?: (doc: SchoolDoc) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  onSelect,
  onAskAI,
  onSelectTag,
  onDelete,
}) => {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'xlsx':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
      case 'handwriting':
        return <FileText className="w-4 h-4 text-amber-600" />;
      default:
        return <FileText className="w-4 h-4 text-indigo-600" />;
    }
  };

  const primaryDeadline = doc.deadlines?.[0];

  return (
    <article className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 transition-colors flex flex-col justify-between">
      {/* Top Section */}
      <div>
        {/* Unboxed Metadata Header */}
        <div className="flex items-center justify-between text-xs text-slate-500 mb-3 gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {doc.importance === '緊急・重要' && (
              <>
                <span className="inline-flex items-center gap-1 text-rose-700 font-semibold whitespace-nowrap">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>緊急・重要</span>
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
              </>
            )}
            {doc.importance === '重要' && (
              <>
                <span className="text-amber-700 font-semibold whitespace-nowrap">重要</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
              </>
            )}
            <span className="font-medium text-indigo-700 whitespace-nowrap">{doc.category}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span
              className={`whitespace-nowrap ${
                doc.securityLevel === '機密'
                  ? 'text-rose-700 font-medium'
                  : doc.securityLevel === '学年・部局限定'
                  ? 'text-slate-700 font-medium'
                  : 'text-slate-500'
              }`}
            >
              {doc.securityLevel}
            </span>
          </div>

          <span className="text-[11px] font-mono tabular-nums text-slate-400 uppercase shrink-0">
            {doc.fileType} · v{doc.version}
          </span>
        </div>

        {/* Title */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
            {getFileIcon(doc.fileType)}
          </div>
          <h3 className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2">
            <button
              type="button"
              onClick={() => onSelect(doc)}
              className="text-left hover:text-indigo-700 transition-colors"
            >
              {doc.title}
            </button>
          </h3>
        </div>

        {/* AI Concise Summary */}
        <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 mt-3">
          {doc.summary}
        </p>

        {/* Detected Deadline Row */}
        {primaryDeadline && (
          <div className="mt-3 flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <Clock
              className={`w-3.5 h-3.5 shrink-0 ${
                primaryDeadline.urgency === '緊急'
                  ? 'text-rose-600'
                  : primaryDeadline.urgency === '近日'
                  ? 'text-amber-600'
                  : 'text-slate-400'
              }`}
            />
            <span className="font-sans text-slate-500 truncate">{primaryDeadline.label}:</span>
            <span
              className={`font-semibold shrink-0 ${
                primaryDeadline.urgency === '緊急' ? 'text-rose-700' : 'text-slate-800'
              }`}
            >
              {primaryDeadline.dateText}
            </span>
          </div>
        )}

        {/* Keywords */}
        {doc.keywords && doc.keywords.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
            {doc.keywords.slice(0, 4).map((tag, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelectTag?.(tag)}
                className="hover:text-indigo-700 hover:underline transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Metadata & Action Footer */}
      <div className="mt-4 pt-3.5 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-1.5 text-slate-600 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {doc.department}
              {doc.receivedFrom ? ` · 受領: ${doc.receivedFrom}` : ''}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-[11px]">
            {doc.revisions && doc.revisions.length > 1 && (
              <span className="flex items-center gap-1 text-slate-500 font-mono tabular-nums">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>{doc.revisions.length}版</span>
              </span>
            )}
            <span className="flex items-center gap-1 text-emerald-700 font-medium font-mono tabular-nums">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>仮名化 {doc.piiCount}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(doc)}
            className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>詳細・比較</span>
          </button>

          <button
            type="button"
            onClick={() => onAskAI(doc)}
            className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>AIで質問</span>
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(doc)}
              title="削除（非表示にする）"
              aria-label={`「${doc.title}」を削除`}
              className="h-8 px-2.5 inline-flex items-center justify-center text-slate-400 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
