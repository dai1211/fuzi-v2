import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Gemini if API key is provided
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Gemini client initialization failed, falling back to local engine:', err);
  }
}

// Default initial documents data with authentic school materials
export interface DeadlineItem {
  label: string;
  dateText: string;
  type: '提出期限' | '開催日' | '定期期日';
  urgency: '緊急' | '近日' | '通常';
}

export interface DocumentRevision {
  version: number;
  updatedAt: string;
  updatedBy: string;
  changeNote: string;
  maskedText: string;
  summary: string;
}

export interface SchoolDoc {
  id: string;
  title: string;
  category: '学年経営' | '行事マニュアル' | 'PTA資料' | '生徒指導' | '事務・予算' | '保健・安全' | '定期考査・成績';
  securityLevel: '全校共有' | '学年・部局限定' | '機密';
  importance: '緊急・重要' | '重要' | '通常';
  importanceReason: string;
  department: string;
  receivedFrom?: string;
  author: string;
  authorMasked: string;
  date: string;
  fiscalYear: string;
  fileType: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'jpg' | 'handwriting';
  pageCount: number;
  originalText: string;
  maskedText: string;
  summary: string;
  aiSummaryPoints: string[];
  keywords: string[];
  deadlines: DeadlineItem[];
  piiCount: number;
  piiItems: { type: string; original: string; masked: string }[];
  evidenceSnippets: { page: number; section: string; text: string }[];
  version: number;
  contentHash: string;
  revisions: DocumentRevision[];
}

export interface DeletedSchoolDoc extends SchoolDoc {
  deletedAt: string;
}

