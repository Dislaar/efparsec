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
  publicationDate?: string;
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
  publicationDate?: string; // Добавлено как опциональное
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
