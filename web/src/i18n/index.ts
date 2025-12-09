import polyglotI18nProvider from 'ra-i18n-polyglot';
import zhCN from './zh-CN';
import enUS from './en-US';

const translations = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// Get saved language from localStorage, fallback to default
const getDefaultLocale = () => {
  const savedLocale = localStorage.getItem('locale');
  return savedLocale && translations[savedLocale as keyof typeof translations] 
    ? savedLocale 
    : 'en-US';  // Changed default to English
};

const baseI18nProvider = polyglotI18nProvider(
  (locale) => translations[locale as keyof typeof translations] || translations['en-US'],
  getDefaultLocale(), // Use saved language or default
  [
    { locale: 'en-US', name: 'English' },
    { locale: 'zh-CN', name: '简体中文' },
  ],
  { allowMissing: true }
);

// 包装 i18nProvider 以在切换语言时保存到 localStorage
export const i18nProvider = {
  ...baseI18nProvider,
  changeLocale: (locale: string) => {
    // 保存语言设置到 localStorage
    localStorage.setItem('locale', locale);
    return baseI18nProvider.changeLocale(locale);
  },
};
