import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Lock,
  Copy,
  Check,
  FileText,
  RefreshCw,
  Archive,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { BackupStatusInfo } from '../types';

interface PiiBackupRecordView {
  id: string;
  savedAt: string;
  source: 'lab' | 'document';
  documentId?: string;
  documentTitle?: string;
  originalText: string;
  maskedText: string;
  detectedCount: number;
  items: { type: string; original: string; masked: string }[];
}

interface PIIMaskingLabProps {
  onPiiBackedUp?: (backupStatus?: BackupStatusInfo) => void;
}

const DEFAULT_SAMPLE_PII_TEXT = `【生徒指導相談票】
生徒: 中村 蓮（3年1組・学籍番号 23055）
保護者: 母 中村 美代子（携帯: 090-4444-9876）
現住所: 宮崎県宮崎市大淀3丁目8-19
指導担当: 学級担任 坂本 健太郎 教諭

相談要旨:
第2回進路希望調査において、本人は県立宮崎南高校を希望。保護者からは家庭事情（祖父の通院介護）に関する相談あり。
次回面談予定: 7月10日 16:30 応接室にて校長 谷口 誠 教頭 佐藤 秀樹 同席のもと実施予定。`;

const PII_LAB_STORAGE_KEY = 'school_ai_pii_lab_backup_v1';