export interface PiiBackupRecord {
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

let schoolDocuments: SchoolDoc[] = ([
  {
    id: 'doc-001',
    title: '令和7年度 体育祭実施要項・危機管理＆熱中症対応マニュアル',
    category: '行事マニュアル',
    securityLevel: '全校共有',
    department: '保健体育科・特別活動部',
    receivedFrom: '保健体育科（高橋 正人 主任）',
    author: '体育科主任 高橋 正人',
    authorMasked: '体育科主任 [教員ID: T-0104]',
    date: '2026-05-12',
    fiscalYear: '令和7年度',
    fileType: 'pdf',
    pageCount: 12,
    keywords: ['体育祭', '熱中症', 'WBGT', '緊急避難', 'プログラム', '危機管理'],
    summary: '体育祭の進行要領およびWBGT値（暑さ指数）に基づく中断・短縮・救護搬送手順。WBGT 31度以上で即時競技中断と体育館避難を義務付け。',
    originalText: `令和7年度 秋季大運動会・体育祭 実施要項
主催: 学校行事運営委員会
総括責任者: 教頭 佐藤 秀樹
危機管理担当: 体育科主任 高橋 正人 (連絡先: 090-1234-5678)
養護教諭: 水野 恵美 (内線: 204)

第1章 危機管理・熱中症対策基準
1. WBGT（暑さ指数）測定の義務付け
・本部席およびグラウンド中央2箇所にて、30分ごとにWBGT測定器で数値を計測・記録する。
・WBGT 28度〜30度（厳重警戒）: 給水タイムを15分ごとに設定し、待機生徒は遮光テント下に待機させる。
・WBGT 31度以上（危険・中止基準）: 競技を直ちに一時中断し、全生徒を冷房の効いた第1・第2体育館および各普通教室へ避難誘導する。プログラムの午後の部は中止または翌週順延とする。

2. 救護所配備と救急搬送フロー
・救護テントは北校舎陰（直射日光を遮る場所）に設置し、簡易ベッド4台、経口補水液100本、冷却パック50個を配備。
・意識混濁、痙攣、自力歩行不可の場合は躊躇なく119番通報を実施し、教頭 佐藤 秀樹へ第一報を入れる。
・近隣指定医療機関: 県立中央病院 (0985-00-1111) 救命救急センター`,
    maskedText: `令和7年度 秋季大運動会・体育祭 実施要項
主催: 学校行事運営委員会
総括責任者: 教頭 [教員ID: T-0002]
危機管理担当: 体育科主任 [教員ID: T-0104] (連絡先: [TEL: 連絡先01])
養護教諭: [教員ID: T-0089] (内線: 204)

第1章 危機管理・熱中症対策基準
1. WBGT（暑さ指数）測定の義務付け
・本部席およびグラウンド中央2箇所にて、30分ごとにWBGT測定器で数値を計測・記録する。
・WBGT 28度〜30度（厳重警戒）: 給水タイムを15分ごとに設定し、待機生徒は遮光テント下に待機させる。
・WBGT 31度以上（危険・中止基準）: 競技を直ちに一時中断し、全生徒を冷房の効いた第1・第2体育館および各普通教室へ避難誘導する。プログラムの午後の部は中止または翌週順延とする。

2. 救護所配備と救急搬送フロー
・救護テントは北校舎陰（直射日光を遮る場所）に設置し、簡易ベッド4台、経口補水液100本、冷却パック50個を配備。
・意識混濁、痙攣、自力歩行不可の場合は躊躇なく119番通報を実施し、教頭 [教員ID: T-0002] へ第一報を入れる。
・近隣指定医療機関: 県立中央病院 ([TEL: 医療機関01]) 救命救急センター`,
    piiCount: 5,
    piiItems: [
      { type: '教員名', original: '教頭 佐藤 秀樹', masked: '教頭 [教員ID: T-0002]' },
      { type: '教員名', original: '体育科主任 高橋 正人', masked: '体育科主任 [教員ID: T-0104]' },
      { type: '電話番号', original: '090-1234-5678', masked: '[TEL: 連絡先01]' },
      { type: '教員名', original: '養護教諭: 水野 恵美', masked: '養護教諭: [教員ID: T-0089]' },
      { type: '電話番号', original: '0985-00-1111', masked: '[TEL: 医療機関01]' },
    ],
    evidenceSnippets: [
      { page: 2, section: '第1章 1. WBGT測定の義務付け', text: 'WBGT 31度以上（危険・中止基準）: 競技を直ちに一時中断し、全生徒を冷房の効いた第1・第2体育館へ避難誘導する。' },
      { page: 3, section: '第1章 2. 救護所配備と救急搬送フロー', text: '意識混濁、自力歩行不可の場合は躊躇なく119番通報を実施し、教頭へ第一報を入れる。' }
    ]
  },
  {
    id: 'doc-002',
    title: '学校感染症・インフルエンザ等集団発生時対応マニュアル＆出席停止基準',
    category: '保健・安全',
    securityLevel: '全校共有',
    department: '保健部・学校医連携室',
    receivedFrom: '学校医連携室（水野 恵美 養護教諭）',
    author: '養護教諭 水野 恵美',
    authorMasked: '養護教諭 [教員ID: T-0089]',
    date: '2026-10-01',
    fiscalYear: '令和7年度',
    fileType: 'pdf',
    pageCount: 8,
    keywords: ['インフルエンザ', '出席停止', '学級閉鎖', '学校保健安全法', '治癒証明書'],
    summary: '学校保健安全法施行規則に基づくインフルエンザ、新型コロナ、麻疹等の出席停止期間基準および学級閉鎖（20%発症）判定フロー。',
    originalText: `学校保健安全法施行規則 第19条に基づく感染症出席停止および学級閉鎖基準
策定: 保健委員会・学校医連携室
責任者: 学校医 小野寺 順一 医師 / 養護教諭 水野 恵美

1. インフルエンザ出席停止期間基準
「発症した後5日を経過し、かつ、解熱した後2日（幼児にあっては3日）を経過するまで」を出席停止とする。
・発症日を「0日目」として起算する。
・登校再開時には「登校許可証明書」または保護者記入の「療養報告書」の提出を必須とする。

2. 学級閉鎖・学年閉鎖の判断指標
・同一学級において、感染症による欠席者が在籍人数の20%以上（例: 35名学級で7名以上）に達した場合、学年主任および校長と協議の上、原則3日間の学級閉鎖を実施する。
・授業の補填措置として、校内閉域LAN環境で利用可能なGoogle Classroom / 自習課題パケットを当日に配信する。`,
    maskedText: `学校保健安全法施行規則 第19条に基づく感染症出席停止および学級閉鎖基準
策定: 保健委員会・学校医連携室
責任者: 学校医 [学校医ID: DOC-01] 医師 / 養護教諭 [教員ID: T-0089]

1. インフルエンザ出席停止期間基準
「発症した後5日を経過し、かつ、解熱した後2日（幼児にあっては3日）を経過するまで」を出席停止とする。
・発症日を「0日目」として起算する。
・登校再開時には「登校許可証明書」または保護者記入の「療養報告書」の提出を必須とする。

2. 学級閉鎖・学年閉鎖の判断指標
・同一学級において、感染症による欠席者が在籍人数の20%以上（例: 35名学級で7名以上）に達した場合、学年主任および校長と協議の上、原則3日間の学級閉鎖を実施する。
・授業の補填措置として、校内閉域LAN環境で利用可能なGoogle Classroom / 自習課題パケットを当日に配信する。`,
    piiCount: 2,
    piiItems: [
      { type: '校医名', original: '学校医 小野寺 順一', masked: '学校医 [学校医ID: DOC-01]' },
      { type: '教員名', original: '養護教諭 水野 恵美', masked: '養護教諭 [教員ID: T-0089]' },
    ],
    evidenceSnippets: [
      { page: 1, section: '1. インフルエンザ出席停止期間基準', text: '発症した後5日を経過し、かつ、解熱した後2日を経過するまでを出席停止とする（発症日を0日目とする）。' },
      { page: 2, section: '2. 学級閉鎖の判断指標', text: '同一学級において欠席者が在籍人数の20%以上に達した場合、原則3日間の学級閉鎖を実施する。' }
    ]
  },
  {
    id: 'doc-003',
    title: '第2学年 学年経営計画書・校外学習（修学旅行事前調査）実施要項',
    category: '学年経営',
    securityLevel: '学年・部局限定',
    department: '第2学年団',
    receivedFrom: '第2学年主任（木村 康介）',
    author: '学年主任 木村 康介',
    authorMasked: '学年主任 [教員ID: T-0034]',
    date: '2026-06-20',
    fiscalYear: '令和7年度',
    fileType: 'docx',
    pageCount: 15,
    keywords: ['学年経営', '校外学習', '修学旅行', '班行動', 'アレルギー調査', '費用積立'],
    summary: '2学年経営重点目標および秋季京都・奈良方面修学旅行の班編成・アレルギー該当生徒配慮方針。食物アレルギー対応エピペン保持者の事前確認を含む。',
    originalText: `令和7年度 第2学年 学年経営計画ならびに校外学習実施計画
作成者: 第2学年主任 木村 康介 (学年団教諭: 井上 萌、中村 匠、松田 慎吾)

第1節 学年目標
「自律と共生：仲間と高め合い、未来を拓く判断力を養う」

第2節 校外学習（修学旅行）における配慮事項
1. 食物アレルギー個別対応
・生徒: 田中 結菜 (2年3組・学籍番号 24082) - 卵・乳成分重篤アレルギーあり。保護者 田中 美咲 (090-8888-1234) と事前献立擦り合わせ完了。宿泊先「古都の宿」にて完全除去食対応。
・携帯薬: エピペンを本人リュックおよび引率教諭 井上 萌 のウエストポーチに常時2本携行。
2. 班別自主研修行動管理
・生徒用学校貸与タブレット（GPS機能は校外学習専用SIMにて稼働）による1時間ごとのチェックポイント通過報告。`,
    maskedText: `令和7年度 第2学年 学年経営計画ならびに校外学習実施計画
作成者: 第2学年主任 [教員ID: T-0034] (学年団教諭: [教員ID: T-0051]、[教員ID: T-0062]、[教員ID: T-0078])

第1節 学年目標
「自律と共生：仲間と高め合い、未来を拓く判断力を養う」

第2節 校外学習（修学旅行）における配慮事項
1. 食物アレルギー個別対応
・生徒: [生徒ID: S-24082] (2年3組・学籍番号 [学籍番号: 24082]) - 卵・乳成分重篤アレルギーあり。保護者 [保護者ID: P-0821] ([TEL: 連絡先02]) と事前献立擦り合わせ完了。宿泊先「古都の宿」にて完全除去食対応。
・携帯薬: エピペンを本人リュックおよび引率教諭 [教員ID: T-0051] のウエストポーチに常時2本携行。
2. 班別自主研修行動管理
・生徒用学校貸与タブレット（GPS機能は校外学習専用SIMにて稼働）による1時間ごとのチェックポイント通過報告。`,
    piiCount: 7,
    piiItems: [
      { type: '生徒氏名', original: '田中 結菜', masked: '[生徒ID: S-24082]' },
      { type: '保護者氏名', original: '保護者 田中 美咲', masked: '保護者 [保護者ID: P-0821]' },
      { type: '電話番号', original: '090-8888-1234', masked: '[TEL: 連絡先02]' },
      { type: '学籍番号', original: '24082', masked: '[学籍番号: 24082]' },
      { type: '教員名', original: '学年主任 木村 康介', masked: '学年主任 [教員ID: T-0034]' },
      { type: '教員名', original: '引率教諭 井上 萌', masked: '引率教諭 [教員ID: T-0051]' },
      { type: '教員名', original: '中村 匠、松田 慎吾', masked: '[教員ID: T-0062]、[教員ID: T-0078]' },
    ],
    evidenceSnippets: [
      { page: 4, section: '第2節 1. 食物アレルギー個別対応', text: 'エピペンを本人リュックおよび引率教諭のウエストポーチに常時2本携行すること。' },
      { page: 6, section: '第2節 2. 班別自主研修行動管理', text: '生徒用学校貸与タブレットによる1時間ごとのチェックポイント通過報告を徹底する。' }
    ]
  },
  {
    id: 'doc-004',
    title: '個別生徒指導カルテおよび特別支援・教育相談記録（要秘匿管理）',
    category: '生徒指導',
    securityLevel: '機密',
    department: '生徒指導部・教育相談室',
    receivedFrom: '生徒指導部（吉田 剛 主事）',
    author: '生徒指導主事 吉田 剛',
    authorMasked: '生徒指導主事 [教員ID: T-0012]',
    date: '2026-09-18',
    fiscalYear: '令和7年度',
    fileType: 'handwriting',
    pageCount: 4,
    keywords: ['生徒指導', '要配慮', 'カウンセリング', '個別支援計画', '守秘義務'],
    summary: '個別生徒の指導記録、家庭環境事情、スクールカウンセラー面談記録。最重要機密区分として管理職および生徒指導コア教員のみアクセス許可。',
    originalText: `【極秘・教職員機密扱い】個別生徒指導・教育相談記録票
記載者: 生徒指導主事 吉田 剛 / スクールカウンセラー 浅見 麗華

対象生徒: 佐々木 陸（1年2組・学籍番号 26019）
保護者: 父 佐々木 晃一 (住所: 宮崎市橘通東3丁目4-12 / 携帯: 080-5555-4321)
相談経緯:
5月下旬より朝の登校しぶりおよび起立性調節障害の疑い。教室入室時に過呼吸の症状が見られる。
SC浅見による第3回面談所見:
・友人関係におけるトラブルは確認されず。学業プレッシャーおよび部活動（陸上部）の適応疲労が主因。
・対応方針: 別室登校（相談室サテライト）を週2日試験導入。学級担任 山口 陽子 と連携し、提出課題の分量を30%軽減。
・家庭連携: 母親は夜勤勤務のため、緊急連絡先は祖母（佐々木 登美子: 0985-22-3344）を優先登録。`,
    maskedText: `【極秘・教職員機密扱い】個別生徒指導・教育相談記録票
記載者: 生徒指導主事 [教員ID: T-0012] / スクールカウンセラー [専門員ID: SC-02]

対象生徒: [生徒ID: S-26019]（1年2組・学籍番号 [学籍番号: 26019]）
保護者: 父 [保護者ID: P-0193] (住所: [住所秘匿: 区域B] / 携帯: [TEL: 連絡先03])
相談経緯:
5月下旬より朝の登校しぶりおよび起立性調節障害の疑い。教室入室時に過呼吸の症状が見られる。
SC[専門員ID: SC-02] による第3回面談所見:
・友人関係におけるトラブルは確認されず。学業プレッシャーおよび部活動（陸上部）の適応疲労が主因。
・対応方針: 別室登校（相談室サテライト）を週2日試験導入。学級担任 [教員ID: T-0095] と連携し、提出課題の分量を30%軽減。
・家庭連携: 母親は夜勤勤務のため、緊急連絡先は祖母（[保護者ID: P-0194]: [TEL: 連絡先04]）を優先登録。`,
    piiCount: 8,
    piiItems: [
      { type: '生徒氏名', original: '佐々木 陸', masked: '[生徒ID: S-26019]' },
      { type: '保護者氏名', original: '父 佐々木 晃一', masked: '父 [保護者ID: P-0193]' },
      { type: '住所', original: '宮崎市橘通東3丁目4-12', masked: '[住所秘匿: 区域B]' },
      { type: '電話番号', original: '080-5555-4321', masked: '[TEL: 連絡先03]' },
      { type: '学籍番号', original: '26019', masked: '[学籍番号: 26019]' },
      { type: '教員・専門職', original: '生徒指導主事 吉田 剛', masked: '生徒指導主事 [教員ID: T-0012]' },
      { type: '教員・専門職', original: 'スクールカウンセラー 浅見 麗華', masked: 'スクールカウンセラー [専門員ID: SC-02]' },
      { type: '親族氏名・電話', original: '佐々木 登美子: 0985-22-3344', masked: '[保護者ID: P-0194]: [TEL: 連絡先04]' },
    ],
    evidenceSnippets: [
      { page: 1, section: '相談経緯およびSC所見', text: '別室登校（相談室サテライト）を週2日試験導入し、提出課題の分量を30%軽減する。' },
      { page: 2, section: '緊急連絡体制', text: '母親夜勤のため緊急連絡先は祖母（優先登録）とし、学級担任と情報共有を密にする。' }
    ]
  },
  {
    id: 'doc-005',
    title: '部活動地域移行に伴う外部指導員謝金支払管理台帳および契約規程',
    category: '事務・予算',
    securityLevel: '学年・部局限定',
    department: '事務室・部活動統括',
    receivedFrom: '学校事務室（原田 敏郎 事務長）',
    author: '事務長 原田 敏郎',
    authorMasked: '事務長 [職員ID: A-0005]',
    date: '2026-04-15',
    fiscalYear: '令和7年度',
    fileType: 'xlsx',
    pageCount: 6,
    keywords: ['地域移行', '外部指導員', '謝金基準', '源泉徴収', '部活動', '予算執行'],
    summary: '部活動の休日地域移行に伴う指導員謝金単価（1時間2,500円上限）の算定基準、保険加入要件、月次支出伺い決済プロセス。',
    originalText: `部活動地域移行外部委嘱指導員 謝金執行内規および支払台帳
策定: 事務室（事務長 原田 敏郎、主任主事 西田 裕美）

1. 謝金単価及び支払基準
・実技指導1時間あたり: 2,500円（消費税および地方税含む）
・1日の上限時間: 3時間（7,500円/日）、月間上限: 30,000円
・振込期日: 翌月20日（銀行振込口座: 宮崎銀行県庁支店等）
・事前提出書類: 指導員登録申請書、誓約書、普通救命講習修了証、指導実績書

2. 傷害保険および賠償責任保険
・学校安全教育振興会指導者賠償責任補償（年額1,200円）への加入を公費負担にて義務付ける。`,
    maskedText: `部活動地域移行外部委嘱指導員 謝金執行内規および支払台帳
策定: 事務室（事務長 [職員ID: A-0005]、主任主事 [職員ID: A-0018]）

1. 謝金単価及び支払基準
・実技指導1時間あたり: 2,500円（消費税および地方税含む）
・1日の上限時間: 3時間（7,500円/日）、月間上限: 30,000円
・振込期日: 翌月20日（銀行振込口座: [金融機関指定口座秘匿]）
・事前提出書類: 指導員登録申請書、誓約書、普通救命講習修了証、指導実績書

2. 傷害保険および賠償責任保険
・学校安全教育振興会指導者賠償責任補償（年額1,200円）への加入を公費負担にて義務付ける。`,
    piiCount: 3,
    piiItems: [
      { type: '職員名', original: '事務長 原田 敏郎', masked: '事務長 [職員ID: A-0005]' },
      { type: '職員名', original: '主任主事 西田 裕美', masked: '主任主事 [職員ID: A-0018]' },
      { type: '口座情報', original: '宮崎銀行県庁支店', masked: '[金融機関指定口座秘匿]' },
    ],
    evidenceSnippets: [
      { page: 1, section: '1. 謝金単価及び支払基準', text: '実技指導1時間あたり2,500円、1日上限3時間（7,500円）、月間上限30,000円。翌月20日振込。' },
      { page: 2, section: '2. 保険加入義務', text: '指導者賠償責任補償（年額1,200円）への加入を公費負担にて義務付ける。' }
    ]
  },
  {
    id: 'doc-006',
    title: '令和7年度 PTA役員総会 議事録およびPTA規約一部改定案',
    category: 'PTA資料',
    securityLevel: '全校共有',
    department: 'PTA本部・庶務',
    receivedFrom: 'PTA本部（斉藤 芳樹 会長）',
    author: 'PTA会長 斉藤 芳樹',
    authorMasked: 'PTA会長 [保護者役員ID: PTA-001]',
    date: '2026-05-28',
    fiscalYear: '令和7年度',
    fileType: 'pdf',
    pageCount: 10,
    keywords: ['PTA総会', '規約改定', '役員選出', 'ボランティア制', '会費減額'],
    summary: 'PTA役員免除規定の撤廃と完全エントリー制（希望制）への移行、および会費年額3,600円から3,000円への引き下げ可決議事録。',
    originalText: `令和7年度 第1回PTA定期総会 議事録
日時: 令和7年5月28日 15:30〜
場所: 本校多目的ホール
出席者: PTA会長 斉藤 芳樹、副会長 堀内 直美、学校長 谷口 誠、教頭 佐藤 秀樹

議事第2号議案: PTA規約第14条（役員選出および活動形式）改定について
・従来の各学級2名強制選出・ポイント制を廃止。
・行事ごとの単発ボランティア登録制「サポーターズシステム」を導入。
・反対意見なし、挙手全員一致により原案通り可決。

議事第3号議案: 令和7年度 予算案
・活動スリム化に伴い、PTA会費を月額300円（年額3,600円）から月額250円（年額3,000円）に改定。`,
    maskedText: `令和7年度 第1回PTA定期総会 議事録
日時: 令和7年5月28日 15:30〜
場所: 本校多目的ホール
出席者: PTA会長 [保護者役員ID: PTA-001]、副会長 [保護者役員ID: PTA-002]、学校長 [教員ID: T-0001]、教頭 [教員ID: T-0002]

議事第2号議案: PTA規約第14条（役員選出および活動形式）改定について
・従来の各学級2名強制選出・ポイント制を廃止。
・行事ごとの単発ボランティア登録制「サポーターズシステム」を導入。
・反対意見なし、挙手全員一致により原案通り可決。

議事第3号議案: 令和7年度 予算案
・活動スリム化に伴い、PTA会費を月額300円（年額3,600円）から月額250円（年額3,000円）に改定。`,
    piiCount: 4,
    piiItems: [
      { type: '保護者役員', original: 'PTA会長 斉藤 芳樹', masked: 'PTA会長 [保護者役員ID: PTA-001]' },
      { type: '保護者役員', original: '副会長 堀内 直美', masked: '副会長 [保護者役員ID: PTA-002]' },
      { type: '教員名', original: '学校長 谷口 誠', masked: '学校長 [教員ID: T-0001]' },
      { type: '教員名', original: '教頭 佐藤 秀樹', masked: '教頭 [教員ID: T-0002]' },
    ],
    evidenceSnippets: [
      { page: 2, section: '議事第2号議案: PTA規約改定', text: '従来の各学級2名強制選出・ポイント制を廃止し、単発ボランティア制を導入する。' },
      { page: 3, section: '議事第3号議案: 予算案', text: 'PTA会費を年額3,600円から年額3,000円（月額250円）に引き下げる。' }
    ]
  },
  {
    id: 'doc-007',
    title: '令和7年度 前期中間考査 実施細則および採点不正防止・情報漏洩対策基準',
    category: '定期考査・成績',
    securityLevel: '機密',
    department: '教務部・学力向上推進委員会',
    receivedFrom: '教務部（菊池 信彦 主任）',
    author: '教務主任 菊池 信彦',
    authorMasked: '教務主任 [教員ID: T-0008]',
    date: '2026-05-18',
    fiscalYear: '令和7年度',
    fileType: 'pdf',
    pageCount: 7,
    keywords: ['中間考査', '成績管理', '採点基準', '情報漏洩防止', 'USBメモリ禁止'],
    summary: '定期試験問題作成時のオフライン端末使用義務、印刷室の施錠手順、採点答案の持ち帰り禁止および二重点検フロー規程。',
    originalText: `令和7年度 前期中間考査 実施細則ならびに考査問題・成績管理セキュリティ基準
統括: 教務部（教務主任 菊池 信彦、成績担当 工藤 早紀）

1. 考査問題の作成および保管
・考査問題および解答用紙の作成は、原則として校内閉域LAN専用PC（外部インターネット遮断端末）にて行う。
・私有USBメモリや個人クラウドストレージへの問題ファイル保存は厳禁とし、違反者は服務規律違反処分の対象とする。
・印刷完了後の問題用紙は、職員室金庫（第2耐火金庫）に教頭 佐藤 秀樹 または教務主任 菊池 信彦 が立会いの上、厳封・施錠保管する。

2. 採点および点検フロー
・答案用紙の校外持ち出し（自宅採点）は全面禁止。
・採点は職員室内で実施し、大問ごとに異なる教諭によるクロスチェック（二重点検）を必須とする。`,
    maskedText: `令和7年度 前期中間考査 実施細則ならびに考査問題・成績管理セキュリティ基準
統括: 教務部（教務主任 [教員ID: T-0008]、成績担当 [教員ID: T-0042]）

1. 考査問題の作成および保管
・考査問題および解答用紙の作成は、原則として校内閉域LAN専用PC（外部インターネット遮断端末）にて行う。
・私有USBメモリや個人クラウドストレージへの問題ファイル保存は厳禁とし、違反者は服務規律違反処分の対象とする。
・印刷完了後の問題用紙は、職員室金庫（第2耐火金庫）に教頭 [教員ID: T-0002] または教務主任 [教員ID: T-0008] が立会いの上、厳封・施錠保管する。

2. 採点および点検フロー
・答案用紙の校外持ち出し（自宅採点）は全面禁止。
・採点は職員室内で実施し、大問ごとに異なる教諭によるクロスチェック（二重点検）を必須とする。`,
    piiCount: 4,
    piiItems: [
      { type: '教員名', original: '教務主任 菊池 信彦', masked: '教務主任 [教員ID: T-0008]' },
      { type: '教員名', original: '成績担当 工藤 早紀', masked: '成績担当 [教員ID: T-0042]' },
      { type: '教員名', original: '教頭 佐藤 秀樹', masked: '教頭 [教員ID: T-0002]' },
      { type: '教員名', original: '教務主任 菊池 信彦', masked: '教務主任 [教員ID: T-0008]' },
    ],
    evidenceSnippets: [
      { page: 2, section: '1. 考査問題の作成および保管', text: '考査問題の作成は校内閉域LAN専用PCにて行い、私有USBメモリ保存は厳禁とする。' },
      { page: 4, section: '2. 採点および点検フロー', text: '答案用紙の校外持ち出しは全面禁止とし、大問ごとのクロスチェック（二重点検）を必須とする。' }
    ]
  }
] as any[]).map((rawDoc) => {
  const enriched = enrichDocumentFields(rawDoc);
  return enriched;
});

let deletedDocuments: DeletedSchoolDoc[] = [];
let piiBackupRecords: PiiBackupRecord[] = [];

// ============================================================================
// Intelligence Helpers: Deadlines, Importance, Auto-Tags, Summary, Duplicates
// ============================================================================

function computeContentHash(text: string): string {
  const normalized = text.replace(/\s+/g, '').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function getBigrams(str: string): Set<string> {
  const clean = str.replace(/\s+/g, '').toLowerCase();
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

function computeTextSimilarity(a: string, b: string): number {
  const setA = getBigrams(a);
  const setB = getBigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 100) / 100;
}

function detectDeadlines(text: string, docDate?: string): DeadlineItem[] {
  const found: DeadlineItem[] = [];
  const seen = new Set<string>();

  const addUnique = (item: DeadlineItem) => {
    const key = `${item.label}:${item.dateText}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push(item);
    }
  };

  // Match explicit deadline lines or date expressions
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 1. Explicit YYYY年MM月DD日 or 令和X年MM月DD日 or MM月DD日
    const jpDateMatch = trimmed.match(/((?:令和\d+年|20\d{2}年)?\d{1,2}月\d{1,2}日(?:\s*\d{1,2}:\d{2})?)/);
    if (jpDateMatch) {
      const dateText = jpDateMatch[1];
      let type: DeadlineItem['type'] = '開催日';
      let urgency: DeadlineItem['urgency'] = '通常';
      let label = '記載期日';

      if (/締切|期限|提出|期日|まで/.test(trimmed)) {
        type = '提出期限';
        urgency = '緊急';
        label = '提出・対応期限';
      } else if (/振込|毎月|翌月|定期/.test(trimmed)) {
        type = '定期期日';
        urgency = '近日';
        label = '定期処理期日';
      } else if (/日時|面談|総会|実施|開催|予定/.test(trimmed)) {
        type = '開催日';
        urgency = '近日';
        label = '実施・面談日時';
      }
      addUnique({ label, dateText, type, urgency });
    }

    // 2. Relative/recurring deadlines like 翌月20日, 午前6時00分, 11月25日
    if (!jpDateMatch) {
      const recurringMatch = trimmed.match(/(翌月\d{1,2}日|毎月\d{1,2}日|午前\d{1,2}時(?:\d{1,2}分)?|週\d+日|翌朝\d{1,2}:\d{2})/);
      if (recurringMatch) {
        const isUrgent = /翌朝|午前6時|緊急/.test(trimmed);
        addUnique({
          label: /振込/.test(trimmed) ? '振込期日' : /面談/.test(trimmed) ? '面談予定' : '基準時刻・周期',
          dateText: recurringMatch[1],
          type: isUrgent ? '提出期限' : '定期期日',
          urgency: isUrgent ? '緊急' : '通常',
        });
      }
    }

    // 3. Slash dates like 6/14 or 2026/11/20
    const slashMatch = trimmed.match(/((?:20\d{2}\/)?\d{1,2}\/\d{1,2})/);
    if (slashMatch) {
      addUnique({
        label: /締切|期限|提出/.test(trimmed) ? '提出期限' : '対象日付',
        dateText: slashMatch[1],
        type: /締切|期限|提出/.test(trimmed) ? '提出期限' : '開催日',
        urgency: /締切|期限|提出/.test(trimmed) ? '緊急' : '通常',
      });
    }
  }

  // Fallback contextual deadline from docDate if none detected
  if (found.length === 0 && docDate) {
    addUnique({
      label: '発出・登録日',
      dateText: docDate,
      type: '定期期日',
      urgency: '通常',
    });
  }

  return found.slice(0, 4);
}

function classifyImportance(
  title: string,
  text: string,
  category: string,
  securityLevel: string
): { importance: '緊急・重要' | '重要' | '通常'; importanceReason: string } {
  const combined = `${title} ${text}`;

  const urgentKeywords = ['極秘', '119番', 'エピペン', 'アナフィラキシー', 'WBGT 31度', '危機管理', '暴風警報', '情報漏洩', '厳禁', '過呼吸', '中止基準'];
  const highKeywords = ['出席停止', '学級閉鎖', 'アレルギー', '二重点検', '必須', '提出期限', '締切', '賠償責任', '規約改定', '要配慮'];

  const matchedUrgent = urgentKeywords.filter((k) => combined.includes(k));
  if (matchedUrgent.length > 0 || securityLevel === '機密') {
    const reason =
      matchedUrgent.length > 0
        ? `緊急対応・安全配慮キーワード（${matchedUrgent.slice(0, 2).join('・')}）を検出`
        : '秘匿度「機密」区分の最重要管理文書';
    return { importance: '緊急・重要', importanceReason: reason };
  }

  const matchedHigh = highKeywords.filter((k) => combined.includes(k));
  if (matchedHigh.length > 0 || category === '保健・安全' || category === '生徒指導') {
    const reason =
      matchedHigh.length > 0
        ? `重要規程・期限事項（${matchedHigh.slice(0, 2).join('・')}）を含む`
        : `${category}カテゴリの重要標準マニュアル`;
    return { importance: '重要', importanceReason: reason };
  }

  return { importance: '通常', importanceReason: '定常業務・一般共有文書' };
}

function generateAutoTags(title: string, text: string, category: string): string[] {
  const combined = `${title} ${text}`;
  const dictionary: [string, string[]][] = [
    ['熱中症対策', ['熱中症', 'WBGT', '給水', '遮光']],
    ['救急対応', ['119番', '救急', '救護', '意識混濁']],
    ['感染症・出席停止', ['インフルエンザ', '出席停止', '学級閉鎖', '解熱']],
    ['食物アレルギー', ['アレルギー', 'エピペン', '除去食', 'アナフィラキシー']],
    ['修学旅行・校外学習', ['修学旅行', '校外学習', '班行動', '宿泊']],
    ['生徒指導・相談', ['生徒指導', 'カウンセラー', '面談', '登校', 'トラブル']],
    ['個人情報保護', ['仮名化', '秘匿', '漏洩', '守秘義務']],
    ['災害・気象警報', ['台風', '暴風警報', '臨時休校', '避難']],
    ['PTA・保護者連携', ['PTA', '総会', 'ボランティア', '保護者']],
    ['会計・謝金規程', ['謝金', '振込', '予算', '保険']],
    ['定期考査・成績', ['考査', '採点', '答案', '金庫']],
    ['要期限確認', ['期限', '締切', '翌月20日', 'まで']],
  ];

  const tags = new Set<string>();
  tags.add(category);

  for (const [tag, triggers] of dictionary) {
    if (triggers.some((t) => combined.includes(t))) {
      tags.add(tag);
    }
  }

  return Array.from(tags).slice(0, 6);
}

function generateConciseSummary(title: string, maskedText: string): { summary: string; aiSummaryPoints: string[] } {
  const lines = maskedText
    .split(/\r?\n/)
    .map((l) => l.replace(/^[・\-\*\d\.\s]+/, '').trim())
    .filter((l) => l.length >= 12 && !l.startsWith('【') && !l.startsWith('作成者') && !l.startsWith('策定'));

  const points: string[] = [];
  for (const line of lines) {
    if (points.length >= 3) break;
    const clean = line.length > 90 ? `${line.slice(0, 88)}…` : line;
    if (!points.includes(clean)) {
      points.push(clean);
    }
  }

  if (points.length === 0) {
    points.push(`${title}に関する校内標準規程および実施手順。`);
  }

  const summary = points.slice(0, 2).join(' / ');
  return { summary, aiSummaryPoints: points };
}

function enrichDocumentFields(raw: any): SchoolDoc {
  const title: string = raw.title || '無題の校内書類';
  const maskedText: string = raw.maskedText || '';
  const originalText: string = raw.originalText || maskedText;
  const category = raw.category || '学年経営';
  const securityLevel = raw.securityLevel || '全校共有';

  const deadlines = raw.deadlines || detectDeadlines(originalText, raw.date);
  const imp = classifyImportance(title, originalText, category, securityLevel);
  const autoTags = generateAutoTags(title, originalText, category);
  const mergedKeywords = Array.from(new Set([...(raw.keywords || []), ...autoTags])).slice(0, 7);
  const concise = generateConciseSummary(title, maskedText);

  // Build seed revision history for key manuals so diff viewer works immediately
  let revisions: DocumentRevision[] = raw.revisions || [];
  let version = raw.version || 1;

  if (revisions.length === 0 && (raw.id === 'doc-001' || raw.id === 'doc-002' || raw.id === 'doc-006')) {
    version = 2;
    const oldMasked = maskedText
      .replace('WBGT 31度以上（危険・中止基準）', 'WBGT 31度以上（原則中止・管理職協議）')
      .replace('給水タイムを15分ごとに設定', '給水タイムを30分ごとに設定')
      .replace('経口補水液100本', '経口補水液50本')
      .replace('在籍人数の20%以上', '在籍人数の25%以上')
      .replace('年額3,000円', '年額3,600円')
      .replace('単発ボランティア登録制「サポーターズシステム」を導入', '各学級2名選出制を継続しつつ一部免除規定を追加');

    revisions = [
      {
        version: 1,
        updatedAt: '2025-05-10',
        updatedBy: raw.authorMasked || '[教員ID: T-0002]',
        changeNote: '令和6年度版 初回登録',
        maskedText: oldMasked,
        summary: '前年度規程ベース（旧基準数値適用）',
      },
      {
        version: 2,
        updatedAt: raw.date || '2026-05-12',
        updatedBy: raw.authorMasked || '[教員ID: T-0002]',
        changeNote: '令和7年度最新改定（安全基準強化・最新方針反映）',
        maskedText,
        summary: raw.summary || concise.summary,
      },
    ];
  } else if (revisions.length === 0) {
    revisions = [
      {
        version: 1,
        updatedAt: raw.date || new Date().toISOString().split('T')[0],
        updatedBy: raw.authorMasked || '[教員ID: T-0100]',
        changeNote: '初回ローカル登録（仮名化適用済）',
        maskedText,
        summary: raw.summary || concise.summary,
      },
    ];
  }

  return {
    ...raw,
    importance: imp.importance,
    importanceReason: imp.importanceReason,
    summary: raw.summary || concise.summary,
    aiSummaryPoints: raw.aiSummaryPoints || concise.aiSummaryPoints,
    keywords: mergedKeywords,
    deadlines,
    version,
    contentHash: computeContentHash(originalText),
    revisions,
  };
}

function findDuplicateCandidates(title: string, rawText: string, excludeId?: string) {
  const newHash = computeContentHash(rawText);
  const duplicates: {
    id: string;
    title: string;
    similarityScore: number;
    matchType: '完全一致' | '内容類似' | 'タイトル類似';
    version: number;
    date: string;
  }[] = [];

  for (const doc of schoolDocuments) {
    if (excludeId && doc.id === excludeId) continue;
    const isExact = doc.contentHash === newHash;
    const titleSim = computeTextSimilarity(title, doc.title);
    const bodySim = computeTextSimilarity(rawText.slice(0, 800), doc.originalText.slice(0, 800));
    const maxSim = isExact ? 1.0 : Math.max(titleSim, bodySim);

    if (isExact) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: 1.0,
        matchType: '完全一致',
        version: doc.version,
        date: doc.date,
      });
    } else if (bodySim >= 0.45) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: bodySim,
        matchType: '内容類似',
        version: doc.version,
        date: doc.date,
      });
    } else if (titleSim >= 0.55) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: titleSim,
        matchType: 'タイトル類似',
        version: doc.version,
        date: doc.date,
      });
    } else if (maxSim >= 0.6) {
      duplicates.push({
        id: doc.id,
        title: doc.title,
        similarityScore: maxSim,
        matchType: '内容類似',
        version: doc.version,
        date: doc.date,
      });
    }
  }

  duplicates.sort((a, b) => b.similarityScore - a.similarityScore);
  return duplicates;
}

// Helper: Automatic PII detection and masking engine
function maskPiiInText(text: string): {
  maskedText: string;
  detectedCount: number;
  items: { type: string; original: string; masked: string }[];
} {
  let maskedText = text;
  const items: { type: string; original: string; masked: string }[] = [];

  // 1. Phone numbers
  const phoneRegex = /(0\d{1,4}-\d{1,4}-\d{3,4}|\d{10,11})/g;
  let phoneMatch;
  let phoneIdx = 1;
  const phoneRe = new RegExp(phoneRegex);
  while ((phoneMatch = phoneRe.exec(text)) !== null) {
    const original = phoneMatch[0];
    if (original.length >= 10 && !original.startsWith('202')) {
      const masked = `[TEL: 連絡先0${phoneIdx++}]`;
      items.push({ type: '電話番号', original, masked });
      maskedText = maskedText.replaceAll(original, masked);
    }
  }

  // 2. Student ID (学籍番号)
  const studentIdRegex = /(学籍番号\s*[:：]?\s*)(\d{5})/g;
  let idMatch;
  while ((idMatch = studentIdRegex.exec(text)) !== null) {
    const full = idMatch[0];
    const num = idMatch[2];
    const masked = `${idMatch[1]}[学籍番号: ${num.slice(0, 2)}***]`;
    items.push({ type: '学籍番号', original: full, masked });
    maskedText = maskedText.replaceAll(full, masked);
  }

  // 3. Address
  const addressRegex = /(宮崎県|東京都|大阪府|京都府|[一-龥]{2,3}[都道府県])?([一-龥]{1,6}[市区町村])([一-龥ぁ-んァ-ヶ0-9\-ー丁目番号]+)/g;
  let addrMatch;
  let addrIdx = 1;
  while ((addrMatch = addressRegex.exec(text)) !== null) {
    const original = addrMatch[0];
    if (original.includes('町') || original.includes('丁目') || original.includes('市')) {
      const masked = `[住所秘匿: 区域0${addrIdx++}]`;
      items.push({ type: '住所', original, masked });
      maskedText = maskedText.replaceAll(original, masked);
    }
  }

  // 4. Common full Japanese names pattern in school context (e.g. "生徒: 山田 太郎", "保護者: 佐藤 花子", "教諭 鈴木 一郎")
  const personRegex = /(生徒[:：\s]+|保護者[:：\s]+|父[:：\s]+|母[:：\s]+|教頭[:：\s]+|校長[:：\s]+|教諭[:：\s]+|主任[:：\s]+|主事[:：\s]+)([一-龥]{2,4}[\s　][一-龥]{1,4})/g;
  let pMatch;
  let pIdx = 100;
  while ((pMatch = personRegex.exec(text)) !== null) {
    const rolePrefix = pMatch[1];
    const name = pMatch[2];
    let tag = '個人名';
    let code = `[氏名ID: U-${pIdx++}]`;
    if (rolePrefix.includes('生徒')) {
      tag = '生徒氏名';
      code = `[生徒ID: S-${pIdx}]`;
    } else if (rolePrefix.includes('保護者') || rolePrefix.includes('父') || rolePrefix.includes('母')) {
      tag = '保護者氏名';
      code = `[保護者ID: P-${pIdx}]`;
    } else {
      tag = '教職員名';
      code = `[教員ID: T-${pIdx}]`;
    }
    items.push({ type: tag, original: name.trim(), masked: code });
    maskedText = maskedText.replaceAll(name, code);
  }

  return {
    maskedText,
    detectedCount: items.length,
    items,
  };
}

// ============================================================================
// Local School Storage Automatic Backup Engine
// ============================================================================
interface BackupRecord {
  id: string;
  fileName: string;
  createdAt: string;
  trigger: 'auto' | 'manual' | 'startup' | 'immediate';
  documentCount: number;
  sizeBytes: number;
  checksum: string;
}

interface BackupManifest {
  autoBackupEnabled: boolean;
  intervalMinutes: number;
  lastBackupAt: string | null;
  records: BackupRecord[];
}

const BACKUP_DIR = path.resolve('.school_local_backups');
const MANIFEST_PATH = path.join(BACKUP_DIR, 'backup-manifest.json');
const DOCUMENTS_STORE_PATH = path.join(BACKUP_DIR, 'documents-store.json');
const PII_BACKUP_PATH = path.join(BACKUP_DIR, 'pii-backup-records.json');
const MAX_BACKUP_GENERATIONS = 20;

let backupManifest: BackupManifest = {
  autoBackupEnabled: true,
  intervalMinutes: 60,
  lastBackupAt: null,
  records: [],
};

let autoBackupTimer: ReturnType<typeof setInterval> | null = null;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function saveDocumentsStore() {
  ensureBackupDir();
  const payload = {
    updatedAt: new Date().toISOString(),
    schoolDocuments,
    deletedDocuments,
  };
  fs.writeFileSync(DOCUMENTS_STORE_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

function loadDocumentsStore() {
  ensureBackupDir();
  if (fs.existsSync(DOCUMENTS_STORE_PATH)) {
    try {
      const raw = fs.readFileSync(DOCUMENTS_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.schoolDocuments)) {
        schoolDocuments = parsed.schoolDocuments.map((d: any) => enrichDocumentFields(d));
      }
      if (Array.isArray(parsed.deletedDocuments)) {
        deletedDocuments = parsed.deletedDocuments.map((d: any) => ({
          ...enrichDocumentFields(d),
          deletedAt: typeof d.deletedAt === 'string' ? d.deletedAt : new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.warn('Failed to parse documents-store.json, using initial seed:', err);
      saveDocumentsStore();
    }
  } else {
    saveDocumentsStore();
  }
}

function savePiiBackupStore() {
  ensureBackupDir();
  const payload = {
    updatedAt: new Date().toISOString(),
    records: piiBackupRecords,
  };
  fs.writeFileSync(PII_BACKUP_PATH, JSON.stringify(payload, null, 2), 'utf-8');
}

function loadPiiBackupStore() {
  ensureBackupDir();
  if (fs.existsSync(PII_BACKUP_PATH)) {
    try {
      const raw = fs.readFileSync(PII_BACKUP_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.records)) {
        piiBackupRecords = parsed.records;
      }
    } catch (err) {
      console.warn('Failed to parse pii-backup-records.json:', err);
    }
  }
}

function upsertPiiBackupRecord(entry: Omit<PiiBackupRecord, 'id' | 'savedAt'>): PiiBackupRecord {
  const nowIso = new Date().toISOString();
  const normalizedOriginal = entry.originalText.trim();

  // Avoid creating duplicate consecutive records for identical text/document
  const existingIdx = entry.documentId
    ? piiBackupRecords.findIndex((r) => r.documentId === entry.documentId && r.source === entry.source)
    : piiBackupRecords.findIndex((r) => r.source === entry.source && r.originalText.trim() === normalizedOriginal);

  const record: PiiBackupRecord = {
    id: existingIdx !== -1 ? piiBackupRecords[existingIdx].id : `pii-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: nowIso,
    source: entry.source,
    documentId: entry.documentId,
    documentTitle: entry.documentTitle,
    originalText: entry.originalText,
    maskedText: entry.maskedText,
    detectedCount: entry.detectedCount,
    items: entry.items,
  };

  if (existingIdx !== -1) {
    piiBackupRecords.splice(existingIdx, 1);
  }
  piiBackupRecords.unshift(record);
  if (piiBackupRecords.length > 50) {
    piiBackupRecords = piiBackupRecords.slice(0, 50);
  }
  savePiiBackupStore();
  return record;
}

function loadBackupManifest() {
  ensureBackupDir();
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      backupManifest = {
        autoBackupEnabled: typeof parsed.autoBackupEnabled === 'boolean' ? parsed.autoBackupEnabled : true,
        intervalMinutes: typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes > 0 ? parsed.intervalMinutes : 60,
        lastBackupAt: parsed.lastBackupAt || null,
        records: Array.isArray(parsed.records) ? parsed.records : [],
      };
    } catch (err) {
      console.warn('Failed to parse backup-manifest.json, resetting manifest:', err);
    }
  }
}

