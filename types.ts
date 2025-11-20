// Global Window interface for Telegram
declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: any;
  version: string;
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  ready: () => void;
  expand: () => void;
  close: () => void;
  showPopup: (params: { title?: string; message: string; buttons?: any[] }, callback?: (id: string) => void) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  sendData: (data: string) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    showProgress: (leaveActive: boolean) => void;
    hideProgress: () => void;
  };
}

export interface SignaturePayload {
  base64: string;
  type: 'compressed' | 'binary';
  compression?: string;
}

export interface CanvasMeta {
  width: number;
  height: number;
  ratio: number;
  pen_width: number;
}

export interface Point {
  x: number;
  y: number;
  time: number;
}

export interface SignatureSegment {
  points: Point[];
  color: string;
}
