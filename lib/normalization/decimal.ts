export const parseDecimal = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatDecimal = (value: number, decimals = 2): string => {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals);
};