function formatSavedTimeJP(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const PIIMaskingLab: React.FC<PIIMaskingLabProps> = ({ onPiiBackedUp }) => {
  const [inputText, setInputText] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(PII_LAB_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.originalText === 'string' && parsed.originalText.trim()) {
            return parsed.originalText;
          }
        }
      } catch {
        // ignore storage parse error
      }
    }
    return DEFAULT_SAMPLE_PII_TEXT;
  });

  const [maskedOutput, setMaskedOutput] = useState('');
  const [detectedItems, setDetectedItems] = useState<
    { type: string; original: string; masked: string }[]
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupNotice, setLastBackupNotice] = useState<string | null>(null);
  const [savedRecords, setSavedRecords] = useState<PiiBackupRecordView[]>([]);
  const [copied, setCopied] = useState(false);
  const autoBackupDebounceRef = useRef<number | null>(null);

  const syncLocalStoragePii = (
    originalText: string,
    maskedText: string,
    items: { type: string; original: string; masked: string }[]
  ) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        PII_LAB_STORAGE_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          originalText,
          maskedText,
          items,
        })
      );
    } catch {
      // ignore quota errors
    }
  };

  const backupPiiToServer = async (text: string, silent = false) => {
    if (!text.trim()) return;
    if (!silent) setIsBackingUp(true);
    try {
      const res = await fetch('/api/pii-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: 'lab' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (Array.isArray(data.records)) {
          setSavedRecords(data.records);
        }
        const savedAtLabel = formatSavedTimeJP(data.record?.savedAt || new Date().toISOString());
        setLastBackupNotice(
          `ローカルストレージへ即時バックアップ保存済（${savedAtLabel} · 検出 ${data.record?.detectedCount ?? 0}件）`
        );
        onPiiBackedUp?.(data.backupStatus);
      }
    } catch (err) {
      console.error('PII backup failed:', err);
      setLastBackupNotice('端末ブラウザLocalStorageへ一時保存しました');
    } finally {
      if (!silent) setIsBackingUp(false);
    }
  };

  const fetchPiiBackups = async () => {
    try {
      const res = await fetch('/api/pii-backup');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.records)) {
          setSavedRecords(data.records);
        }
      }
    } catch {
      // ignore offline
    }
  };

  const runMasking = async (text: string, triggerImmediateBackup = false) => {
    if (!text.trim()) {
      setMaskedOutput('');
      setDetectedItems([]);
      syncLocalStoragePii('', '', []);
      return;
    }
    setIsProcessing(true);
    try {
      const res = await fetch('/api/mask-pii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        return;
      }
      const nextMasked = typeof data.maskedText === 'string' ? data.maskedText : '';
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setMaskedOutput(nextMasked);
      setDetectedItems(nextItems);
      syncLocalStoragePii(text, nextMasked, nextItems);

      if (triggerImmediateBackup) {
        await backupPiiToServer(text, false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    runMasking(inputText, false);
    fetchPiiBackups();
    return () => {
      if (autoBackupDebounceRef.current) {
        window.clearTimeout(autoBackupDebounceRef.current);
      }
    };
  }, []);

  const handleInputChange = (nextText: string) => {
    setInputText(nextText);
    syncLocalStoragePii(nextText, maskedOutput, detectedItems);
    runMasking(nextText, false);

    if (autoBackupDebounceRef.current) {
      window.clearTimeout(autoBackupDebounceRef.current);
    }
    if (nextText.trim()) {
      autoBackupDebounceRef.current = window.setTimeout(() => {
        backupPiiToServer(nextText, true);
      }, 650);
    }
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(maskedOutput);
      } else {
        const el = document.createElement('textarea');
        el.value = maskedOutput;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            個人情報仮名化検証
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed max-w-3xl">
            入力・解析した個人情報テキストと仮名化コードはその場で校内ローカルストレージおよび端末領域へ自動バックアップ保存されます。
          </p>
        </div>

        <button
          type="button"
          onClick={() => runMasking(inputText, true)}
          disabled={isBackingUp || !inputText.trim()}
          className="h-9 inline-flex items-center gap-1.5 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{isBackingUp ? '保存中...' : 'この個人情報を即時バックアップ保存'}</span>
        </button>
      </div>

      {lastBackupNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{lastBackupNotice}</span>
        </div>
      )}

      {/* Side-by-Side Playground */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left: Input Text (Original) */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>原文入力（生データ）</span>
              </h2>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {inputText.length} 文字
              </span>
            </div>

            <textarea
              rows={12}
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full flex-1 p-3.5 font-mono text-xs sm:text-[13px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 leading-relaxed resize-y"
              placeholder="ここに生徒指導記録や連絡メモなどを入力..."
            />
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 gap-3">
            <span>入力すると自動で仮名化・即時バックアップされます</span>
            <button
              type="button"
              onClick={() => runMasking(inputText, true)}
              disabled={isProcessing}
              className="h-8 inline-flex items-center gap-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>再解析・保存</span>
            </button>
          </div>
        </section>

        {/* Right: Output Masked Text */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
              <h2 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>仮名化後テキスト（DB・AI蓄積形式）</span>
              </h2>
              <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                {detectedItems.length}件 置換済
              </span>
            </div>

            <div className="flex-1 p-3.5 font-mono text-xs sm:text-[13px] bg-slate-50 border border-slate-200 rounded-lg min-h-[280px] leading-relaxed whitespace-pre-wrap text-slate-800">
              {maskedOutput || 'テキストを入力すると仮名化結果が表示されます'}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>外部参照時も実名は復元不可</span>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>コピー完了</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>仮名化テキストをコピー</span>
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      {/* Detection Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-slate-900">
            検出された個人情報エンティティ一覧
          </h3>
          <span className="text-xs text-slate-500">
            ルールベース ＋ 校内NER固有表現抽出
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">分類</th>
                <th className="px-5 py-3 text-left font-semibold">検出された生データ</th>
                <th className="px-5 py-3 text-left font-semibold">置換された仮名化コード</th>
                <th className="px-5 py-3 text-left font-semibold">保護状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {detectedItems.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                    {item.type}
                  </td>
                  <td className="px-5 py-3 font-mono text-rose-700">
                    {item.original}
                  </td>
                  <td className="px-5 py-3 font-mono text-emerald-700 font-semibold">
                    {item.masked}
                  </td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                    プライバシー保護基準準拠
                  </td>
                </tr>
              ))}
              {detectedItems.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    個人情報は検出されませんでした。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Saved PII Backups List */}
      {savedRecords.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-900 flex items-center gap-2">
              <Archive className="w-4 h-4 text-emerald-600" />
              <span>バックアップ保存済み 個人情報・仮名化データ履歴</span>
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              保管件数: {savedRecords.length}件
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {savedRecords.slice(0, 6).map((rec) => (
              <div
                key={rec.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/70 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-slate-500">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 font-medium">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatSavedTimeJP(rec.savedAt)}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-medium text-indigo-700">
                      {rec.source === 'document'
                        ? `書類連携: ${rec.documentTitle || rec.documentId || '登録書類'}`
                        : '仮名化検証ラボ入力'}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                      検出保護 {rec.detectedCount}件
                    </span>
                  </div>
                  <p className="font-mono text-slate-600 truncate max-w-2xl">
                    {rec.maskedText.replace(/\s+/g, ' ').slice(0, 120)}
                  </p>
                </div>

                {rec.source === 'lab' && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputText(rec.originalText);
                      runMasking(rec.originalText, false);
                    }}
                    className="h-8 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                  >
                    この内容を読み込む
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
