import React, { useState } from 'react';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  FileText,
  Building2,
  ShieldCheck,
  Clock,
  Settings,
  ArrowLeft,
} from 'lucide-react';
import { DeletedSchoolDoc } from '../types';

interface TrashCornerViewProps {
  deletedDocuments: DeletedSchoolDoc[];
  onRestore: (doc: DeletedSchoolDoc) => Promise<void> | void;
  onPermanentDelete: (doc: DeletedSchoolDoc) => Promise<void> | void;
  onBackToPortal: () => void;
  onOpenSettings: () => void;
}

function formatDeletedAtJP(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TrashCornerView: React.FC<TrashCornerViewProps> = ({
  deletedDocuments,
  onRestore,
  onPermanentDelete,
  onBackToPortal,
  onOpenSettings,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  const handleRestoreClick = async (doc: DeletedSchoolDoc) => {
    setBusyDocId(doc.id);
    try {
      await onRestore(doc);
      if (confirmDeleteId === doc.id) {
        setConfirmDeleteId(null);
      }
    } finally {
      setBusyDocId(null);
    }
  };

  const handleConfirmPermanentDelete = async (doc: DeletedSchoolDoc) => {
    setBusyDocId(doc.id);
    try {
      await onPermanentDelete(doc);
      setConfirmDeleteId(null);
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>設定より有効化</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>非表示書類の管理コーナー</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-slate-700" />
            <span>削除</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
            削除操作を行い非表示になったマニュアルや書類データを保管しています。各書類ごとに「復元する」か「本当に削除する」の二択から選択できます。
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>設定を変更</span>
          </button>
          <button
            type="button"
            onClick={onBackToPortal}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>書類ポータルへ戻る</span>
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-slate-600">
          <span>
            現在の非表示書類データ:{' '}
            <strong className="font-mono tabular-nums text-slate-900">
              {deletedDocuments.length}
            </strong>{' '}
            件
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="text-slate-500">
            「復元する」で書類ポータル・AI検索へ即座に戻せます
          </span>
        </div>
      </div>

      {/* Deleted Documents List */}
      {deletedDocuments.length > 0 ? (
        <div className="space-y-3">
          {deletedDocuments.map((doc) => {
            const isConfirming = confirmDeleteId === doc.id;
            const isBusy = busyDocId === doc.id;

            return (
              <article
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0 flex-1">
                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-indigo-700">{doc.category}</span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span
                        className={
                          doc.securityLevel === '機密'
                            ? 'text-rose-700 font-medium'
                            : 'text-slate-600'
                        }
                      >
                        {doc.securityLevel}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-500">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>削除日時: {formatDeletedAtJP(doc.deletedAt)}</span>
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-base font-semibold text-slate-900 flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                      <span>{doc.title}</span>
                    </h2>

                    {/* Summary */}
                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {doc.summary}
                    </p>

                    {/* Department / ReceivedFrom / PII */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {doc.department}
                          {doc.receivedFrom ? ` · 受領: ${doc.receivedFrom}` : ''}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-mono tabular-nums">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>仮名化保護 {doc.piiCount}件</span>
                      </span>
                    </div>
                  </div>

                  {/* Two Choices (二択): 復元する OR 本当に削除する */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-start">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRestoreClick(doc)}
                      className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
                      <span>復元する</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        setConfirmDeleteId(isConfirming ? null : doc.id)
                      }
                      className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>本当に削除する</span>
                    </button>
                  </div>
                </div>

                {/* Inline Permanent Delete Confirmation (no window.confirm) */}
                {isConfirming && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2 text-rose-900">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">
                          このデータ「{doc.title}」を本当に完全に削除しますか？
                        </p>
                        <p className="text-rose-700 mt-0.5">
                          完全に削除するとローカルストレージからも消去され、後から復元することはできません。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteId(null)}
                        className="h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleConfirmPermanentDelete(doc)}
                        className="h-8 px-3.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {isBusy ? '削除中...' : '確定：本当に削除する'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
          <Trash2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-800 text-sm">
            削除済みの非表示書類はありません
          </p>
          <p className="text-xs text-slate-500 mt-1">
            書類ポータルや詳細画面で「削除」を実行したマニュアル・資料は一時的にここへ移動します。
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={onBackToPortal}
              className="h-9 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              書類ポータルへ戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
