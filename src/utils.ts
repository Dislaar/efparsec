import { ValidationResult, BankruptcyCase, BulkSearchResult } from './types';

/**
 * Валидация ИНН
 */
export function validateINN(inn: string): ValidationResult {
  if (!inn) {
    return { isValid: false, message: 'ИНН не может быть пустым' };
  }

  // Удаляем пробелы и приводим к верхнему регистру
  const cleanInn = inn.replace(/\s/g, '');

  // Проверяем длину
  if (cleanInn.length !== 10 && cleanInn.length !== 12) {
    return { isValid: false, message: 'ИНН должен содержать 10 или 12 цифр' };
  }

  // Проверяем, что содержит только цифры
  if (!/^\d+$/.test(cleanInn)) {
    return { isValid: false, message: 'ИНН должен содержать только цифры' };
  }

  // Проверяем контрольные суммы
  if (cleanInn.length === 10) {
    return validateINN10(cleanInn);
  } else {
    return validateINN12(cleanInn);
  }
}

/**
 * Валидация 10-значного ИНН (юридические лица)
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
    return { isValid: true, message: 'ИНН корректен (юридическое лицо)' };
  } else {
    return { isValid: false, message: 'Некорректная контрольная сумма ИНН' };
  }
}

/**
 * Валидация 12-значного ИНН (физические лица)
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
    return { isValid: true, message: 'ИНН корректен (физическое лицо)' };
  } else {
    return { isValid: false, message: 'Некорректная контрольная сумма ИНН' };
  }
}

/**
 * Форматирование даты
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    date = new Date(date);
  }
  if (isNaN(date.getTime())) {
    return 'Не указана';
  }
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Очистка текста от лишних пробелов и символов
 */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Получить CSS-класс для статуса дела
 */
export function getStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'активное':
      return 'status-active';
    case 'завершено':
      return 'status-completed';
    case 'приостановлено':
      return 'status-suspended';
    case 'прекращено':
      return 'status-terminated';
    default:
      return 'status-active';
  }
}

/**
 * Экспорт результатов в JSON
 */
export function exportToJSON(data: BankruptcyCase[] | BulkSearchResult[], filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadFile(blob, filename);
}

/**
 * Экспорт результатов в CSV
 */
export function exportToCSV(data: BankruptcyCase[], filename: string): void {
  const headers = [
    'Номер дела',
    'Должник',
    'ИНН',
    'ОГРН',
    'Статус',
    'Суд',
    'Судья',
    'Управляющий',
    'Дата открытия',
    'Сумма долга',
    'Регион',
    'Адрес',
    'Категория',
    'Последнее обновление'
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
 * Экспорт результатов массового поиска в CSV
 */
export function exportBulkResultsToCSV(data: BulkSearchResult[], filename: string): void {
  const headers = [
    'ИНН',
    'Статус банкротства',
    'Количество дел',
    'Ошибка'
  ];

  const csvContent = [
    headers.join(';'),
    ...data.map(item => [
      item.inn || '',
      item.isBankrupt ? 'БАНКРОТ' : 'Чистый',
      item.cases.length.toString(),
      item.error || ''
    ].map(field => `"${field.replace(/"/g, '""')}"`).join(';'))
  ].join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
  downloadFile(blob, filename);
}

/**
 * Скачивание файла
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
 * Дебаунс функция для оптимизации поиска
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