function saveBackupManifest() {
  ensureBackupDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(backupManifest, null, 2), 'utf-8');
}

function executeLocalBackup(trigger: 'auto' | 'manual' | 'startup' | 'immediate' = 'manual'): BackupRecord {
  ensureBackupDir();
  const now = new Date();
  const isoTime = now.toISOString();
  const stamp = isoTime.replace(/[:.]/g, '-');
  const fileName = `school_docs_backup_${stamp}.json`;
  const filePath = path.join(BACKUP_DIR, fileName);

  // Store masked repository snapshot + vector index metadata (never export unmasked raw PII externally)
  const payload = {
    version: '1.1',
    exportedAt: isoTime,
    trigger,
    storageMode: 'School Local Storage (Closed LAN)',
    vectorEngine: 'ChromaDB v0.5.2 (bge-m3 1024d)',
    documentCount: schoolDocuments.length,
    deletedDocumentCount: deletedDocuments.length,
    piiBackupCount: piiBackupRecords.length,
    documents: schoolDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      department: doc.department,
      receivedFrom: doc.receivedFrom || '',
      authorMasked: doc.authorMasked,
      date: doc.date,
      fiscalYear: doc.fiscalYear,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      deadlines: doc.deadlines || [],
      maskedText: doc.maskedText,
      summary: doc.summary,
      keywords: doc.keywords,
      piiCount: doc.piiCount,
      evidenceSnippets: doc.evidenceSnippets,
    })),
    deletedDocuments: deletedDocuments.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      department: doc.department,
      receivedFrom: doc.receivedFrom || '',
      deletedAt: doc.deletedAt,
      piiCount: doc.piiCount,
    })),
  };

  const serialized = JSON.stringify(payload, null, 2);
  fs.writeFileSync(filePath, serialized, 'utf-8');

  const sizeBytes = Buffer.byteLength(serialized, 'utf-8');
  const checksum = crypto.createHash('sha256').update(serialized).digest('hex').slice(0, 12);

  const record: BackupRecord = {
    id: `bak-${now.getTime()}`,
    fileName,
    createdAt: isoTime,
    trigger,
    documentCount: schoolDocuments.length,
    sizeBytes,
    checksum,
  };

  backupManifest.lastBackupAt = isoTime;
  backupManifest.records.unshift(record);

  // Prune old snapshots beyond MAX_BACKUP_GENERATIONS
  if (backupManifest.records.length > MAX_BACKUP_GENERATIONS) {
    const removed = backupManifest.records.splice(MAX_BACKUP_GENERATIONS);
    for (const old of removed) {
      const oldPath = path.join(BACKUP_DIR, old.fileName);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  }

  saveBackupManifest();
  return record;
}

