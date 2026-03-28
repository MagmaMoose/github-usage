import { useEffect, type ReactNode, type ComponentProps } from 'react';
import type { Popover } from '@primer/react';
import { TeachingBubble } from './TeachingBubble';
import { useOnboardingContext } from './OnboardingContext';
import type { OnboardingStep } from './useOnboarding';
import { STEP_CONTENT } from './step-content';

type CaretPosition = ComponentProps<typeof Popover>['caret'];

interface OnboardingBubbleProps {
  /** Which step this bubble represents */
  step: OnboardingStep;
  /** The control being highlighted */
  children: ReactNode;
  /** Override caret position */
  caret?: CaretPosition;
  /** Shift popover left for right-edge controls */
  alignRight?: boolean;
  /** Extra className on the wrapper */
  className?: string;
}

/**
 * Drop-in wrapper that shows a teaching bubble for a specific onboarding step.
 * Automatically reads from OnboardingContext, so just wrap your control and go.
 * Registers itself on mount so the hook knows which steps are available.
 */
export function OnboardingBubble({ step, children, caret, alignRight, className }: OnboardingBubbleProps) {
  const { activeStep, next, dismissAll, currentIndex, totalSteps, registeredSequence, registerStep, unregisterStep } = useOnboardingContext();

  // Register this step as mounted so the hook knows it's available
  useEffect(() => {
    registerStep(step);
    return () => unregisterStep(step);
  }, [step, registerStep, unregisterStep]);

  const content = STEP_CONTENT[step];
  const isActive = activeStep === step;
  const stepNumber = registeredSequence.indexOf(step) + 1;

  return (
    <TeachingBubble
      open={isActive}
      heading={content.heading}
      body={content.body}
      caret={caret ?? content.caret}
      alignRight={alignRight}
      stepLabel={`${stepNumber} of ${totalSteps}`}
      onDismiss={next}
      onNext={currentIndex < totalSteps - 1 ? next : undefined}
      onSkipAll={dismissAll}
      className={className}
    >
      {children}
    </TeachingBubble>
  );
}
