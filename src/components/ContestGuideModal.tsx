import React from 'react';
import {
  CheckCircle2,
  Server,
  Cpu,
  Database,
  Layers,
  BookOpen,
  Zap,
  Lock,
  ArrowDown,
  ArrowLeftRight,
} from 'lucide-react';

export const ContestGuideModal: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <div className="text-xs font-medium text-indigo-700">
          全国情報教育研究会（全情コン）応募用 · システム設計仕様書
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-snug">
          紙対応 — セキュリティと効率化を両立する、ローカルAI基盤の学校書類管理・検索システム
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl">
          校内閉域ネットワーク上で完結するマルチモーダルAI-OCR、自動仮名化、ベクトル検索（RAG）の全体構成と教育現場での導入効果を整理しています。
        </p>
      </div>

      {/* System Architecture Diagram */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              01. システムアーキテクチャ（閉域LAN・ハイブリッド構成）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              校内LAN専用サーバー上にAIモデル・ベクトルDBを配備し、外部クラウドへのデータ送信を完全に遮断
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-emerald-700">
            完全校内LAN隔離（Air-Gapped）
          </span>
        </div>

        {/* Clean Light Architectural Schematic */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 sm:p-6 overflow-x-auto">
          <div className="min-w-[640px] space-y-4">
            {/* Top row: Client endpoints */}
            <div className="grid grid-cols-3 items-center gap-4">
              <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-center">
                <div className="text-xs font-semibold text-slate-900">教員端末（Webブラウザ）</div>
                <div className="text-[11px] text-slate-500 mt-1">職員室PC / 校務支援端末</div>
              </div>

              <div className="flex flex-col items-center justify-center text-slate-500 text-[11px] font-mono gap-1">
                <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
                <span>HTTPS / REST API</span>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-center">
                <div className="text-xs font-semibold text-slate-900">端末カメラ・スキャナー</div>
                <div className="text-[11px] text-slate-500 mt-1">紙書類・手書きメモ撮影</div>
              </div>
            </div>

            {/* Down arrow */}
            <div className="flex items-center justify-center gap-2 text-slate-500 text-xs font-mono py-1">
              <ArrowDown className="w-4 h-4 text-slate-400" />
              <span>校内閉域ネットワーク（192.168.10.x）</span>
            </div>

            {/* Core Box: School Local AI Server */}
            <div className="bg-white border border-indigo-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <span className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span>校内ローカルAIサーバー（メイン環境）</span>
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  GPU: RTX 4090 (24GB VRAM) / AMD EPYC
                </span>
              </div>

              {/* 3 Pipeline Stages */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>ローカルVLM</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">Qwen2-VL-7B</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">手書き文字・表構造解析</div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>個人情報マスク</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">NER + Rule Engine</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">DB保存前の自動仮名化</div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                    <Database className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Chroma / FAISS</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">Vector DB (bge-m3)</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">高速セマンティック検索</div>
                </div>
              </div>

              {/* Down to LLM */}
              <div className="pt-1 space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-mono">
                  <ArrowDown className="w-3.5 h-3.5 text-slate-400" />
                  <span>仮名化済み文脈を供給（RAG）</span>
                </div>
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-lg text-center">
                  <div className="text-xs font-semibold text-slate-900 flex items-center justify-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-600" />
                    <span>vLLM / LM Studio（14B〜32B ローカルLLM / Qwen2.5-32B）</span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    根拠文書ページ・条項を引用した高精度日本語要約・回答生成（推論速度 ~45ms/token）
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Competition Form Breakdown Guide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm pb-3 border-b border-slate-100">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>02. 作品の仕組み（処理パイプライン）</span>
          </div>
          <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">ペーパーレス化（ローカルVLM）:</strong> 紙書類や各種Officeファイル・PDFをカメラ撮影または取り込み、レイアウトや手書き文字を含めローカルで高精度構造化。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">個人情報保護・匿名化:</strong> 保存前に生徒・保護者・教員の氏名、学籍番号、電話番号、住所を検出し、復元不能な仮名化コード（[生徒ID: S-1029]等）へ置換。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">ローカルDB/RAG蓄積:</strong> 仮名化テキストのみをChromaDBに埋め込みインデックス化。外部クラウド送信はゼロ。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">ローカルLLM検索・要約:</strong> 32Bオープンモデルが校内ナレッジから安全に情報抽出し、根拠条項スニペットを明示。
              </span>
            </li>
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm pb-3 border-b border-slate-100">
            <Zap className="w-4 h-4 text-indigo-600" />
            <span>03. 工夫した点と教育現場での効果</span>
          </div>
          <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">完全校内ローカル構成:</strong> 閉域LAN内完結のため、情報漏洩や規約面のリスクを抑えた安全な学校現場DXを実現。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">根拠プレビュー付き検索UI:</strong> AIの誤答（ハルシネーション）を防ぎ、教員が元資料のページ・条項を即座に確認可能。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">ワンタップクリップボード連携:</strong> 週報作成や引継ぎ資料への即時流用が可能となり、教員の検索・書類作成時間を月間約20時間削減。
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-900">多層アクセス権限（RBAC）:</strong> 全校共有・学年部局限定・機密区分により、生徒指導記録等の機微情報を厳重に防護。
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
};