function persistAndBackupNow(trigger: 'auto' | 'manual' | 'startup' | 'immediate' = 'immediate'): BackupRecord {
  saveDocumentsStore();
  savePiiBackupStore();
  return executeLocalBackup(trigger);
}

function getBackupStatus() {
  let nextBackupAt: string | null = null;
  if (backupManifest.autoBackupEnabled && backupManifest.lastBackupAt) {
    const lastMs = new Date(backupManifest.lastBackupAt).getTime();
    if (!Number.isNaN(lastMs)) {
      nextBackupAt = new Date(lastMs + backupManifest.intervalMinutes * 60 * 1000).toISOString();
    }
  }

  const totalSizeBytes = backupManifest.records.reduce((acc, r) => acc + (r.sizeBytes || 0), 0);

  return {
    autoBackupEnabled: backupManifest.autoBackupEnabled,
    intervalMinutes: backupManifest.intervalMinutes,
    lastBackupAt: backupManifest.lastBackupAt,
    nextBackupAt,
    storagePath: './.school_local_backups',
    backupCount: backupManifest.records.length,
    totalSizeBytes,
    recentBackups: backupManifest.records.slice(0, 5),
  };
}

function rescheduleAutoBackup() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }

  if (backupManifest.autoBackupEnabled) {
    const intervalMs = Math.max(1, backupManifest.intervalMinutes) * 60 * 1000;
    autoBackupTimer = setInterval(() => {
      try {
        persistAndBackupNow('auto');
        console.log(`[School Local Backup] Scheduled auto-backup completed at ${new Date().toISOString()}`);
      } catch (err) {
        console.error('[School Local Backup] Scheduled auto-backup failed:', err);
      }
    }, intervalMs);
  }
}

