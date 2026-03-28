import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FunctionComponent, PropsWithChildren } from 'react';
import {
  ActionList,
  ActionMenu,
  IconButton,
  Token,
} from '@primer/react';
import type { IconProps } from '@primer/octicons-react';
import {
  SearchIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { humanizeColumn, formatDisplayValue } from '../lib/formatters';
import { OnboardingBubble, ONBOARDING_STEPS } from './onboarding';
import styles from './FilterBar.module.css';

type FilterableField = string;

interface ActiveFilter {
  field: FilterableField;
  value: string;
}

interface FilterBarProps {
  /** Fields available for filtering */
  availableFields: FilterableField[];
  /** Map of field → sorted unique values */
  valuesByField: Map<FilterableField, string[]>;
  /** Currently active filters as Record<field, values[]> */
  filters: Record<string, string[]>;
  /** Search query for free-text search */
  searchQuery: string;
  /** Icon map for each field */
  fieldIcons: Record<string, FunctionComponent<PropsWithChildren<IconProps>>>;
  /** Current group-by column */
  groupByColumn: string;
  /** Available columns to group by */
  groupableColumns: string[];
  /** Callbacks */
  onAddFilter: (field: FilterableField, value: string) => void;
  onRemoveFilter: (field: FilterableField, value: string) => void;
  onClearAll: () => void;
  onSearchChange: (query: string) => void;
  onGroupByChange: (column: string) => void;
}

export function FilterBar({
  availableFields,
  valuesByField,
  filters,
  searchQuery,
  fieldIcons,
  groupByColumn,
  groupableColumns,
  onAddFilter,
  onRemoveFilter,
  onClearAll,
  onSearchChange,
  onGroupByChange,
}: FilterBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<FilterableField | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const activeFilters = useMemo<ActiveFilter[]>(
    () =>
      Object.entries(filters).flatMap(([field, values]) =>
        values.map((value) => ({ field, value })),
      ),
    [filters],
  );


  // Close overlay on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOverlayOpen(false);
        setSelectedCategory(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Build suggestion items based on current state
  const suggestions = useMemo(() => {
    // Reset highlight whenever suggestions recompute
    queueMicrotask(() => setHighlightIndex(0));

    if (selectedCategory) {
      const fieldValues = valuesByField.get(selectedCategory) ?? [];
      const appliedValues = new Set(filters[selectedCategory] ?? []);
      // Typing '!' prefix means the user wants to exclude
      const negateMode = inputValue.startsWith('!');
      const query = (negateMode ? inputValue.slice(1) : inputValue).toLowerCase();

      return fieldValues
        .filter((v) => !appliedValues.has(v) && !appliedValues.has(`!${v}`))
        .filter((v) => !query || v.toLowerCase().includes(query) || formatDisplayValue(v, selectedCategory).toLowerCase().includes(query))
        .slice(0, 20)
        .map((value) => ({
          id: `${selectedCategory}:${negateMode ? '!' : ''}${value}`,
          type: 'value' as const,
          field: selectedCategory,
          value: negateMode ? `!${value}` : value,
          text: `${negateMode ? '≠ ' : ''}${formatDisplayValue(value, selectedCategory)}`,
          icon: fieldIcons[selectedCategory],
        }));
    }

    const query = inputValue.toLowerCase();

    if (!query) {
      return availableFields.map((field) => ({
        id: `field:${field}`,
        type: 'field' as const,
        field,
        value: '',
        text: humanizeColumn(field),
        icon: fieldIcons[field],
      }));
    }

    // Hybrid mode: field matches + value matches
    const fieldMatches = availableFields
      .filter(
        (f) =>
          f.toLowerCase().includes(query) ||
          humanizeColumn(f).toLowerCase().includes(query),
      )
      .slice(0, 5)
      .map((field) => ({
        id: `field:${field}`,
        type: 'field' as const,
        field,
        value: '',
        text: humanizeColumn(field),
        icon: fieldIcons[field],
      }));

    const valueMatches = availableFields.flatMap((field) => {
      const appliedValues = new Set(filters[field] ?? []);
      return (valuesByField.get(field) ?? [])
        .filter((v) => !appliedValues.has(v))
        .filter((v) => v.toLowerCase().includes(query) || formatDisplayValue(v, field).toLowerCase().includes(query))
        .slice(0, 3)
        .map((value) => ({
          id: `${field}:${value}`,
          type: 'value' as const,
          field,
          value,
          text: `${humanizeColumn(field)}: ${formatDisplayValue(value, field)}`,
          icon: fieldIcons[field],
        }));
    });

    return [...fieldMatches, ...valueMatches].slice(0, 10);
  }, [availableFields, filters, inputValue, selectedCategory, valuesByField, fieldIcons]);

  const handleSelectField = useCallback((field: FilterableField) => {
    setSelectedCategory(field);
    setInputValue('');
    setHighlightIndex(0);
    inputRef.current?.focus();
  }, []);

  const handleSelectValue = useCallback(
    (field: FilterableField, value: string) => {
      onAddFilter(field, value);
      setInputValue('');
      setSelectedCategory(null);
      setHighlightIndex(0);
      inputRef.current?.focus();
    },
    [onAddFilter],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      setOverlayOpen(true);

      // If not in category mode, update search query for free-text filtering
      if (!selectedCategory && !val.includes(':')) {
        onSearchChange(val);
      } else {
        onSearchChange('');
      }
    },
    [onSearchChange, selectedCategory],
  );

  const handleFocus = useCallback(() => {
    setOverlayOpen(true);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        const selected = suggestions[highlightIndex];
        if (!selected) return;

        if (selected.type === 'field') {
          handleSelectField(selected.field);
        } else {
          handleSelectValue(selected.field, selected.value);
        }
      } else if (e.key === 'Escape') {
        setOverlayOpen(false);
        setSelectedCategory(null);
        inputRef.current?.blur();
      } else if (
        e.key === 'Backspace' &&
        inputValue === '' &&
        !selectedCategory
      ) {
        // Remove last token
        const lastFilter = activeFilters[activeFilters.length - 1];
        if (lastFilter) {
          onRemoveFilter(lastFilter.field, lastFilter.value);
        }
      } else if (e.key === 'Backspace' && inputValue === '' && selectedCategory) {
        // Exit category mode
        setSelectedCategory(null);
      }
    },
    [
      suggestions,
      highlightIndex,
      handleSelectField,
      handleSelectValue,
      inputValue,
      selectedCategory,
      activeFilters,
      onRemoveFilter,
    ],
  );

  const handleClear = useCallback(() => {
    onClearAll();
    setInputValue('');
    setSelectedCategory(null);
    setOverlayOpen(false);
    onSearchChange('');
  }, [onClearAll, onSearchChange]);

  const hasFilters = activeFilters.length > 0 || searchQuery.trim().length > 0;

  return (
    <div className={styles.filterBar} ref={containerRef}>
      <div className={styles.filterBarInner}>
        {/* Group by dropdown */}
        <OnboardingBubble step={ONBOARDING_STEPS.GROUP_BY}>
          <ActionMenu>
          <ActionMenu.Button
            size="medium"
            className={styles.filterButton}
          >
            {groupByColumn ? humanizeColumn(groupByColumn) : 'Group by'}
          </ActionMenu.Button>
          <ActionMenu.Overlay width="auto" side="outside-bottom" align="start">
            <ActionList selectionVariant="single">
              {groupableColumns.map((col) => {
                const Icon = fieldIcons[col];
                return (
                  <ActionList.Item
                    key={col}
                    selected={col === groupByColumn}
                    onSelect={() => onGroupByChange(col)}
                  >
                    {Icon && <ActionList.LeadingVisual><Icon /></ActionList.LeadingVisual>}
                    {humanizeColumn(col)}
                  </ActionList.Item>
                );
              })}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
        </OnboardingBubble>

        {/* Input area with inline tokens */}
        <div className={styles.inputWrapper}>
        <div className={styles.inputArea} onClick={() => inputRef.current?.focus()}>
          <SearchIcon size={16} className={styles.searchIcon} />

          {/* Inline tokens for active filters */}
          {activeFilters.map(({ field, value }) => {
            const isNegated = value.startsWith('!');
            const rawValue = isNegated ? value.slice(1) : value;
            const label = `${humanizeColumn(field)}:${isNegated ? '≠ ' : ''}${formatDisplayValue(rawValue, field)}`;
            return (
              <Token
                key={`${field}:${value}`}
                text={label}
                size="medium"
                onRemove={() => onRemoveFilter(field, value)}
                className={`${styles.inlineToken}${isNegated ? ` ${styles.negatedToken}` : ''}`}
              />
            );
          })}

          {/* Category prefix badge */}
          {selectedCategory && (
            <span className={styles.categoryPrefix}>
              {humanizeColumn(selectedCategory)}:
            </span>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            className={styles.filterInput}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={activeFilters.length > 0 || selectedCategory ? '' : 'Search or filter'}
            aria-label="Search or filter report rows"
            aria-controls="filter-suggestions"
            aria-expanded={overlayOpen}
            role="combobox"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Clear button */}
          {hasFilters && (
            <IconButton
              aria-label="Clear filter"
              icon={XCircleIcon}
              variant="invisible"
              size="small"
              onClick={handleClear}
              className={styles.clearButton}
            />
          )}
        </div>

        {/* Suggestions overlay */}
        {overlayOpen && suggestions.length > 0 && (
          <div className={styles.suggestionsOverlay} ref={overlayRef} id="filter-suggestions">
            <ActionList role="listbox" aria-label="Suggestions">
              {suggestions.map((item, index) => {
                const Icon = item.icon;
                return (
                  <ActionList.Item
                    key={item.id}
                    role="option"
                    active={index === highlightIndex}
                    onSelect={() => {
                      if (item.type === 'field') {
                        handleSelectField(item.field);
                      } else {
                        handleSelectValue(item.field, item.value);
                      }
                    }}
                  >
                    {Icon && (
                      <ActionList.LeadingVisual>
                        <Icon />
                      </ActionList.LeadingVisual>
                    )}
                    {item.text}
                  </ActionList.Item>
                );
              })}
            </ActionList>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
