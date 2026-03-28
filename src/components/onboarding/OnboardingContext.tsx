import { createContext, useContext, type ReactNode } from 'react';
import { useOnboarding, type OnboardingState } from './useOnboarding';

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const onboarding = useOnboarding();
  return (
    <OnboardingContext.Provider value={onboarding}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingContext(): OnboardingState {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboardingContext must be used inside <OnboardingProvider>');
  return ctx;
}