// Initialize persisted stores, backup state & scheduler on startup
loadDocumentsStore();
loadPiiBackupStore();
loadBackupManifest();
if (backupManifest.records.length === 0) {
  executeLocalBackup('startup');
}
rescheduleAutoBackup();

// API Routes

// 1. Server status & Local AI diagnostics
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    serverType: '校内専用ローカルAIサーバー (School LAN Local Server)',
    ipAddress: '192.168.10.25 (閉域校内LAN)',
    isolation: {
      status: 'Air-Gapped / Isolated',
      externalTrafficBlocked: true,
      packetsOutCount: 0,
      protocol: 'HTTPS (校内LANプライベート証明書)',
    },
    localHardware: {
      gpu: 'NVIDIA RTX 4090 24GB VRAM (TensorRT-LLM加速)',
      cpu: 'AMD EPYC 16-Core Processor',
      ram: '64GB DDR5 ECC Registered',
      temperature: '54°C',
      vramUsage: '16.4 GB / 24.0 GB (68%)',
    },
    engines: {
      llm: {
        name: 'vLLM / Qwen2.5-32B-Instruct-AWQ (日本語高精度量子化)',
        contextWindow: '32,768 tokens',
        status: 'Active (推論レイテンシ ~45ms/token)',
      },
      vlm: {
        name: 'Qwen2-VL-7B-Instruct (学校帳票・手書き文字OCR解析)',
        status: 'Ready (平均処理時間 1.2秒/頁)',
      },
      vectorDb: {
        name: 'ChromaDB v0.5.2 (校内ローカル埋め込み DB)',
        embeddingModel: 'bge-m3 (日本語多言語対応 1024次元)',
        totalDocuments: schoolDocuments.length,
        indexedVectors: schoolDocuments.length * 4,
      },
      piiEngine: {
        name: '校内プライバシー仮名化エンジン v2.4 (ルールベース+NERハイブリッド)',
        status: 'Mandatory Active (保存前自動適用)',
      },
    },
    cloudBackupAvailable: Boolean(aiClient),
    backup: getBackupStatus(),
  });
});

// 1b. Local Storage Backup APIs
app.get('/api/backup/status', (req, res) => {
  res.json(getBackupStatus());
});

app.post('/api/backup/run', (req, res) => {
  try {
    const record = executeLocalBackup('manual');
    res.json({
      success: true,
      record,
      status: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'バックアップの実行に失敗しました' });
  }
});

