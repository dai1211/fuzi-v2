import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceSearchButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export const VoiceSearchButton: React.FC<VoiceSearchButtonProps> = ({
  onTranscript,
  className = '',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const showTempNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const toggleListening = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showTempNotice('このブラウザは音声認識(Web Speech API)に対応していません');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => {
        setIsListening(true);
        setNotice(null);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          onTranscript(transcript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          showTempNotice('マイクの使用が許可されていません');
        } else if (event.error === 'no-speech') {
          showTempNotice('音声が検出されませんでした');
        } else {
          showTempNotice('音声入力を終了しました');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      showTempNotice('音声認識を開始できませんでした');
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={toggleListening}
        title={isListening ? '音声認識を停止' : '音声で検索（日本語音声入力）'}
        aria-label={isListening ? '音声認識を停止' : '音声検索を開始'}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
          isListening
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 hover:border-slate-300'
        }`}
      >
        {isListening ? (
          <>
            <MicOff className="w-3.5 h-3.5 shrink-0" />
            <span>認識中...</span>
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="hidden sm:inline">音声入力</span>
          </>
        )}
      </button>

      {notice && (
        <div className="absolute right-0 top-full mt-1.5 z-30 bg-slate-900 text-white text-[11px] px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap">
          {notice}
        </div>
      )}
    </div>
  );
};
