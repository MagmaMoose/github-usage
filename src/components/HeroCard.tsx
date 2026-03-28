import styles from '../App.module.css';

/** Hero card — mimics @github-ui/data-card DataCard */
export function HeroCard({
  title,
  value,
  description,
  children,
}: {
  title: string;
  value: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.heroCard}>
      <div className={styles.heroCardInner}>
        <h2 className={styles.heroCardTitle}>{title}</h2>
        <div className={styles.heroCardValue}>{value}</div>
        {description && <p className={styles.heroCardDescription}>{description}</p>}
        {children}
      </div>
    </div>
  );
}
