import type { ComponentProps } from 'react';
import type { Popover } from '@primer/react';
import type { OnboardingStep } from './useOnboarding';

type CaretPosition = ComponentProps<typeof Popover>['caret'];

/** Step content configuration */
export const STEP_CONTENT: Record<OnboardingStep, { heading: string; body: string; caret: CaretPosition }> = {
  'add-file': {
    heading: 'Upload your reports',
    body: 'Upload one or more CSV billing reports exported from GitHub. You can add multiple files and they\'ll be combined automatically.',
    caret: 'top-right',
  },
  'view-tabs': {
    heading: 'Visualize your data',
    body: 'Toggle between interactive charts and a sortable data table. Both views update when you apply filters.',
    caret: 'top',
  },
  'group-by': {
    heading: 'Group your data',
    body: 'Change how rows are grouped in charts and the table. Try grouping by user, model, organization, or repository.',
    caret: 'top',
  },
  'filter-bar': {
    heading: 'Search and filter',
    body: 'Type to search or click a field name to add structured filters. You can stack multiple filters to narrow down the data.',
    caret: 'top',
  },
  'columns': {
    heading: 'Show or hide columns',
    body: 'Choose which columns are visible in the table to focus on what matters.',
    caret: 'top-right',
  },
};
