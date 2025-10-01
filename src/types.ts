// Типы данных для парсера ЕФРСБ

export interface BankruptcyCase {
  caseNumber: string;
  debtorName: string;
  inn?: string;
  ogrn?: string;
  status: string;
  court: string;
  judge?: string;
  manager?: string;
  openDate?: string;
  debtAmount?: string;
  region?: string;
  address?: string;
  category?: string;
  lastUpdate?: string;
}

export interface SearchParams {
  type: 'debtor' | 'caseNumber' | 'inn' | 'bulkInn';
  query?: string;
  innList?: string[];
  region?: string;
}

export interface ParseResult {
  success: boolean;
  data: BankruptcyCase[];
  error?: string;
  totalFound?: number;
}

export interface BulkSearchResult {
  inn: string;
  isBankrupt: boolean;
  cases: BankruptcyCase[];
  error?: string;
}

export interface BulkParseResult {
  success: boolean;
  results: BulkSearchResult[];
  totalProcessed: number;
  error?: string;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
}

// Константы для статусов дел
export const CASE_STATUSES = {
  ACTIVE: 'Активное',
  COMPLETED: 'Завершено',
  SUSPENDED: 'Приостановлено',
  TERMINATED: 'Прекращено'
} as const;

// Типы поиска
export const SEARCH_TYPES = {
  DEBTOR: 'debtor',
  CASE_NUMBER: 'caseNumber',
  INN: 'inn'
} as const;