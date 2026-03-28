import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import { Button, Heading, Popover, Text } from '@primer/react';
import styles from './TeachingBubble.module.css';

type CaretPosition = ComponentProps<typeof Popover>['caret'];

interface TeachingBubbleProps {
  /** Visible when true */
  open: boolean;
  /** Popover caret direction (points toward the target control) */
  caret?: CaretPosition;
  /** Bold heading */
  heading: string;
  /** Body text explaining the feature */
  body: string;
  /** "Step 3 of 8" style progress */
  stepLabel?: string;
  /** Callback for the primary dismiss / "Got it" action */
  onDismiss: () => void;
  /** Callback for "Next" in a guided tour */
  onNext?: () => void;
  /** Callback to skip the entire tour */
  onSkipAll?: () => void;
  /** Shift popover left for right-edge controls */
  alignRight?: boolean;
  /** Wrapped content that the bubble points to */
  children: ReactNode;
  /** Extra className on the wrapper */
  className?: string;
}

export function TeachingBubble({
  open,
  caret = 'top',
  heading,
  body,
  stepLabel,
  onDismiss,
  onNext,
  onSkipAll,
  children,
  alignRight,
  className,
}: TeachingBubbleProps) {
  // Delay enabling click-outside to prevent instant cascade dismissal on mount
  const [clickOutsideReady, setClickOutsideReady] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when closing
      setClickOutsideReady(false);
      return;
    }
    const timer = setTimeout(() => setClickOutsideReady(true), 300);
    return () => clearTimeout(timer);
  }, [open]);

  // Manual click-outside handling with delay guard
  useEffect(() => {
    if (!open || !clickOutsideReady) return;

    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onDismiss();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, clickOutsideReady, onDismiss]);

  if (!open) {
    return <>{children}</>;
  }

  return (
    <div ref={popoverRef} className={`${styles.teachingBubbleWrapper} ${className ?? ''}`}>
      {children}
      <Popover open caret={caret} className={`${styles.teachingBubble} ${alignRight ? styles.teachingBubbleShiftLeft : ''}`}>
        <Popover.Content
          width="small"
          style={{
            marginTop: caret?.startsWith('top') ? 'var(--base-size-8)' : undefined,
            marginBottom: caret?.startsWith('bottom') ? 'var(--base-size-8)' : undefined,
          }}
        >
          <div className={styles.teachingBubbleContent}>
            <Heading as="h4" className={styles.teachingBubbleHeading}>
              {heading}
            </Heading>
            <Text as="p" className={styles.teachingBubbleBody}>
              {body}
            </Text>
            <div className={styles.teachingBubbleFooter}>
              <span className={styles.teachingBubbleProgress}>
                {stepLabel}
              </span>
              <span className={styles.teachingBubbleActions}>
                {onSkipAll && (
                  <Button size="small" variant="invisible" onClick={onSkipAll}>
                    Skip tour
                  </Button>
                )}
                <Button
                  size="small"
                  variant="primary"
                  onClick={onNext ?? onDismiss}
                >
                  {onNext ? 'Next' : 'Got it'}
                </Button>
              </span>
            </div>
          </div>
        </Popover.Content>
      </Popover>
    </div>
  );
}
