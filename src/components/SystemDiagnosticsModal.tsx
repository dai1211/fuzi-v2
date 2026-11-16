import React from 'react';
import {
  X,
  Server,
  Cpu,
  Database,
  ShieldCheck,
  HardDrive,
  Radio,
  CheckCircle2,
  Lock,
  Layers,
  Sparkles,
  Archive,
  RefreshCw,
  Clock,
  Trash2,
  Settings,
} from 'lucide-react';
import { ServerStatusInfo, BackupStatusInfo, BackupRecord } from '../types';

interface SystemDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statusInfo: ServerStatusInfo | null;
  isStandaloneMode: boolean;
  setIsStandaloneMode: (val: boolean) => void;
  useGeminiIfAvailable: boolean;
  setUseGeminiIfAvailable: (val: boolean) => void;
  backupStatus: BackupStatusInfo | null;
  isRunningBackup: boolean;
  backupFeedback: string | null;
  onRunBackup: () => void;
  onUpdateBackupConfig: (autoBackupEnabled: boolean, intervalMinutes: number) => void;
  showTrashCorner: boolean;
  setShowTrashCorner: (val: boolean) => void;
  deletedCount: number;
  onOpenTrashCorner: () => void;
}

function formatDateTimeJP(iso: string | null): string {
  if (!iso) return '未実行';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '未実行';
  return d.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function getTriggerLabel(trigger: BackupRecord['trigger']): string {
  switch (trigger) {
    case 'auto':
      return '定期自動';
    case 'manual':
      return '手動実行';
    case 'immediate':
      return '即時保全';
    case 'startup':
      return '起動時初期';
  }
}

export const SystemDiagnosticsModal: React.FC<SystemDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  statusInfo,
  isStandaloneMode,
  setIsStandaloneMode,
  useGeminiIfAvailable,
  setUseGeminiIfAvailable,
  backupStatus,
  isRunningBackup,
  backupFeedback,
  onRunBackup,
  onUpdateBackupConfig,
  showTrashCorner,
  setShowTrashCorner,
  deletedCount,
  onOpenTrashCorner,
}) => {
  if (!isOpen) return null;

  const autoEnabled = backupStatus?.autoBackupEnabled ?? true;
  const intervalMinutes = backupStatus?.intervalMinutes ?? 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
                設定・校内ローカルAIサーバー診断
              </h2>
              <p className="text-xs text-slate-500 font-mono truncate">
                192.168.10.25（校内閉域LAN専用） · TLS 1.3
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="診断パネルを閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
          {/* Security & Isolation Status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                外部クラウド通信 完全遮断（閉域隔離運用中）
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                校内ネットワーク（LAN）の境界内部に独立配置されています。生徒・保護者・教員の氏名、学籍番号、指導記録などの機密書類データが外部へ送信されることはありません。
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-mono text-emerald-700">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  外部送信パケット: 0 packets
                </span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span className="text-slate-600">HTTPS（校内LAN内部）</span>
              </div>
            </div>
          </div>

          {/* Deleted Documents / Trash Corner Setting */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>削除データ・非表示書類の管理（「削除」コーナー）</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  削除した書類やマニュアルは通常画面から非表示になります。設定から「削除」コーナーを有効にすると、非表示データの閲覧・復元・完全削除（二択）を行えます。
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenTrashCorner}
                className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>「削除」コーナーを開く（{deletedCount}件）</span>
              </button>
            </div>

            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3">
              <label
                htmlFor="toggle-trash-corner"
                className="text-xs font-medium text-slate-800 cursor-pointer select-none"
              >
                左メニューに「削除」コーナーを表示して非表示書類を確認できるようにする
              </label>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="toggle-trash-corner"
                  type="checkbox"
                  checked={showTrashCorner}
                  onChange={(e) => setShowTrashCorner(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>

          {/* Local Storage Automatic Backup Section */}
          <div className="space-y-4 border border-slate-200 rounded-xl p-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-indigo-600" />
                  <span>校内ローカルストレージ 自動バックアップ</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  仮名化済み書類データ・ベクトル索引を校内ローカル領域および端末ストレージへ定期保全します。
                </p>
              </div>

              <button
                type="button"
                onClick={onRunBackup}
                disabled={isRunningBackup}
                className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunningBackup ? 'animate-spin' : ''}`} />
                <span>{isRunningBackup ? 'バックアップ実行中...' : '今すぐ実行'}</span>
              </button>
            </div>

            {backupFeedback && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{backupFeedback}</span>
              </div>
            )}

            {/* Last Backup Timestamp & Next Schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div>
                <span className="text-[11px] font-medium text-slate-500 block">
                  最終バックアップ日時
                </span>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900 font-mono tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span data-testid="last-backup-timestamp">
                    {formatDateTimeJP(backupStatus?.lastBackupAt ?? null)}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[11px] font-medium text-slate-500 block">
                  次回自動実行予定
                </span>
                <div className="mt-1 text-xs font-medium text-slate-700 font-mono tabular-nums">
                  {autoEnabled
                    ? formatDateTimeJP(backupStatus?.nextBackupAt ?? null)
                    : '定期自動バックアップ停止中'}
                </div>
              </div>
            </div>

            {/* Auto-Backup Toggle & Interval Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => onUpdateBackupConfig(e.target.checked, intervalMinutes)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                />
                <span className="text-xs font-medium text-slate-800">
                  定期的な自動バックアップを有効にする
                </span>
              </label>

              <div className="flex items-center gap-2 text-xs">
                <label
                  htmlFor="backup-interval-select"
                  className="text-slate-600 font-medium whitespace-nowrap"
                >
                  実行間隔:
                </label>
                <select
                  id="backup-interval-select"
                  value={intervalMinutes}
                  disabled={!autoEnabled}
                  onChange={(e) => onUpdateBackupConfig(autoEnabled, Number(e.target.value))}
                  className="h-8 px-2.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-600 disabled:opacity-50"
                >
                  <option value={15}>15分ごと</option>
                  <option value={60}>1時間ごと</option>
                  <option value={360}>6時間ごと</option>
                  <option value={1440}>24時間ごと（日次）</option>
                </select>
              </div>
            </div>

            {/* Storage Metadata & Recent Snapshots */}
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                <span>保存先: {backupStatus?.storagePath || './.school_local_backups'} + 端末LocalStorage</span>
                <span aria-hidden="true">·</span>
                <span>保存世代: {backupStatus?.backupCount ?? 0}件</span>
                <span aria-hidden="true">·</span>
                <span>合計容量: {formatBytes(backupStatus?.totalSizeBytes ?? 0)}</span>
              </div>

              {backupStatus && backupStatus.recentBackups.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200 text-[11px]">
                  {backupStatus.recentBackups.slice(0, 3).map((rec) => (
                    <div
                      key={rec.id}
                      className="px-3 py-2 flex items-center justify-between gap-2 font-mono tabular-nums"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-800 font-medium truncate">
                          {formatDateTimeJP(rec.createdAt)}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-sans text-slate-600 shrink-0">
                          {getTriggerLabel(rec.trigger)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500 shrink-0">
                        <span>{rec.documentCount}件</span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span>{formatBytes(rec.sizeBytes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Operation Mode Selector */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-500">
              動作形態の切り替え
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsStandaloneMode(false)}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  !isStandaloneMode
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-600" />
                    <span>校内LANサーバー</span>
                  </span>
                  {!isStandaloneMode && (
                    <span className="text-[11px] text-indigo-700 font-semibold">選択中</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  職員室の専用サーバーで14B〜32BクラスのLLM/VLMとChromaDBが高速動作。
                </p>
              </button>

              <button
                type="button"
                onClick={() => setIsStandaloneMode(true)}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  isStandaloneMode
                    ? 'border-indigo-600 bg-indigo-50/50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ローカルクライアント</span>
                  </span>
                  {isStandaloneMode && (
                    <span className="text-[11px] text-indigo-700 font-semibold">選択中</span>
                  )}
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  出張時・障害時対応。端末内のみで完結する軽量オフライン動作モード。
                </p>
              </button>
            </div>
          </div>

          {/* AI Engines Details */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-500">
              校内AIエンジン構成
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-1 text-slate-900 font-semibold text-xs">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  <span>ローカルLLM推論基盤</span>
                </div>
                <div className="text-xs text-slate-700 font-mono">
                  vLLM / Qwen2.5-32B-Instruct-AWQ
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  14B〜32Bクラス高精度日本語モデル（32,768 tokens）
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-1 text-slate-900 font-semibold text-xs">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>ローカルVLM（視覚言語モデル）</span>
                </div>
                <div className="text-xs text-slate-700 font-mono">
                  Qwen2-VL-7B-Instruct
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  手書き文字・学校帳票レイアウトの高精度テキスト化
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-1 text-slate-900 font-semibold text-xs">
                  <Database className="w-4 h-4 text-amber-600" />
                  <span>ベクトルDB（RAG検索）</span>
                </div>
                <div className="text-xs text-slate-700 font-mono">
                  ChromaDB v0.5.2 (bge-m3 1024d)
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  校内書類のセマンティック検索と高速照会
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-2 mb-1 text-slate-900 font-semibold text-xs">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span>個人情報仮名化エンジン</span>
                </div>
                <div className="text-xs text-slate-700 font-mono">
                  Local NER + Rule-based Masking v2.4
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  読取直後・保存前に氏名や住所等を自動置換
                </p>
              </div>
            </div>
          </div>

          {/* Hardware Spec */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-slate-500">
              校内サーバー ハードウェアリソース
            </h4>
            <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 font-mono text-xs tabular-nums">
              <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                <span className="text-slate-500">GPU</span>
                <span className="text-slate-900 font-medium">NVIDIA GeForce RTX 4090 (24GB VRAM)</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                <span className="text-slate-500">VRAM使用量</span>
                <span className="text-emerald-700 font-medium">16.4 GB / 24.0 GB (68.3%)</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                <span className="text-slate-500">GPU温度</span>
                <span className="text-emerald-700 font-medium">54°C (正常)</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between items-center gap-4">
                <span className="text-slate-500">CPU / RAM</span>
                <span className="text-slate-900 font-medium">AMD EPYC 16-Core / 64GB DDR5 ECC</span>
              </div>
            </div>
          </div>

          {/* Gemini Verification Mode (if key available) */}
          {statusInfo?.cloudBackupAvailable && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    開発・検証用 比較推論エンジンを有効化
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ローカル推論結果と外部検証用モデルの回答精度を比較できます。
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={useGeminiIfAvailable}
                  onChange={(e) => setUseGeminiIfAvailable(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