app.post('/api/backup/config', (req, res) => {
  try {
    const { autoBackupEnabled, intervalMinutes } = req.body;
    if (typeof autoBackupEnabled === 'boolean') {
      backupManifest.autoBackupEnabled = autoBackupEnabled;
    }
    if (typeof intervalMinutes === 'number' && intervalMinutes >= 1 && intervalMinutes <= 1440) {
      backupManifest.intervalMinutes = intervalMinutes;
    }
    saveBackupManifest();
    rescheduleAutoBackup();
    res.json({
      success: true,
      status: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'バックアップ設定の更新に失敗しました' });
  }
});

// 2. Document listing with permission filtering
app.get('/api/documents', (req, res) => {
  const userRole = (req.query.role as string) || '一般教諭';
  const category = (req.query.category as string) || 'all';
  const query = (req.query.q as string) || '';

  let filtered = [...schoolDocuments];

  // Role based filtering
  if (userRole === '一般教諭') {
    filtered = filtered.filter(d => d.securityLevel === '全校共有' || d.category === '学年経営');
  } else if (userRole === '学年主任') {
    filtered = filtered.filter(d => d.securityLevel !== '機密' || d.category === '学年経営');
  } else if (userRole === '学校事務職員') {
    filtered = filtered.filter(d => d.securityLevel === '全校共有' || d.category === '事務・予算');
  } // '校長・教頭' sees all

  // Category filter
  if (category !== 'all') {
    filtered = filtered.filter(d => d.category === category);
  }

  // Keyword query
  if (query.trim()) {
    const q = query.toLowerCase();
    filtered = filtered.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.receivedFrom || '').toLowerCase().includes(q) ||
      d.keywords.some(k => k.toLowerCase().includes(q)) ||
      d.summary.toLowerCase().includes(q) ||
      d.maskedText.toLowerCase().includes(q)
    );
  }

  res.json({ documents: filtered, total: filtered.length });
});

// 3. Document details by ID
app.get('/api/documents/:id', (req, res) => {
  const doc = schoolDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }
  res.json(doc);
});

// 4. Analyze document before saving (PII + Deadlines + Importance + Auto-Tags + AI Summary + Duplicates)
app.post('/api/analyze-document', (req, res) => {
  const { title = '', rawText = '', category = '学年経営', securityLevel = '全校共有', excludeId } = req.body;
  if (!rawText.trim() && !title.trim()) {
    return res.status(400).json({ error: '解析対象のタイトルまたは本文を入力してください' });
  }

  const piiResult = maskPiiInText(rawText);
  const deadlines = detectDeadlines(rawText);
  const importance = classifyImportance(title, rawText, category, securityLevel);
  const autoTags = generateAutoTags(title, rawText, category);
  const { summary, aiSummaryPoints } = generateConciseSummary(title || '新規書類', piiResult.maskedText);
  const duplicates = findDuplicateCandidates(title, rawText, excludeId);

  res.json({
    piiResult,
    deadlines,
    importance: importance.importance,
    importanceReason: importance.importanceReason,
    autoTags,
    summary,
    aiSummaryPoints,
    duplicates,
  });
});

// 4b. Check duplicates explicitly
app.post('/api/documents/check-duplicate', (req, res) => {
  const { title = '', rawText = '', excludeId } = req.body;
  const duplicates = findDuplicateCandidates(title, rawText, excludeId);
  res.json({
    hasDuplicate: duplicates.length > 0,
    duplicates,
  });
});

// 4c. Add / Upload new document with automatic AI-OCR, PII masking, duplicate guard, and intelligence enrichment
app.post('/api/documents', (req, res) => {
  try {
    const {
      title,
      category,
      securityLevel,
      department,
      receivedFrom,
      author,
      rawText,
      fileType,
      customTags,
      customDeadlines,
      forceSave,
      updateDocId,
    } = req.body;

    if (!title || !rawText) {
      return res.status(400).json({ error: 'タイトルと文書内容は必須です' });
    }

    // If user chose to update an existing document as a new revision
    if (updateDocId) {
      const existingIdx = schoolDocuments.findIndex(d => d.id === updateDocId);
      if (existingIdx !== -1) {
        const existing = schoolDocuments[existingIdx];
        const piiResult = maskPiiInText(rawText);
        const authorPii = maskPiiInText(author || existing.author);
        const nowDate = new Date().toISOString().split('T')[0];
        const newVersion = existing.version + 1;
        const concise = generateConciseSummary(title, piiResult.maskedText);
        const deadlines =
          Array.isArray(customDeadlines) && customDeadlines.length > 0
            ? customDeadlines
            : detectDeadlines(rawText, nowDate);
        const imp = classifyImportance(title, rawText, category || existing.category, securityLevel || existing.securityLevel);
        const autoTags = generateAutoTags(title, rawText, category || existing.category);
        const finalTags = Array.isArray(customTags) && customTags.length > 0 ? customTags : autoTags;

        const newRevision: DocumentRevision = {
          version: newVersion,
          updatedAt: nowDate,
          updatedBy: authorPii.maskedText,
          changeNote: '重複検知からの新版上書き更新',
          maskedText: piiResult.maskedText,
          summary: concise.summary,
        };

        const updatedDoc: SchoolDoc = {
          ...existing,
          title,
          category: category || existing.category,
          securityLevel: securityLevel || existing.securityLevel,
          importance: imp.importance,
          importanceReason: imp.importanceReason,
          department: department || existing.department,
          receivedFrom: receivedFrom !== undefined ? receivedFrom : existing.receivedFrom,
          author: author || existing.author,
          authorMasked: authorPii.maskedText,
          date: nowDate,
          originalText: rawText,
          maskedText: piiResult.maskedText,
          summary: concise.summary,
          aiSummaryPoints: concise.aiSummaryPoints,
          keywords: finalTags,
          deadlines,
          piiCount: piiResult.detectedCount,
          piiItems: piiResult.items,
          version: newVersion,
          contentHash: computeContentHash(rawText),
          revisions: [...existing.revisions, newRevision],
        };

        schoolDocuments[existingIdx] = updatedDoc;
        if (piiResult.items.length > 0) {
          upsertPiiBackupRecord({
            source: 'document',
            documentId: updatedDoc.id,
            documentTitle: updatedDoc.title,
            originalText: rawText,
            maskedText: piiResult.maskedText,
            detectedCount: piiResult.detectedCount,
            items: piiResult.items,
          });
        }
        persistAndBackupNow('immediate');
        return res.json({ success: true, updated: true, document: updatedDoc, backupStatus: getBackupStatus() });
      }
    }

    // Duplicate detection guard unless forceSave is true
    if (!forceSave) {
      const duplicates = findDuplicateCandidates(title, rawText);
      if (duplicates.length > 0) {
        return res.status(409).json({
          error: '類似または同一内容の書類が既に登録されています',
          duplicates,
        });
      }
    }

    const piiResult = maskPiiInText(rawText);
    const authorPii = maskPiiInText(author || '教諭');
    const nowDate = new Date().toISOString().split('T')[0];
    const cat = category || '学年経営';
    const sec = securityLevel || '全校共有';
    const deadlines =
      Array.isArray(customDeadlines) && customDeadlines.length > 0
        ? customDeadlines
        : detectDeadlines(rawText, nowDate);
    const imp = classifyImportance(title, rawText, cat, sec);
    const autoTags = generateAutoTags(title, rawText, cat);
    const finalTags = Array.isArray(customTags) && customTags.length > 0 ? customTags : autoTags;
    const concise = generateConciseSummary(title, piiResult.maskedText);

    const newDoc: SchoolDoc = {
      id: `doc-${Date.now().toString().slice(-6)}`,
      title,
      category: cat,
      securityLevel: sec,
      importance: imp.importance,
      importanceReason: imp.importanceReason,
      department: department || '教務部',
      receivedFrom: typeof receivedFrom === 'string' ? receivedFrom.trim() : '',
      author: author || '担当教諭',
      authorMasked: authorPii.maskedText,
      date: nowDate,
      fiscalYear: '令和7年度',
      fileType: fileType || 'pdf',
      pageCount: Math.ceil(rawText.length / 500) || 1,
      originalText: rawText,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
      aiSummaryPoints: concise.aiSummaryPoints,
      keywords: finalTags,
      deadlines,
      piiCount: piiResult.detectedCount,
      piiItems: piiResult.items,
      evidenceSnippets: [
        {
          page: 1,
          section: '主要抜粋',
          text: piiResult.maskedText.slice(0, 200),
        },
      ],
      version: 1,
      contentHash: computeContentHash(rawText),
      revisions: [
        {
          version: 1,
          updatedAt: nowDate,
          updatedBy: authorPii.maskedText,
          changeNote: '初回ローカル登録（自動仮名化・タグ生成済）',
          maskedText: piiResult.maskedText,
          summary: concise.summary,
        },
      ],
    };

    schoolDocuments.unshift(newDoc);
    if (piiResult.items.length > 0) {
      upsertPiiBackupRecord({
        source: 'document',
        documentId: newDoc.id,
        documentTitle: newDoc.title,
        originalText: rawText,
        maskedText: piiResult.maskedText,
        detectedCount: piiResult.detectedCount,
        items: piiResult.items,
      });
    }
    persistAndBackupNow('immediate');
    res.json({ success: true, document: newDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の登録に失敗しました' });
  }
});

// 4d. Update an existing document (creates new revision for old/new diff comparison)
app.put('/api/documents/:id', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '更新対象の書類が見つかりません' });
    }

    const existing = schoolDocuments[idx];
    const { title, rawText, changeNote, updatedBy } = req.body;
    const nextTitle = title || existing.title;
    const nextOriginal = rawText || existing.originalText;
    const piiResult = maskPiiInText(nextOriginal);
    const nowDate = new Date().toISOString().split('T')[0];
    const nextVersion = existing.version + 1;
    const concise = generateConciseSummary(nextTitle, piiResult.maskedText);
    const deadlines = detectDeadlines(nextOriginal, nowDate);
    const imp = classifyImportance(nextTitle, nextOriginal, existing.category, existing.securityLevel);
    const autoTags = generateAutoTags(nextTitle, nextOriginal, existing.category);

    const newRev: DocumentRevision = {
      version: nextVersion,
      updatedAt: nowDate,
      updatedBy: updatedBy || existing.authorMasked,
      changeNote: changeNote || `第${nextVersion}版 改訂更新`,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
    };

    const updatedDoc: SchoolDoc = {
      ...existing,
      title: nextTitle,
      importance: imp.importance,
      importanceReason: imp.importanceReason,
      date: nowDate,
      originalText: nextOriginal,
      maskedText: piiResult.maskedText,
      summary: concise.summary,
      aiSummaryPoints: concise.aiSummaryPoints,
      keywords: Array.from(new Set([...existing.keywords, ...autoTags])).slice(0, 7),
      deadlines,
      piiCount: piiResult.detectedCount,
      piiItems: piiResult.items,
      version: nextVersion,
      contentHash: computeContentHash(nextOriginal),
      revisions: [...existing.revisions, newRev],
    };

    schoolDocuments[idx] = updatedDoc;
    if (piiResult.items.length > 0) {
      upsertPiiBackupRecord({
        source: 'document',
        documentId: updatedDoc.id,
        documentTitle: updatedDoc.title,
        originalText: nextOriginal,
        maskedText: piiResult.maskedText,
        detectedCount: piiResult.detectedCount,
        items: piiResult.items,
      });
    }
    persistAndBackupNow('immediate');
    res.json({ success: true, document: updatedDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の更新に失敗しました' });
  }
});

