import React, { useEffect, useRef, useState } from 'react';
import SignatureCanvas, { SignaturePadRef } from './components/SignaturePad';
import { prepareSignaturePayload } from './services/compressionService';

interface StartPayload {
  token?: string;
  session_id?: string;
  name?: string;
  project?: string;
  amount?: string;
  rules?: string;
  consent?: string;
}

const decodeStartPayload = (raw?: string | null): StartPayload | null => {
  if (!raw) return null;
  try {
    let normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    const binary = window.atob(normalized);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded);
  } catch (error) {
    console.warn('Failed to decode start_param payload', error);
    return null;
  }
};

// Initial State Interface
interface AppState {
  token: string;
  sessionId: string;
  displayName: string;
  projectName: string;
  amount: string;
  rulesUrl: string;
  consentText: string;
  hasSigned: boolean;
  consentChecked: boolean;
  isSubmitting: boolean;
  showRules: boolean;
}

const MAX_REQUEST_BYTES = 4096;

const App: React.FC = () => {
  const padRef = useRef<SignaturePadRef>(null);
  const tg = window.Telegram?.WebApp;

  const [state, setState] = useState<AppState>({
    token: '',
    sessionId: '',
    displayName: 'Определяется автоматически',
    projectName: 'Определяется автоматически',
    amount: '',
    rulesUrl: 'https://kadoffice.ru/sign-rules.html',
    consentText: 'Подтверждаю согласие с правилами электронного подписания.',
    hasSigned: false,
    consentChecked: false,
    isSubmitting: false,
    showRules: false,
  });

  // 1. Initialize Telegram & Parse Params
  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) {
        tg.setHeaderColor(tg.themeParams.secondary_bg_color || '#f5f7fb');
      }
      if (tg.setBackgroundColor) {
        tg.setBackgroundColor(tg.themeParams.bg_color || '#f5f7fb');
      }
    }

    const params = new URLSearchParams(window.location.search);
    const startParam = tg?.initDataUnsafe?.start_param || params.get('tgWebAppStartParam');
    const startPayload = decodeStartPayload(startParam);

    setState(prev => ({
      ...prev,
      token: startPayload?.token || params.get('token') || '',
      sessionId: startPayload?.session_id || params.get('session_id') || '',
      displayName: startPayload?.name || params.get('name') || prev.displayName,
      projectName: startPayload?.project || params.get('project') || prev.projectName,
      amount: startPayload?.amount || params.get('amount') || '',
      rulesUrl: startPayload?.rules || params.get('rules') || prev.rulesUrl,
      consentText: startPayload?.consent || params.get('consent') || prev.consentText,
    }));
  }, [tg]);

  // 2. Interaction Handlers
  const handleClear = () => {
    padRef.current?.clear();
    setState(prev => ({ ...prev, hasSigned: false }));
  };

  const handleStrokeEnd = () => {
    const isEmpty = padRef.current?.isEmpty() ?? true;
    setState(prev => ({ ...prev, hasSigned: !isEmpty }));
  };

  const handleOpenRules = (e: React.MouseEvent) => {
    e.preventDefault();
    setState(prev => ({ ...prev, showRules: true }));
  };

  const handleCloseRules = () => {
    setState(prev => ({ ...prev, showRules: false }));
  };

  const safeShowPopup = (title: string, message: string) => {
    if (tg && tg.showPopup && parseFloat(tg.version) >= 6.1) {
      tg.showPopup({ title, message });
    } else {
      alert(`${title}: ${message}`);
    }
  };

  const handleSubmit = () => {
    if (!state.consentChecked) {
      safeShowPopup("Требуется подтверждение", "Пожалуйста, поставьте галочку согласия с правилами.");
      return;
    }
    if (!state.hasSigned) {
      safeShowPopup("Подпись отсутствует", "Пожалуйста, распишитесь в поле для подписи.");
      return;
    }
    
    setState(prev => ({ ...prev, isSubmitting: true }));

    const rawData = padRef.current?.toData();
    const canvasMeta = padRef.current?.getCanvasMeta();

    if (!rawData || !canvasMeta) {
      setState(prev => ({ ...prev, isSubmitting: false }));
      return;
    }

    const encoder = new TextEncoder();
    const basePayload = {
      token: state.token,
      session_id: state.sessionId,
      client_info: {
        display_name: state.displayName,
        project: state.projectName,
      },
    };

    const baseBytes = encoder.encode(JSON.stringify(basePayload)).length;
    let availableSignatureChars = Math.max(256, MAX_REQUEST_BYTES - baseBytes);

    let signaturePayload = prepareSignaturePayload(
      rawData,
      canvasMeta.width,
      canvasMeta.height,
      availableSignatureChars
    );
    if (!signaturePayload) {
      safeShowPopup(
        'Подпись слишком сложная',
        'Не удалось упаковать подпись в лимит 4 КБ. Попробуйте расписаться чуть проще.'
      );
      setState(prev => ({ ...prev, isSubmitting: false }));
      return;
    }

    const assemblePayload = () => ({
      ...basePayload,
      ...(signaturePayload!.type === 'compressed'
        ? {
            signature_compressed: signaturePayload!.base64,
            compression: signaturePayload!.compression,
          }
        : { signature_binary: signaturePayload!.base64 }),
    });

    let payload = assemblePayload();
    let payloadBytes = encoder.encode(JSON.stringify(payload)).length;

    if (payloadBytes > MAX_REQUEST_BYTES) {
      const ratio = payloadBytes / MAX_REQUEST_BYTES;
      const adjustedLimit = Math.max(
        200,
        Math.floor(availableSignatureChars / ratio)
      );
      signaturePayload = prepareSignaturePayload(
        rawData,
        canvasMeta.width,
        canvasMeta.height,
        adjustedLimit
      );
      if (!signaturePayload) {
        safeShowPopup(
          'Подпись слишком сложная',
          'Не удалось упаковать подпись в лимит 4 КБ. Попробуйте расписаться чуть проще.'
        );
        setState(prev => ({ ...prev, isSubmitting: false }));
        return;
      }
      payload = assemblePayload();
      payloadBytes = encoder.encode(JSON.stringify(payload)).length;
      if (payloadBytes > MAX_REQUEST_BYTES) {
        safeShowPopup(
          'Подпись слишком сложная',
          'Не удалось отправить подпись: даже после сжатия размер превышает лимит Telegram.'
        );
        setState(prev => ({ ...prev, isSubmitting: false }));
        return;
      }
    }

    try {
        if (tg) {
            tg.sendData(JSON.stringify(payload));
            // Optional: Telegram usually closes the webapp on sendData, but we can show a UI feedback
            // The original script closed it manually after a timeout.
            setTimeout(() => tg.close(), 500); 
        } else {
            console.log("Debug Payload:", payload);
            safeShowPopup("Режим отладки", "Данные выведены в консоль (Telegram WebApp не обнаружен).");
            setState(prev => ({ ...prev, isSubmitting: false }));
        }
    } catch (e) {
        console.error(e);
        safeShowPopup("Ошибка", "Не удалось отправить данные. Попробуйте снова.");
        setState(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const canSubmit = state.hasSigned && state.consentChecked && !state.isSubmitting;

  return (
    <div className="min-h-screen w-full bg-[#f5f7fb] dark:bg-[#0f1115] text-[#1d1d1f] dark:text-[#f5f7fb] font-sans pb-8 pt-[env(safe-area-inset-top)] px-4 transition-colors duration-200 relative">
      
      {/* Rules Modal Overlay */}
      {state.showRules && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1c1f26] w-full max-w-lg max-h-[90vh] h-[85vh] sm:h-auto sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold">Правила подписания</h2>
              <button 
                onClick={handleCloseRules}
                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:opacity-70 transition-opacity"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm leading-relaxed text-gray-700 dark:text-gray-300 space-y-4">
              <p>
                Настоящее Соглашение регулирует порядок использования <strong>простой электронной подписи (ПЭП)</strong> при оформлении документов в электронном виде в соответствии со статьями 5 и 6 Федерального закона от 06.04.2011 № 63-ФЗ «Об электронной подписи».
              </p>
              
              <h3 className="font-bold text-black dark:text-white mt-4">1. Определение ПЭП</h3>
              <p>
                Простой электронной подписью является электронная подпись, которая посредством использования кодов, паролей или иных средств подтверждает факт формирования электронной подписи определенным лицом. В рамках данного приложения ПЭП формируется путем:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Авторизации пользователя в приложении Telegram (подтверждение личности через учетную запись).</li>
                  <li>Графического начертания подписи на экране устройства.</li>
                </ul>
              </p>

              <h3 className="font-bold text-black dark:text-white mt-4">2. Юридическая сила</h3>
              <p>
                Стороны признают, что документы, подписанные простой электронной подписью в настоящем сервисе, признаются равнозначными документам на бумажном носителе, подписанным собственноручной подписью, и порождают для Сторон аналогичные юридические последствия.
              </p>

              <h3 className="font-bold text-black dark:text-white mt-4">3. Обязательства сторон</h3>
              <p>
                Пользователь обязуется:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Соблюдать конфиденциальность доступа к своему устройству и учетной записи Telegram.</li>
                  <li>Не передавать третьим лицам доступ к интерфейсу подписания.</li>
                  <li>Признавать действия, совершенные с использованием его учетной записи, как свои собственные.</li>
                </ul>
              </p>
            </div>
            <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-[#15171c] sm:rounded-b-2xl">
              <button 
                onClick={handleCloseRules}
                className="w-full py-3 rounded-xl font-semibold bg-[#1f5aa6] text-white shadow-lg shadow-blue-900/20 active:scale-98 transition-transform"
              >
                Я ознакомился
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto flex flex-col gap-4 mt-4">
        
        {/* Project Info Card */}
        <section className="bg-white dark:bg-[#1c1f26] p-4 rounded-2xl shadow-[0_12px_30px_rgba(0,10,60,0.08)] dark:shadow-none border border-transparent dark:border-gray-800">
          <h1 className="text-2xl font-semibold mb-1">Подписание договора</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Проверьте данные проекта, затем нарисуйте подпись синей ручкой.
          </p>
          
          <div className="space-y-2 text-[15px]">
            <div className="flex items-start gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Проект:</span>
              <span className="font-medium">{state.projectName}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500 dark:text-gray-400 shrink-0">Заказчик:</span>
              <span className="font-medium">{state.displayName}</span>
            </div>
            {state.amount && (
              <div className="flex items-start gap-2">
                 <span className="text-gray-500 dark:text-gray-400 shrink-0">Стоимость:</span>
                 <span className="font-medium text-blue-600 dark:text-blue-400">{state.amount}</span>
              </div>
            )}
          </div>
        </section>

        {/* Signature Area */}
        <section className="bg-white dark:bg-[#1c1f26] p-4 rounded-2xl shadow-[0_12px_30px_rgba(0,10,60,0.08)] dark:shadow-none border border-transparent dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Нарисуйте подпись</p>
          
          <SignatureCanvas 
            ref={padRef} 
            onEnd={handleStrokeEnd} 
            penColor="#1F5AA6"
          />

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={handleClear}
              className="flex-1 h-12 rounded-xl font-semibold text-[15px] bg-indigo-50 text-[#1f5aa6] hover:bg-indigo-100 dark:bg-[#273e63] dark:text-indigo-200 transition active:scale-95"
            >
              Очистить
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`flex-1 h-12 rounded-xl font-semibold text-[15px] text-white transition-all active:scale-95
                ${canSubmit 
                  ? 'bg-[#1f5aa6] shadow-lg shadow-indigo-500/30 hover:bg-blue-700' 
                  : 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed opacity-70'}`}
            >
              {state.isSubmitting ? 'Отправка...' : 'Отправить'}
            </button>
          </div>

          {/* Consent Box */}
          <div className="mt-4 p-3 rounded-xl border-2 border-indigo-100 dark:border-[#3a4b6d] bg-indigo-50/50 dark:bg-[#273e63]/20">
            <label className="flex items-start gap-3 cursor-pointer">
              <input 
                type="checkbox"
                checked={state.consentChecked}
                onChange={(e) => setState(prev => ({ ...prev, consentChecked: e.target.checked }))}
                className="mt-1 w-5 h-5 rounded border-gray-300 text-[#1f5aa6] focus:ring-[#1f5aa6] accent-[#1f5aa6]"
              />
              <div className="text-sm leading-relaxed">
                <span className="block font-medium text-gray-900 dark:text-gray-200 mb-0.5">
                  {state.consentText}
                </span>
                <a 
                  href="#" 
                  onClick={handleOpenRules}
                  className="text-[#1f5aa6] dark:text-blue-400 underline decoration-1 underline-offset-2 hover:opacity-80"
                >
                  Ознакомиться с правилами
                </a>
              </div>
            </label>
          </div>
        </section>

      </div>
    </div>
  );
};

export default App;
