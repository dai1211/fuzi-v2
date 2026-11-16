import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  UploadCloud,
  Camera,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ScanLine,
  RefreshCw,
  AlertTriangle,
  Clock,
  Tag,
  GitMerge,
  Plus,
} from 'lucide-react';
import {
  CategoryType,
  SecurityLevel,
  SchoolDoc,
  DeadlineItem,
  ImportanceLevel,
  DuplicateCandidate,
  BackupStatusInfo,
} from '../types';

interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentAdded: (newDoc: SchoolDoc, isUpdate?: boolean, backupStatus?: BackupStatusInfo) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  isOpen,
  onClose,
  onDocumentAdded,
}) => {
  const [sourceMode, setSourceMode] = useState<'upload' | 'camera' | 'preset'>('preset');

  // Document metadata form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryType>('生徒指導');
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>('機密');
  const [department, setDepartment] = useState('生徒指導部');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [author, setAuthor] = useState('生徒指導担当教諭');
  const [rawText, setRawText] = useState('');

  // Custom deadline editor state
  const [customDeadlines, setCustomDeadlines] = useState<DeadlineItem[]>([]);
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('提出期限');
  const [newDeadlineDate, setNewDeadlineDate] = useState('');
  const [newDeadlineType, setNewDeadlineType] = useState<DeadlineItem['type']>('提出期限');
  const [newDeadlineUrgency, setNewDeadlineUrgency] = useState<DeadlineItem['urgency']>('近日');

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [wasCameraCapture, setWasCameraCapture] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    piiResult: {
      maskedText: string;
      detectedCount: number;
      items: { type: string; original: string; masked: string }[];
    };
    deadlines: DeadlineItem[];
    importance: ImportanceLevel;
    importanceReason: string;
    autoTags: string[];
    summary: string;
    aiSummaryPoints: string[];
    duplicates: DuplicateCandidate[];
  } | null>(null);

  // Editable auto-tags
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateCandidate[] | null>(null);

  const presets = [
    {
      label: '手書き: 生徒指導連絡メモ（実名・住所・期限自動検出テスト）',
      title: '生徒指導事案連絡票：6/14放課後トラブル事案および保護者面談録',
      category: '生徒指導' as CategoryType,
      securityLevel: '機密' as SecurityLevel,
      department: '生徒指導部',
      receivedFrom: '生徒指導部（吉田 剛 主事）',
      author: '主事 吉田 剛',
      text: `生徒指導事案 経過報告メモ
日時: 令和7年6月14日 16:45
対応教員: 生徒指導主事 吉田 剛、学級担任 佐々木 玲子

対象生徒: 高橋 涼太 (1年4組・学籍番号 26144)
関係生徒: 伊藤 健太 (1年4組・学籍番号 26112)
事案概要:
放課後の駐輪場付近において、高橋と伊藤の間で口論および持ち物の破損（通学カバン破損）が発生。
保護者連絡:
・高橋の母 高橋 智子 (携帯: 090-3333-7890 / 住所: 宮崎市青葉町2-11) へ状況報告。来校の上で謝罪の意思を表明。
・伊藤の父 伊藤 裕介 (電話: 0985-77-8899) へ連絡。仲裁面談を翌朝9:00に設定。
今後の指導方針・提出期限:
令和7年6月20日までに指導経過報告書を教頭へ提出すること。`,
    },
    {
      label: '重複検知＆更新履歴テスト：体育祭実施要項（改訂版）',
      title: '令和7年度 体育祭実施要項・危機管理＆熱中症対応マニュアル',
      category: '行事マニュアル' as CategoryType,
      securityLevel: '全校共有' as SecurityLevel,
      department: '保健体育科・特別活動部',
      receivedFrom: '保健体育科（高橋 正人 主任）',
      author: '体育科主任 高橋 正人',
      text: `令和7年度 秋季大運動会・体育祭 実施要項（第3版・猛暑強化版）
主催: 学校行事運営委員会
総括責任者: 教頭 佐藤 秀樹
危機管理担当: 体育科主任 高橋 正人 (連絡先: 090-1234-5678)

第1章 危機管理・熱中症対策基準
1. WBGT（暑さ指数）測定の義務付け
・WBGT 28度〜30度（厳重警戒）: 給水タイムを10分ごとに短縮設定。
・WBGT 31度以上（危険・中止基準）: 競技を直ちに中断し冷房室へ避難誘導。
提出期限: 各学年団の救護シフト表を令和7年5月18日までに保健部へ提出すること。`,
    },
    {
      label: '台風・自然災害発生時の臨時休校判断基準マニュアル',
      title: '台風等異常気象時における登下校判断基準および緊急連絡体制マニュアル',
      category: '保健・安全' as CategoryType,
      securityLevel: '全校共有' as SecurityLevel,
      department: '安全衛生・危機管理部',
      receivedFrom: '教頭（佐藤 秀樹）',
      author: '教頭 佐藤 秀樹',
      text: `異常気象・自然災害時における登校判断基準規程
策定: 危機管理委員会（統括: 教頭 佐藤 秀樹、安全主任 白石 誠）

1. 午前6時時点での気象警報発表時の対応
・午前6時00分の時点で、宮崎市内に「暴風警報」または「大雨特別警報」が発表されている場合は、原則「自宅待機（臨時休校）」とする。
・午前6時30分までに学校連絡網（安心安全メール）および公式HPにて保護者へ通知を発信する。

2. 登校後の天候急変時の一斉下校フロー
・気象状況の悪化が予想される場合、5校時終了時点で全校生徒の一斉集団下校を実施する。`,
    },
  ];

  const handleSelectPreset = (p: (typeof presets)[0]) => {
    setTitle(p.title);
    setCategory(p.category);
    setSecurityLevel(p.securityLevel);
    setDepartment(p.department);
    setReceivedFrom(p.receivedFrom || '');
    setAuthor(p.author);
    setRawText(p.text);
    setWasCameraCapture(false);
    setDuplicateAlert(null);
    setSaveError(null);
    triggerAnalysis(p.title, p.text, p.category, p.securityLevel, false);
  };

  const startCamera = async () => {
    try {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setCameraError(
        'カメラの起動に失敗しました。カメラ利用権限を許可するか、ファイルアップロードまたはプリセットをご利用ください。'
      );
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (isOpen && sourceMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [sourceMode, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSaveError(null);
      setDuplicateAlert(null);
    }
  }, [isOpen]);

  const capturePhoto = () => {
    const scannedSample = presets[0];
    const camTitle = `[カメラ撮影OCR] ${scannedSample.title}`;
    setTitle(camTitle);
    setCategory(scannedSample.category);
    setSecurityLevel(scannedSample.securityLevel);
    setDepartment(scannedSample.department);
    setReceivedFrom(scannedSample.receivedFrom || '');
    setAuthor(scannedSample.author);
    setRawText(scannedSample.text);
    setWasCameraCapture(true);
    setSaveError(null);
    triggerAnalysis(camTitle, scannedSample.text, scannedSample.category, scannedSample.securityLevel, false);
    stopCamera();
    setSourceMode('upload');
  };

  const triggerAnalysis = async (
    t: string = title,
    textToAnalyze: string = rawText,
    cat: CategoryType = category,
    sec: SecurityLevel = securityLevel,
    preserveUserEdits: boolean = true
  ) => {
    if (!textToAnalyze.trim() && !t.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: t,
          rawText: textToAnalyze,
          category: cat,
          securityLevel: sec,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisResult(data);
        if (!preserveUserEdits || tags.length === 0) {
          setTags(data.autoTags || []);
        }
        if (!preserveUserEdits || customDeadlines.length === 0) {
          setCustomDeadlines(data.deadlines || []);
        }
        setDuplicateAlert(data.duplicates && data.duplicates.length > 0 ? data.duplicates : null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddTag = () => {
    const clean = newTagInput.trim().replace(/^#/, '');
    if (clean && !tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleAddDeadline = () => {
    if (!newDeadlineDate.trim()) return;
    const item: DeadlineItem = {
      label: newDeadlineLabel.trim() || '期限',
      dateText: newDeadlineDate.trim(),
      type: newDeadlineType,
      urgency: newDeadlineUrgency,
    };
    setCustomDeadlines((prev) => [...prev, item]);
    setNewDeadlineDate('');
  };

  const handleRemoveDeadline = (index: number) => {
    setCustomDeadlines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveToChroma = async (options?: { forceSave?: boolean; updateDocId?: string }) => {
    if (!title || !rawText) return;
    setIsAnalyzing(true);
    setSaveError(null);

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          securityLevel,
          department,
          receivedFrom,
          author,
          rawText,
          fileType: wasCameraCapture || sourceMode === 'camera' ? 'handwriting' : 'pdf',
          customTags: tags,
          customDeadlines,
          forceSave: options?.forceSave,
          updateDocId: options?.updateDocId,
        }),
      });

      const data = await res.json();
      if (res.status === 409 && data.duplicates) {
        setDuplicateAlert(data.duplicates);
        bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (!res.ok) throw new Error(data.error || '保存エラー');
      setTitle('');
      setRawText('');
      setReceivedFrom('');
      setCustomDeadlines([]);
      setTags([]);
      setAnalysisResult(null);
      setDuplicateAlert(null);
      setWasCameraCapture(false);
      onDocumentAdded(data.document, Boolean(data.updated), data.backupStatus);
      onClose();
    } catch (err: any) {
      setSaveError(`書類の保存に失敗しました: ${err.message}`);
      bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                書類取り込み・ローカルAI解析
              </h3>
              <p className="text-xs text-slate-500 truncate">
                OCR読取、個人情報仮名化、期限検出、重複チェックを実行して保存します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Mode Tabs */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSourceMode('preset')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap truncate ${
                sourceMode === 'preset'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              実務サンプル（検証用）
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('camera')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap truncate ${
                sourceMode === 'camera'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span>カメラ撮影</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('upload')}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap truncate ${
                sourceMode === 'upload'
                  ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UploadCloud className="w-3.5 h-3.5 shrink-0" />
              <span>テキスト・手動入力</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div ref={bodyScrollRef} className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
          {saveError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Preset Selector */}
          {sourceMode === 'preset' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 block">
                検証用プリセットを選択（クリックすると自動解析を実行します）
              </label>
              <div className="grid grid-cols-1 gap-2">
                {presets.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPreset(p)}
                    className="p-3.5 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 text-left transition-colors group"
                  >
                    <div className="font-semibold text-slate-900 group-hover:text-indigo-700 text-xs sm:text-sm">
                      {p.label}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate">{p.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Camera Viewport */}
          {sourceMode === 'camera' && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-200">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                <div className="absolute inset-6 border border-dashed border-emerald-400/80 rounded-lg pointer-events-none flex flex-col justify-between p-3">
                  <div className="text-[11px] text-emerald-300 font-mono bg-slate-900/70 px-2 py-0.5 rounded w-fit">
                    AI-OCR 撮影枠
                  </div>
                  <div className="text-[11px] text-emerald-300 font-mono text-center">
                    書類全体を枠内に収めて撮影してください
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-900/90 p-4 flex flex-col items-center justify-center text-center text-white">
                    <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                    <p className="text-xs max-w-md">{cameraError}</p>
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="mt-3 h-8 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                    >
                      サンプル書類で撮影をシミュレート
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="h-9 inline-flex items-center gap-2 px-5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors text-xs sm:text-sm"
                >
                  <Camera className="w-4 h-4" />
                  <span>撮影してローカルVLM解析を実行</span>
                </button>
              </div>
            </div>
          )}

          {/* Duplicate Detection Alert Banner */}
          {duplicateAlert && duplicateAlert.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 flex-1">
                  <h4 className="text-xs sm:text-sm font-bold text-amber-900">
                    重複検知：類似・同一の書類が既に登録されています
                  </h4>
                  <p className="text-xs text-amber-800">
                    二重保存を防ぐため、既存書類の新しい版として改訂更新するか選択してください。
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {duplicateAlert.map((dup) => (
                  <div
                    key={dup.id}
                    className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-mono tabular-nums text-amber-800">
                        <span className="font-semibold">{dup.matchType}</span>
                        <span>·</span>
                        <span>一致度 {(dup.similarityScore * 100).toFixed(0)}%</span>
                        <span>·</span>
                        <span>
                          現行 v{dup.version} ({dup.date})
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900 truncate mt-0.5">
                        {dup.title}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveToChroma({ updateDocId: dup.id })}
                      disabled={isAnalyzing}
                      className="h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                      <span>v{dup.version + 1} として改訂保存</span>
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveToChroma({ forceSave: true })}
                  disabled={isAnalyzing}
                  className="h-8 px-3 text-xs font-medium text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-lg transition-colors"
                >
                  別書類として新規保存する
                </button>
              </div>
            </div>
          )}

          {/* Metadata & Document Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                書類名・件名
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDuplicateAlert(null);
                }}
                onBlur={() => triggerAnalysis(title, rawText, category, securityLevel)}
                placeholder="例: 令和7年度 体育祭実施要項"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                担当部署 / 委員会
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="例: 生徒指導部 / 教務部"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                受領元・配布元（誰からもらった資料か）
              </label>
              <input
                type="text"
                value={receivedFrom}
                onChange={(e) => setReceivedFrom(e.target.value)}
                placeholder="例: 教頭先生 / 教育委員会 / PTA本部 / 保護者〇〇様"
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                書類区分（カテゴリ）
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const nextCat = e.target.value as CategoryType;
                  setCategory(nextCat);
                  triggerAnalysis(title, rawText, nextCat, securityLevel);
                }}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15"
              >
                <option value="学年経営">学年経営</option>
                <option value="行事マニュアル">行事マニュアル</option>
                <option value="PTA資料">PTA資料</option>
                <option value="生徒指導">生徒指導</option>
                <option value="事務・予算">事務・予算</option>
                <option value="保健・安全">保健・安全</option>
                <option value="定期考査・成績">定期考査・成績</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                秘匿度タグ（権限管理）
              </label>
              <select
                value={securityLevel}
                onChange={(e) => {
                  const nextSec = e.target.value as SecurityLevel;
                  setSecurityLevel(nextSec);
                  triggerAnalysis(title, rawText, category, nextSec);
                }}
                className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 font-medium"
              >
                <option value="全校共有">全校共有（全教職員が閲覧可能）</option>
                <option value="学年・部局限定">学年・部局限定（該当学年・担当者のみ）</option>
                <option value="機密">機密（管理職・生徒指導コアのみ）</option>
              </select>
            </div>
          </div>

          {/* Deadline Configuration Section */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>期限の設定（提出期限・開催日など）</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                設定済: {customDeadlines.length}件
              </span>
            </div>

            {customDeadlines.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customDeadlines.map((dl, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-2 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs"
                  >
                    <span className="text-slate-500">{dl.label}:</span>
                    <span
                      className={`font-mono tabular-nums font-semibold ${
                        dl.urgency === '緊急' ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      {dl.dateText}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDeadline(idx)}
                      className="text-slate-400 hover:text-rose-600 font-bold"
                      aria-label={`${dl.label}を削除`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newDeadlineLabel}
                onChange={(e) => setNewDeadlineLabel(e.target.value)}
                placeholder="期限名（例: 提出期限）"
                className="flex-1 min-w-[140px] h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
              />
              <input
                type="date"
                value={newDeadlineDate}
                onChange={(e) => setNewDeadlineDate(e.target.value)}
                className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg font-mono focus:outline-none focus:border-indigo-600"
              />
              <select
                value={newDeadlineType}
                onChange={(e) => setNewDeadlineType(e.target.value as DeadlineItem['type'])}
                className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
              >
                <option value="提出期限">提出期限</option>
                <option value="開催日">開催日</option>
                <option value="定期期日">定期期日</option>
              </select>
              <select
                value={newDeadlineUrgency}
                onChange={(e) => setNewDeadlineUrgency(e.target.value as DeadlineItem['urgency'])}
                className="h-8 px-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600"
              >
                <option value="緊急">緊急</option>
                <option value="近日">近日</option>
                <option value="通常">通常</option>
              </select>
              <button
                type="button"
                onClick={handleAddDeadline}
                disabled={!newDeadlineDate.trim()}
                className="h-8 px-3.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                追加
              </button>
            </div>
          </div>

          {/* Raw Text Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                書類本文（VLM-OCR読み取り結果 / テキスト内容）
              </label>
              <button
                type="button"
                onClick={() => triggerAnalysis(title, rawText, category, securityLevel)}
                className="text-xs text-indigo-700 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                <span>AI自動解析を実行</span>
              </button>
            </div>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                setDuplicateAlert(null);
              }}
              onBlur={() => triggerAnalysis(title, rawText, category, securityLevel)}
              placeholder="書類のテキスト内容を入力または貼り付けてください..."
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 leading-relaxed"
            />
          </div>

          {/* AI Analysis Preview Cards */}
          {analysisResult && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1">
                    重要度自動判定
                  </div>
                  <div
                    className={`font-bold text-sm ${
                      analysisResult.importance === '緊急・重要'
                        ? 'text-rose-700'
                        : analysisResult.importance === '重要'
                        ? 'text-amber-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {analysisResult.importance}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    {analysisResult.importanceReason}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>期限・開催日自動検出</span>
                  </div>
                  {analysisResult.deadlines.length > 0 ? (
                    <div className="space-y-1 font-mono tabular-nums text-[11px]">
                      {analysisResult.deadlines.map((dl, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2">
                          <span className="font-sans text-slate-600 truncate">{dl.label}</span>
                          <span
                            className={
                              dl.urgency === '緊急'
                                ? 'text-rose-700 font-bold shrink-0'
                                : 'text-slate-900 font-semibold shrink-0'
                            }
                          >
                            {dl.dateText}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-400 text-[11px]">期限記載は検出されませんでした</div>
                  )}
                </div>
              </div>

              {/* Auto-Tags Editor */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2 text-xs">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-600" />
                  <span>自動生成タグ（編集可）</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-white border border-slate-200 px-2.5 py-1 rounded-md text-[11px] font-medium text-indigo-700"
                    >
                      <span>#{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-slate-400 hover:text-rose-600 font-bold"
                        aria-label={`${tag}を削除`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="タグ追加..."
                      className="h-7 px-2 text-[11px] bg-white border border-slate-200 rounded-md w-28 focus:outline-none focus:border-indigo-600"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="h-7 w-7 inline-flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-md"
                      title="タグを追加"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Summary Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AI要約プレビュー</span>
                </div>
                <p className="text-slate-700 leading-relaxed">{analysisResult.summary}</p>
              </div>

              {/* Automatic PII Masking Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>個人情報自動仮名化プレビュー</span>
                  </span>
                  <span className="text-xs font-mono tabular-nums text-emerald-700 font-semibold">
                    検知: {analysisResult.piiResult.detectedCount}件 保護完了
                  </span>
                </div>
                <div className="max-h-32 overflow-y-auto bg-white p-3 rounded-lg border border-slate-200 font-mono text-xs text-slate-800 whitespace-pre-wrap">
                  {analysisResult.piiResult.maskedText}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-slate-500 truncate">
            重複検知・仮名化・自動タグ付け後に校内保存されます
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => handleSaveToChroma()}
              disabled={!title.trim() || !rawText.trim() || isAnalyzing}
              className="h-9 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>校内書庫へ保存</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