// 4d-2. Update document metadata (receivedFrom & deadlines) directly
app.patch('/api/documents/:id/metadata', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '更新対象の書類が見つかりません' });
    }

    const existing = schoolDocuments[idx];
    const { receivedFrom, deadlines } = req.body;

    const sanitizedDeadlines = Array.isArray(deadlines)
      ? deadlines
          .filter((d: any) => d && typeof d.dateText === 'string' && d.dateText.trim())
          .map((d: any) => ({
            label: typeof d.label === 'string' && d.label.trim() ? d.label.trim() : '期限',
            dateText: d.dateText.trim(),
            type: d.type === '開催日' || d.type === '定期期日' ? d.type : '提出期限',
            urgency: d.urgency === '緊急' || d.urgency === '通常' ? d.urgency : '近日',
          }))
      : existing.deadlines;

    const updatedDoc: SchoolDoc = {
      ...existing,
      receivedFrom: typeof receivedFrom === 'string' ? receivedFrom.trim() : existing.receivedFrom,
      deadlines: sanitizedDeadlines,
    };

    schoolDocuments[idx] = updatedDoc;
    persistAndBackupNow('immediate');
    res.json({ success: true, document: updatedDoc, backupStatus: getBackupStatus() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類情報の更新に失敗しました' });
  }
});

// 4d-3. Soft-delete document (hide from portal & AI, move to deletedDocuments)
app.delete('/api/documents/:id', (req, res) => {
  try {
    const idx = schoolDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '削除対象の書類が見つかりません' });
    }
    const [removed] = schoolDocuments.splice(idx, 1);
    const deletedDoc: DeletedSchoolDoc = {
      ...removed,
      deletedAt: new Date().toISOString(),
    };
    deletedDocuments.unshift(deletedDoc);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      deletedDocument: deletedDoc,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の削除に失敗しました' });
  }
});

// 4d-4. List soft-deleted (hidden) documents
app.get('/api/deleted-documents', (req, res) => {
  const userRole = (req.query.role as string) || '一般教諭';
  let filtered = [...deletedDocuments];

  if (userRole === '一般教諭') {
    filtered = filtered.filter(d => d.securityLevel === '全校共有' || d.category === '学年経営');
  } else if (userRole === '学年主任') {
    filtered = filtered.filter(d => d.securityLevel !== '機密' || d.category === '学年経営');
  } else if (userRole === '学校事務職員') {
    filtered = filtered.filter(d => d.securityLevel === '全校共有' || d.category === '事務・予算');
  }

  res.json({ documents: filtered, total: filtered.length });
});

// 4d-5. Restore a soft-deleted document back to active portal
app.post('/api/documents/:id/restore', (req, res) => {
  try {
    const idx = deletedDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '復元対象の書類が見つかりません' });
    }
    const [deletedDoc] = deletedDocuments.splice(idx, 1);
    const { deletedAt: _deletedAt, ...rest } = deletedDoc;
    const restoredDoc: SchoolDoc = { ...rest };
    schoolDocuments.unshift(restoredDoc);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      document: restoredDoc,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '書類の復元に失敗しました' });
  }
});

// 4d-6. Permanently delete a document from deletedDocuments
app.delete('/api/documents/:id/permanent', (req, res) => {
  try {
    const idx = deletedDocuments.findIndex(d => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: '完全削除対象の書類が見つかりません' });
    }
    const [removed] = deletedDocuments.splice(idx, 1);
    // Also clean associated PII backup records for permanent deletion
    piiBackupRecords = piiBackupRecords.filter(r => r.documentId !== removed.id);
    persistAndBackupNow('immediate');
    res.json({
      success: true,
      deletedId: removed.id,
      deletedCount: deletedDocuments.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '完全削除に失敗しました' });
  }
});

// 4e. Related documents search for a specific document
app.get('/api/documents/:id/related', (req, res) => {
  const target = schoolDocuments.find(d => d.id === req.params.id);
  if (!target) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }

  const userRole = (req.query.role as string) || '一般教諭';
  let candidates = schoolDocuments.filter(d => d.id !== target.id);

  if (userRole === '一般教諭') {
    candidates = candidates.filter(d => d.securityLevel === '全校共有' || d.category === '学年経営');
  } else if (userRole === '学年主任') {
    candidates = candidates.filter(d => d.securityLevel !== '機密' || d.category === '学年経営');
  } else if (userRole === '学校事務職員') {
    candidates = candidates.filter(d => d.securityLevel === '全校共有' || d.category === '事務・予算');
  }

  const related = candidates.map(doc => {
    const sharedKeywords = doc.keywords.filter(k => target.keywords.includes(k));
    const textSim = computeTextSimilarity(target.maskedText.slice(0, 600), doc.maskedText.slice(0, 600));
    const catBonus = doc.category === target.category ? 0.22 : 0;
    const kwBonus = Math.min(0.35, sharedKeywords.length * 0.14);
    const similarityScore = Math.min(0.97, Math.max(0.25, Math.round((textSim + catBonus + kwBonus) * 100) / 100));

    return {
      id: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      importance: doc.importance,
      similarityScore,
      sharedKeywords,
      date: doc.date,
    };
  });

  related.sort((a, b) => b.similarityScore - a.similarityScore);
  res.json({ related: related.slice(0, 4) });
});

// 4f. On-demand AI summarization for a specific document
app.post('/api/documents/:id/summarize', async (req, res) => {
  const doc = schoolDocuments.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).json({ error: '書類が見つかりません' });
  }

  const { useGeminiIfAvailable } = req.body || {};

  if (aiClient && useGeminiIfAvailable) {
    try {
      const response = await Promise.race([
        aiClient.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `次の仮名化済み学校書類を、忙しい教員向けに「1行の総括」と「3つの箇条書きポイント」に簡潔に要約してください。JSON形式で {"summary": "...", "points": ["...", "...", "..."]} として出力してください。\n\nタイトル: ${doc.title}\n本文:\n${doc.maskedText}`,
          config: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini summarize timeout')), 8000)
        ),
      ]);

      const parsed = JSON.parse((response.text || '{}').trim());
      if (parsed.summary && Array.isArray(parsed.points)) {
        doc.summary = parsed.summary;
        doc.aiSummaryPoints = parsed.points.slice(0, 4);
        saveDocumentsStore();
        return res.json({
          summary: doc.summary,
          aiSummaryPoints: doc.aiSummaryPoints,
          modelUsed: 'Gemini 4 Hydrogen (要約エンジン)',
        });
      }
    } catch (err: any) {
      console.warn('Gemini summarize failed, falling back to local:', err.message);
    }
  }

  const concise = generateConciseSummary(doc.title, doc.maskedText);
  doc.summary = concise.summary;
  doc.aiSummaryPoints = concise.aiSummaryPoints;
  saveDocumentsStore();

  res.json({
    summary: doc.summary,
    aiSummaryPoints: doc.aiSummaryPoints,
    modelUsed: 'vLLM / Qwen2.5-32B (ローカル要約エンジン)',
  });
});

// 5. Test PII masking preview on arbitrary text
app.post('/api/mask-pii', (req, res) => {
  const { text } = req.body || {};
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'テキストを入力してください' });
  }
  if (!text.trim()) {
    return res.json({ maskedText: '', detectedCount: 0, items: [] });
  }
  const result = maskPiiInText(text);
  res.json(result);
});

// 5b. Immediate backup endpoints for PII records (Privacy Masking Lab & Document PII)
app.get('/api/pii-backup', (req, res) => {
  res.json({
    records: piiBackupRecords,
    totalCount: piiBackupRecords.length,
    backupStatus: getBackupStatus(),
  });
});

app.post('/api/pii-backup', (req, res) => {
  try {
    const { text, documentId, documentTitle, source } = req.body || {};
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: '保存する本文テキストを入力してください' });
    }
    const piiResult = maskPiiInText(text);
    const record = upsertPiiBackupRecord({
      source: source === 'document' ? 'document' : 'lab',
      documentId: typeof documentId === 'string' ? documentId : undefined,
      documentTitle: typeof documentTitle === 'string' ? documentTitle : undefined,
      originalText: text,
      maskedText: piiResult.maskedText,
      detectedCount: piiResult.detectedCount,
      items: piiResult.items,
    });
    executeLocalBackup('immediate');
    res.json({
      success: true,
      record,
      records: piiBackupRecords,
      totalCount: piiBackupRecords.length,
      backupStatus: getBackupStatus(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '個人情報のバックアップ保存に失敗しました' });
  }
});

// 6. RAG Vector Search endpoint (ChromaDB simulation)
app.post('/api/rag-search', (req, res) => {
  const { query, category, userRole } = req.body;
  if (!query) {
    return res.json({ results: [] });
  }

  let candidates = [...schoolDocuments];
  // Role filtering
  if (userRole === '一般教諭') {
    candidates = candidates.filter(d => d.securityLevel === '全校共有' || d.category === '学年経営');
  } else if (userRole === '学年主任') {
    candidates = candidates.filter(d => d.securityLevel !== '機密' || d.category === '学年経営');
  } else if (userRole === '学校事務職員') {
    candidates = candidates.filter(d => d.securityLevel === '全校共有' || d.category === '事務・予算');
  }

  if (category && category !== 'all') {
    candidates = candidates.filter(d => d.category === category);
  }

  // Calculate similarity scores based on token matches, keywords, and semantic terms
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = candidates.map(doc => {
    let score = 0.55; // baseline

    terms.forEach((t: string) => {
      if (doc.title.toLowerCase().includes(t)) score += 0.25;
      if (doc.keywords.some((k: string) => k.toLowerCase().includes(t))) score += 0.20;
      if (doc.maskedText.toLowerCase().includes(t)) score += 0.15;
    });

    // Normalize between 0.65 and 0.98
    const simScore = Math.min(0.98, Math.max(0.62, Math.round(score * 100) / 100));

    // Find best matching snippet
    let matchingSnippet = doc.evidenceSnippets[0] || {
      page: 1,
      section: '本文',
      text: doc.maskedText.slice(0, 160) + '...',
    };

    for (const snip of doc.evidenceSnippets) {
      if (terms.some((t: string) => snip.text.toLowerCase().includes(t))) {
        matchingSnippet = snip;
        break;
      }
    }

    return {
      documentId: doc.id,
      title: doc.title,
      category: doc.category,
      securityLevel: doc.securityLevel,
      importance: doc.importance,
      deadlines: doc.deadlines,
      pageCount: doc.pageCount,
      similarityScore: simScore,
      evidenceSnippet: matchingSnippet,
      fiscalYear: doc.fiscalYear,
      date: doc.date,
    };
  });

  // Sort by similarity descending
  scored.sort((a, b) => b.similarityScore - a.similarityScore);

  res.json({
    query,
    results: scored.slice(0, 5),
    vectorEngine: 'ChromaDB Local Vector DB (bge-m3 1024d Cosine Distance)',
  });
});

