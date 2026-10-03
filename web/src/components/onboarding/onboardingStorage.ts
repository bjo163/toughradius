const STORAGE_PREFIX = 'mwx-isp:onboarding:v1';

export const getOnboardingStorageKey = (operatorId: string | number, section: string) =>
  `${STORAGE_PREFIX}:${encodeURIComponent(String(operatorId))}:${section}`;

export const readOnboardingChecks = (operatorId: string | number): string[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(getOnboardingStorageKey(operatorId, 'checks')) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const writeOnboardingChecks = (operatorId: string | number, checks: string[]) => {
  try {
    localStorage.setItem(getOnboardingStorageKey(operatorId, 'checks'), JSON.stringify(checks));
  } catch {
    // The guide remains usable when browser storage is disabled or full.
  }
};

export const readOnboardingPreference = (operatorId: string | number, section: string) => {
  try {
    return localStorage.getItem(getOnboardingStorageKey(operatorId, section)) === 'true';
  } catch {
    return false;
  }
};

export const writeOnboardingPreference = (operatorId: string | number, section: string, value: boolean) => {
  try {
    localStorage.setItem(getOnboardingStorageKey(operatorId, section), String(value));
  } catch {
    // The guide remains usable when browser storage is disabled or full.
  }
};
