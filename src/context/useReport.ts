import { useContext } from 'react';
import { ReportContext } from './report-context';
import type { ReportContextValue } from './report-context';

export function useReport(): ReportContextValue {
  const ctx = useContext(ReportContext);

  if (!ctx) {
    throw new Error('useReport must be used within a ReportProvider');
  }

  return ctx;
}