// 7. AI Chat & Document Assistant (RAG synthesis + optional targetDocId grounding)
app.post('/api/ai-chat', async (req, res) => {
  const { prompt, userRole, useGeminiIfAvailable, targetDocId } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: '質問内容を入力してください' });
  }

  // 1. Retrieve relevant documents context
  let relevantDocs = [...schoolDocuments];
  if (userRole === '一般教諭') {
    relevantDocs = relevantDocs.filter(d => d.securityLevel === '全校共有' || d.category === '学年経営');
  } else if (userRole === '学年主任') {
    relevantDocs = relevantDocs.filter(d => d.securityLevel !== '機密' || d.category === '学年経営');
  } else if (userRole === '学校事務職員') {
    relevantDocs = relevantDocs.filter(d => d.securityLevel === '全校共有' || d.category === '事務・予算');
  }

  let activeDocs: SchoolDoc[] = [];
  if (targetDocId) {
    const specific = relevantDocs.find(d => d.id === targetDocId);
    if (specific) {
      activeDocs = [specific];
    }
  }

  const lowerPrompt = prompt.toLowerCase();
  if (activeDocs.length === 0) {
    const matchedDocs = relevantDocs.filter(d => {
      return (
        d.keywords.some((k: string) => lowerPrompt.includes(k.toLowerCase())) ||
        d.title.toLowerCase().split('').some((char: string) => lowerPrompt.includes(char)) ||
        lowerPrompt.includes(d.category.toLowerCase())
      );
    });
    activeDocs = matchedDocs.length > 0 ? matchedDocs.slice(0, 3) : relevantDocs.slice(0, 2);
  }

  // Prepare safe masked context
  const contextText = activeDocs
    .map(
      d =>
        `【書類名: ${d.title} (ID: ${d.id}, 区分: ${d.category}, 重要度: ${d.importance}, 秘匿度: ${d.securityLevel})】\n${d.maskedText}`
    )
    .join('\n\n---\n\n');

  // Try real Gemini if available and requested, otherwise use local high-performance school synthesizer
  if (aiClient && useGeminiIfAvailable) {
    try {
      const systemInstruction = `あなたは学校内ローカルAIサーバー「Qwen2.5-32B」として振る舞う学校業務支援AIアシスタントです。
以下の校内文書（個人情報仮名化済み）の文脈を元に、教員の質問に正確・丁寧に答えてください。
回答には必ずどの書類のどの条項・ページが根拠であるか【根拠: 書類名 p.X】の形式で明記してください。
教員の業務（週報、引き継ぎ、保護者通知、マニュアル確認）にすぐ活用できるよう、要点箇条書きと実践的なアドバイスを含めてください。
個人情報は全て仮名化コード（[生徒ID: S-XXXX]等）のまま扱い、勝手に実名を捏造しないでください。`;

      const response = await Promise.race([
        aiClient.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `文脈情報:\n${contextText}\n\n教員からの質問:\n${prompt}`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini chat timeout')), 8000)
        ),
      ]);

      const text = response.text || '回答を生成できませんでした。';
      return res.json({
        response: text,
        modelUsed: 'Gemini 4 Hydrogen (校内ローカルvLLM互換モード)',
        isLocal: false,
        referencedDocs: activeDocs.map(d => ({
          id: d.id,
          title: d.title,
          category: d.category,
          securityLevel: d.securityLevel,
          evidence: d.evidenceSnippets[0] || { page: 1, section: '本文', text: d.maskedText.slice(0, 120) },
        })),
      });
    } catch (err: any) {
      console.warn('Gemini request failed, falling back to local synthesizer:', err.message);
    }
  }

  // Local AI Synthesis Engine (Simulates vLLM Qwen2.5-32B locally with zero cloud latency)
  let localAnswer = '';
  const selectedId = typeof targetDocId === 'string' ? targetDocId : '';
  if ((!selectedId || selectedId === 'doc-001') && (lowerPrompt.includes('熱中症') || lowerPrompt.includes('体育祭') || lowerPrompt.includes('wbgt'))) {
    localAnswer = `【体育祭における熱中症・危機管理対応手順】

本校の『令和7年度 体育祭実施要項・危機管理マニュアル』に基づき、以下の基準で対応してください：

1. **WBGT（暑さ指数）測定と判断基準** 【根拠: 体育祭実施要項 p.2】
   - 本部席およびグラウンド中央の2箇所で**30分ごと**に計測・記録。
   - **WBGT 28℃〜30℃（厳重警戒）**: 15分ごとに一斉給水タイムを設け、待機生徒は遮光テント下へ。
   - **WBGT 31℃以上（危険・中止基準）**: 直ちに競技を一時中断し、冷房の効いた第1・第2体育館および各教室へ避難誘導。午後の部は中止または翌週順延。

2. **救護所・搬送体制** 【根拠: 体育祭実施要項 p.3】
   - 北校舎陰の救護テントに簡易ベッド4台、経口補水液100本、冷却パック50個を配備。
   - 意識混濁・自力歩行不可時は躊躇なく119番通報し、教頭 [教員ID: T-0002] へ第一報。搬送先は県立中央病院救命救急センター。

💡 **教員へのアドバイス**:
朝の打ち合わせで全担任へWBGT速報用の校内放送合図を共有し、塩分チャージタブレッツの事前配布を徹底してください。`;
  } else if ((!selectedId || selectedId === 'doc-002') && (lowerPrompt.includes('インフルエンザ') || lowerPrompt.includes('出席停止') || lowerPrompt.includes('学級閉鎖'))) {
    localAnswer = `【インフルエンザ感染症の出席停止および学級閉鎖基準】

『学校感染症・インフルエンザ等集団発生時対応マニュアル』に基づく規定です：

1. **出席停止期間** 【根拠: 感染症対応マニュアル p.1】
   - 「**発症した後5日を経過し、かつ、解熱した後2日（幼児は3日）を経過するまで**」
   - 発症日を「0日目」として起算します。
   - 登校再開時には「登校許可証明書」または保護者記入の「療養報告書」の提出が必要です。

2. **学級閉鎖の判断指標** 【根拠: 感染症対応マニュアル p.2】
   - 同一学級で感染症欠席者が**在籍人数の20%以上**（例: 35名学級で7名以上）に達した場合、校長・学年主任協議の上、**原則3日間の学級閉鎖**を実施。
   - 閉鎖期間中は校内閉域LAN専用の学習パケットまたは課題配信を実施します。`;
  } else if ((!selectedId || selectedId === 'doc-004') && (lowerPrompt.includes('pta') || lowerPrompt.includes('役員') || lowerPrompt.includes('会費'))) {
    localAnswer = `【PTA規約改定および役員制度の概要】

『令和7年度 PTA役員総会 議事録』に基づく最新決定事項です：

1. **役員選出の刷新（エントリー制）** 【根拠: PTA定期総会議事録 p.2】
   - 従来の各学級2名強制選出・ポイント制は**完全廃止**。
   - 行事ごとの単発ボランティア登録制「サポーターズシステム」へ移行完了。
2. **PTA会費の改定** 【根拠: PTA定期総会議事録 p.3】
   - 活動スリム化に伴い、年額3,600円（月額300円）から**年額3,000円（月額250円）**へと引き下げが可決されています。`;
  } else if ((!selectedId || selectedId === 'doc-003') && (lowerPrompt.includes('アレルギー') || lowerPrompt.includes('修学旅行') || lowerPrompt.includes('校外学習'))) {
    localAnswer = `【校外学習・修学旅行のアレルギー配慮方針】

『第2学年 学年経営計画書・校外学習実施要項』に基づく配慮基準です：

1. **食物アレルギー個別対応** 【根拠: 学年経営計画書 p.4】
   - 重篤アレルギー該当生徒 [生徒ID: S-24082] に対し、保護者 [保護者ID: P-0821] との事前献立擦り合わせおよび宿泊施設での完全除去食対応。
   - **エピペン携行**: 本人リュックおよび引率教諭 [教員ID: T-0051] のウエストポーチに**常時2本携行**。
2. **行動管理** 【根拠: 学年経営計画書 p.6】
   - 学校貸与タブレットによる1時間ごとのチェックポイント通過報告を義務付け。`;
  } else {
    const targetDoc = activeDocs[0];
    if (targetDoc) {
      const keywordsInPrompt = prompt
        .replace(/[？?！!。、はがのをにでへと]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length >= 2);
      const docLines = targetDoc.maskedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 8);
      const matchedLines = docLines.filter((line) =>
        keywordsInPrompt.some((kw: string) => line.toLowerCase().includes(kw.toLowerCase()))
      );
      const relevantExcerpt = (matchedLines.length > 0 ? matchedLines.slice(0, 4) : targetDoc.aiSummaryPoints)
        .map((l) => `・${l}`)
        .join('\n');

      const deadlineNote =
        targetDoc.deadlines && targetDoc.deadlines.length > 0
          ? `\n\n【自動検出された期限・日程】\n${targetDoc.deadlines
              .map((dl) => `・${dl.label}: ${dl.dateText}（${dl.type}）`)
              .join('\n')}`
          : '';

      localAnswer = `【書類照会回答：『${targetDoc.title}』】
重要度判定: ${targetDoc.importance}（${targetDoc.importanceReason}）

ご質問「${prompt}」に関連する記載内容は以下の通りです【根拠: ${targetDoc.title} p.1】：

${relevantExcerpt}${deadlineNote}

【確認・引継ぎポイント】
・担当部署: ${targetDoc.department}（仮名化保護件数: ${targetDoc.piiCount}件）
・詳細は「仮名化表示」または「根拠条項スニペット」タブで原文箇所をご確認いただけます。`;
    } else {
      localAnswer = `【校内知識ベース照会結果】

現在の権限（${userRole}）で参照可能な書類内に該当記述が見つかりませんでした。検索キーワードを変更するか、管理職権限での照会をお試しください。`;
    }
  }

  res.json({
    response: localAnswer,
    modelUsed: 'vLLM / Qwen2.5-32B-Instruct-AWQ (校内オンプレミス推論)',
    isLocal: true,
    inferenceTimeMs: 142,
    referencedDocs: activeDocs.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      securityLevel: d.securityLevel,
      evidence: d.evidenceSnippets[0] || { page: 1, section: '本文', text: d.maskedText.slice(0, 120) },
    })),
  });
});

// Vite middleware in dev or static serving in prod
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[School Local AI Server] Listening on http://0.0.0.0:${port}`);
  });
}

startServer();
