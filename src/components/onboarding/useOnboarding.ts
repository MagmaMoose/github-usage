import { useCallback, useMemo, useState } from 'react';
import { getStoredValue, setStoredValue } from '../../lib/local-storage';

const STORAGE_KEY = 'onboarding-dismissed';

/** Identifiers for each onboarding teaching bubble */
export const ONBOARDING_STEPS = {
  ADD_FILE: 'add-file',
  VIEW_TABS: 'view-tabs',
  GROUP_BY: 'group-by',
  FILTER_BAR: 'filter-bar',
  COLUMNS: 'columns',
} as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[keyof typeof ONBOARDING_STEPS];

/** Ordered sequence for guided walkthrough */
export const STEP_SEQUENCE: OnboardingStep[] = [
  ONBOARDING_STEPS.ADD_FILE,
  ONBOARDING_STEPS.VIEW_TABS,
  ONBOARDING_STEPS.GROUP_BY,
  ONBOARDING_STEPS.FILTER_BAR,
  ONBOARDING_STEPS.COLUMNS,
];

export interface OnboardingState {
  /** Currently visible teaching bubble (null = none shown) */
  activeStep: OnboardingStep | null;
  /** Whether a step has been dismissed */
  isDismissed: (step: OnboardingStep) => boolean;
  /** Dismiss a single step */
  dismiss: (step: OnboardingStep) => void;
  /** Dismiss current and advance to next step in the sequence */
  next: () => void;
  /** Dismiss all steps at once */
  dismissAll: () => void;
  /** Restart the guided tour from the beginning */
  restart: () => void;
  /** Whether anything in the tour is still active */
  isActive: boolean;
  /** Current step index in the sequence (0-based) */
  currentIndex: number;
  /** Total number of registered (mounted) steps */
  totalSteps: number;
  /** Ordered list of steps currently mounted in the DOM */
  registeredSequence: OnboardingStep[];
  /** Register a step as mounted in the DOM */
  registerStep: (step: OnboardingStep) => void;
  /** Unregister a step (unmounted) */
  unregisterStep: (step: OnboardingStep) => void;
}

function getDismissedSet(): Set<OnboardingStep> {
  const raw = getStoredValue<OnboardingStep[]>(STORAGE_KEY, []);
  return new Set(raw);
}

function persistDismissedSet(set: Set<OnboardingStep>): void {
  setStoredValue(STORAGE_KEY, [...set]);
}

export function useOnboarding(): OnboardingState {
  const [dismissed, setDismissed] = useState<Set<OnboardingStep>>(() => {
    // Allow ?tour=restart in URL to reset the tour
    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === 'restart') {
      persistDismissedSet(new Set());
      // Clean the URL param
      params.delete('tour');
      const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', newUrl);
      return new Set();
    }
    return getDismissedSet();
  });
  const [mounted, setMounted] = useState<Set<OnboardingStep>>(new Set());

  const registerStep = useCallback((step: OnboardingStep) => {
    setMounted((prev) => {
      if (prev.has(step)) return prev;
      const next = new Set(prev);
      next.add(step);
      return next;
    });
  }, []);

  const unregisterStep = useCallback((step: OnboardingStep) => {
    setMounted((prev) => {
      if (!prev.has(step)) return prev;
      const next = new Set(prev);
      next.delete(step);
      return next;
    });
  }, []);

  const registeredSequence = useMemo(
    () => STEP_SEQUENCE.filter((s) => mounted.has(s)),
    [mounted],
  );

  // Only consider steps that are both not dismissed AND mounted in the DOM
  const activeStep = useMemo(() => {
    for (const step of STEP_SEQUENCE) {
      if (!dismissed.has(step) && mounted.has(step)) return step;
    }
    return null;
  }, [dismissed, mounted]);

  const currentIndex = useMemo(() => {
    if (!activeStep) return registeredSequence.length;
    return registeredSequence.indexOf(activeStep);
  }, [activeStep, registeredSequence]);

  const isDismissed = useCallback(
    (step: OnboardingStep) => dismissed.has(step),
    [dismissed],
  );

  const dismiss = useCallback((step: OnboardingStep) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(step);
      persistDismissedSet(next);
      return next;
    });
  }, []);

  const next = useCallback(() => {
    if (activeStep) {
      dismiss(activeStep);
    }
  }, [activeStep, dismiss]);

  const dismissAll = useCallback(() => {
    const all = new Set(STEP_SEQUENCE);
    persistDismissedSet(all);
    setDismissed(all);
  }, []);

  const restart = useCallback(() => {
    const empty = new Set<OnboardingStep>();
    persistDismissedSet(empty);
    setDismissed(empty);
  }, []);

  return {
    activeStep,
    isDismissed,
    dismiss,
    next,
    dismissAll,
    restart,
    isActive: activeStep !== null,
    currentIndex,
    registeredSequence,
    totalSteps: registeredSequence.length,
    registerStep,
    unregisterStep,
  };
}
