import polyglotI18nProvider from 'ra-i18n-polyglot';
import enUS from './en-US';

const translations = {
  'en-US': enUS,
};

const getDefaultLocale = () => {
  const savedLocale = localStorage.getItem('locale');
  if (savedLocale !== 'en-US') {
    localStorage.setItem('locale', 'en-US');
  }
  return 'en-US';
};

const baseI18nProvider = polyglotI18nProvider(
  (locale) => translations[locale as keyof typeof translations] || translations['en-US'],
  getDefaultLocale(),
  [{ locale: 'en-US', name: 'English' }],
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
