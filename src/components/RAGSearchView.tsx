import React, { useState, useEffect } from 'react';
import {
  Search,
  Sparkles,
  FileText,
  ExternalLink,
  BookmarkCheck,
  CheckCircle2,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { CategoryType, SearchResult } from '../types';
import { VoiceSearchButton } from './VoiceSearchButton';

interface RAGSearchViewProps {
  onOpenDocEvidence: (docId: string, section?: string) => void;
  onAskAIWithQuery: (query: string, docId?: string) => void;
}

export const RAGSearchView: React.FC<RAGSearchViewProps> = ({
  onOpenDocEvidence,
  onAskAIWithQuery,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'all'>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTimeMs, setSearchTimeMs] = useState(0);

  const categories: (CategoryType | 'all')[] = [
    'all',
    '行事マニュアル',
    '保健・安全',
    '学年経営',
    '生徒指導',
    'PTA資料',
    '事務・予算',
    '定期考査・成績',
  ];

  const executeSearch = async (q: string, cat: string) => {
    if (!q.trim()) return;
    setIsSearching(true);
    const startTime = performance.now();
    try {
      const res = await fetch('/api/rag-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          category: cat,
        }),
      });
      const data = await res.json();
      setResults(data.results || []);
      setSearchTimeMs(Math.round(performance.now() - startTime));
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (query.trim()) {
      executeSearch(query, selectedCategory);
    } else {
      setResults([]);
    }
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }
    executeSearch(query, selectedCategory);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          AIナレッジ検索
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          校内ベクトルデータベース（ChromaDB / bge-m3）を用いて、質問やキーワードから関連条項と根拠スニペットを抽出します。
        </p>
      </div>

      {/* Search Control Card */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="校内の書類・規程を自然言語または音声で検索（例: 体育祭の熱中症対応...）"
              className="w-full h-10 pl-10 pr-4 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-600 focus:bg-white focus:ring-2 focus:ring-indigo-500/15 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <VoiceSearchButton
              onTranscript={(text) => {
                setQuery(text);
                executeSearch(text, selectedCategory);
              }}
            />
            <button
              type="submit"
              disabled={isSearching}
              className="h-10 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {isSearching ? '検索中...' : '検索する'}
            </button>
          </div>
        </form>

        {/* Category Filter Tabs */}
        <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setSelectedCategory(cat);
                executeSearch(query, cat);
              }}
              className={`h-8 px-3 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-50 text-indigo-700 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {cat === 'all' ? '全カテゴリ' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 px-1">
        <div className="flex items-center gap-2.5 tabular-nums">
          <span className="font-semibold text-slate-800">
            検索結果: {results.length}件
          </span>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <span className="font-mono text-slate-500">
            ローカル照会時間: {searchTimeMs}ms
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAskAIWithQuery(query)}
          className="inline-flex items-center gap-1.5 text-indigo-700 hover:text-indigo-800 font-semibold whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>この検索条件でAIに要約を依頼</span>
        </button>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {results.map((res, idx) => (
          <article
            key={idx}
            className="bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-colors"
          >
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                {res.importance && res.importance !== '通常' && (
                  <>
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        res.importance === '緊急・重要' ? 'text-rose-700' : 'text-amber-700'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {res.importance}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                  </>
                )}
                <span className="font-medium text-indigo-700">{res.category}</span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span
                  className={
                    res.securityLevel === '機密'
                      ? 'text-rose-700 font-medium'
                      : res.securityLevel === '学年・部局限定'
                      ? 'text-slate-700 font-medium'
                      : 'text-slate-500'
                  }
                >
                  {res.securityLevel}
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="tabular-nums">{res.fiscalYear}</span>
                {res.deadlines && res.deadlines.length > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 text-amber-700 font-medium tabular-nums">
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      {res.deadlines[0].label}: {res.deadlines[0].dateText}
                    </span>
                  </>
                )}
              </div>

              <div className="inline-flex items-center gap-1 font-mono text-xs text-emerald-700 font-semibold tabular-nums shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>一致度 {(res.similarityScore * 100).toFixed(1)}%</span>
              </div>
            </div>

            {/* Document Title */}
            <h2 className="text-base font-semibold text-slate-900">
              <button
                type="button"
                onClick={() => onOpenDocEvidence(res.documentId, res.evidenceSnippet.section)}
                className="text-left hover:text-indigo-700 transition-colors"
              >
                {res.title}
              </button>
            </h2>

            {/* Best Matched Evidence Passage */}
            <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800 leading-relaxed">
              <div className="flex items-center gap-1.5 text-slate-700 text-xs font-semibold mb-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="font-mono tabular-nums">
                  p.{res.evidenceSnippet.page} · {res.evidenceSnippet.section}
                </span>
              </div>
              <p className="font-mono text-xs sm:text-[13px] text-slate-700 leading-relaxed">
                {res.evidenceSnippet.text}
              </p>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400">
                個人情報仮名化済みテキストを参照
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDocEvidence(res.documentId, res.evidenceSnippet.section)}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  <span>元文書・根拠を開く</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAskAIWithQuery(
                      `『${res.title}』の「${res.evidenceSnippet.section}」について詳しく解説してください。`,
                      res.documentId
                    )
                  }
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  <span>AIに質問</span>
                </button>
              </div>
            </div>
          </article>
        ))}

        {results.length === 0 && !isSearching && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="font-semibold text-slate-700 text-sm">
              {query.trim()
                ? '一致する校内書類が見つかりませんでした'
                : '検索キーワードを入力して検索を実行してください'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {query.trim()
                ? '別のキーワードで検索するか、書類登録状況をご確認ください。'
                : '登録された校内書類のタイトル・本文・キーワードから関連箇所を抽出します。'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
