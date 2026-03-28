import type { ComponentProps } from 'react';
import type { Popover } from '@primer/react';
import type { OnboardingStep } from './useOnboarding';

type CaretPosition = ComponentProps<typeof Popover>['caret'];

/** Step content configuration */
export const STEP_CONTENT: Record<OnboardingStep, { heading: string; body: string; caret: CaretPosition }> = {
  'add-file': {
    heading: 'Add files',
    body: 'Drop multiple CSVs. Same-type reports auto-combine.',
    caret: 'top-right',
  },
  'view-tabs': {
    heading: 'Charts or table',
    body: 'Switch between interactive charts and a sortable data table. Both respect your current filters.',
    caret: 'top',
  },
  'group-by': {
    heading: 'Group data',
    body: 'Change how rows are grouped in charts and the table. Try grouping by model, organization, or repository.',
    caret: 'top',
  },
  'filter-bar': {
    heading: 'Search & filter',
    body: 'Type to search rows or add structured filters by user, model, SKU, or repository. Stack multiple filters to drill down.',
    caret: 'top',
  },
  'columns': {
    heading: 'Customize columns',
    body: 'Show or hide columns to focus on your data.',
    caret: 'top-right',
  },
};
