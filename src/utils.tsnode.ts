import { ValidationResult, BankruptcyCase, BulkSearchResult } from './types2.ts';

/**
 * Validate INN
 */
export function validateINN(inn: string): ValidationResult {
  if (!inn) {
    return { isValid: false, message: 'INN cannot be empty' };
  }

  // Remove spaces and convert to uppercase
  const cleanInn = inn.replace(/\s/g, '');

  // Checking the length
  if (cleanInn.length !== 10 && cleanInn.length !== 12) {
    return { isValid: false, message: 'The INN must contain 10 or 12 digits.' };
  }

  // We check that it contains only numbers.
  if (!/^\d+$/.test(cleanInn)) {
    return { isValid: false, message: 'The INN must contain only numbers.' };
  }

  // Checking the checksums
  if (cleanInn.length === 10) {
    return validateINN10(cleanInn);
  } else {
    return validateINN12(cleanInn);
  }
}

/**
 * Validation of a 10-digit INN (for legal entities)
 */
function validateINN10(inn: string): ValidationResult {
  const coefficients = [2, 4, 10, 3, 5, 9, 4, 6, 8];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(inn[i]) * coefficients[i];
  }

  const checkDigit = (sum % 11) % 10;
  const lastDigit = parseInt(inn[9]);

  if (checkDigit === lastDigit) {
    return { isValid: true, message: 'The INN is correct (legal entity)' };
  } else {
    return { isValid: false, message: 'Incorrect INN checksum' };
  }
}

/**
 * Validation of a 12-digit INN (for individuals)
 */
function validateINN12(inn: string): ValidationResult {
  const coefficients1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  const coefficients2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

  let sum1 = 0;
  let sum2 = 0;

  for (let i = 0; i < 10; i++) {
    sum1 += parseInt(inn[i]) * coefficients1[i];
  }

  for (let i = 0; i < 11; i++) {
    sum2 += parseInt(inn[i]) * coefficients2[i];
  }

  const checkDigit1 = (sum1 % 11) % 10;
  const checkDigit2 = (sum2 % 11) % 10;
  const lastDigit1 = parseInt(inn[10]);
  const lastDigit2 = parseInt(inn[11]);

  if (checkDigit1 === lastDigit1 && checkDigit2 === lastDigit2) {
    return { isValid: true, message: 'The INN is correct (for an individual)' };
  } else {
    return { isValid: false, message: 'Incorrect INN checksum' };
  }
}

/**
 * Date formatting
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  if (isNaN(date.getTime())) {
    return 'Not specified';
  }
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Removing extra spaces and characters from the text
 */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Get a CSS class for the case status
 */
export function getStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'active':
      return 'status-active';
    case 'completed':
      return 'status-completed';
    case 'suspended':
      return 'status-suspended';
    case 'discontinued':
      return 'status-terminated';
    default:
      return 'status-active';
  }
}

/**
 * Exporting results to JSON
 */
export function exportToJSON(data: BankruptcyCase[] | BulkSearchResult[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, filename);
}

/**
 * Exporting results to CSV
 */
export function exportToCSV(data: BankruptcyCase[], filename: string): void {
  const headers = [
    'Case number',
    'The debtor',
    'INN',
    'OGRN',
    'Status',
    'Court',
    'Judge',
    'Manager',
    'Opening date',
    'Amount of debt',
    'Region',
    'Address',
    'Category',
    'Last update'
  ];

  const csvContent = [
    headers.join(';'),
    ...data.map(item => [
      item.caseNumber || '',
      item.debtorName || '',
      item.inn || '',
      item.ogrn || '',
      item.status || '',
      item.court || '',
      item.judge || '',
      item.manager || '',
      item.openDate || '',
      item.debtAmount || '',
      item.region || '',
      item.address || '',
      item.category || '',
      item.lastUpdate || ''
    ].map(field => `"${field.replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadFile(blob, filename);
}

/**
 * Exporting mass search results to CSV
 */
export function exportBulkResultsToCSV(data: BulkSearchResult[], filename: string): void {
  const headers = [
    'INN',
    'Bankruptcy status',
    'Number of cases',
    'error'
  ];

  const csvContent = [
    headers.join(';'),
    ...data.map(item => [
      item.inn || '',
      item.isBankrupt ? 'BANKRUPT' : 'Clean',
      item.cases.length.toString(),
      item.error || ''
    ].map(field => `"${field.replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadFile(blob, filename);
}

/**
 * Downloading a file
 */
function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Debounce function for search optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}