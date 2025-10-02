import './style.css';
import { SearchParams, BankruptcyCase, BulkSearchResult, BulkParseResult } from './types2.js';
import { validateINN, exportToJSON, exportToCSV, exportBulkResultsToCSV, getStatusClass, debounce } from './utils.js';

class EFRSBApp {
  private currentResults: BankruptcyCase[] = [];
  private currentBulkResults: BulkSearchResult[] = [];
  private ws: WebSocket | null = null;

  constructor() {
    this.initializeApp();
  }

 private initializeApp(): void {
  this.setupEventListeners();
  this.setupValidation();
  console.log('Парсер ЕФРСБ инициализирован');

  // Подключение WebSocket для прогресса (для Render)
  const wsUrl = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
this.ws = new WebSocket(`${wsUrl}localhost:8081`);
  this.ws.onmessage = (event) => {
    const progress = JSON.parse(event.data);
    this.updateBulkProgress(progress);
  };
  this.ws.onopen = () => console.log('WebSocket подключён в UI');
  this.ws.onerror = (error) => console.error('WebSocket ошибка:', error);
  this.ws.onclose = () => console.log('WebSocket закрыт');
}

  private updateBulkProgress(progress: { current: number; total: number; currentInn: string; percentage: number }): void {
    const progressDiv = document.getElementById('bulkProgress') as HTMLDivElement;
    if (progressDiv) {
      progressDiv.style.display = 'block';
      progressDiv.innerHTML = `
        <p>Обработка ИНН: ${progress.currentInn}</p>
        <p>Прогресс: ${progress.percentage}% (${progress.current + 1}/${progress.total})</p>
        <div class="progress-bar" style="width: ${progress.percentage}%"></div>
      `;
    }
  }

  private setupEventListeners(): void {
    const searchForm = document.getElementById('searchForm') as HTMLFormElement;
    const exportJsonBtn = document.getElementById('exportJson') as HTMLButtonElement;
    const exportCsvBtn = document.getElementById('exportCsv') as HTMLButtonElement;

    if (searchForm) {
      searchForm.addEventListener('submit', this.handleSearch.bind(this));
    }

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => this.exportData('json'));
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.exportData('csv'));
    }
  }

  private setupValidation(): void {
    const searchTypeSelect = document.getElementById('searchType') as HTMLSelectElement;
    const searchQueryInput = document.getElementById('searchQuery') as HTMLInputElement;
    const validationDiv = document.getElementById('innValidation') as HTMLDivElement;

    if (!searchTypeSelect || !searchQueryInput || !validationDiv) return;

    const validateInput = debounce(() => {
      if (searchTypeSelect.value === 'inn' && searchQueryInput.value.trim()) {
        const validation = validateINN(searchQueryInput.value.trim());
        validationDiv.textContent = validation.message;
        validationDiv.className = `validation-message ${validation.isValid ? 'valid' : 'invalid'}`;
      } else {
        validationDiv.textContent = '';
        validationDiv.className = 'validation-message';
      }
    }, 300);

    searchQueryInput.addEventListener('input', validateInput);
    searchTypeSelect.addEventListener('change', () => {
      validationDiv.textContent = '';
      validationDiv.className = 'validation-message';

      const searchQueryInput = document.getElementById('searchQuery') as HTMLInputElement;
      const innListInput = document.getElementById('innListInput') as HTMLTextAreaElement;

      switch (searchTypeSelect.value) {
        case 'debtor':
          searchQueryInput.placeholder = 'Введите название должника';
          searchQueryInput.style.display = 'block';
          searchQueryInput.required = true;
          innListInput.style.display = 'none';
          innListInput.required = false;
          break;
        case 'caseNumber':
          searchQueryInput.placeholder = 'Введите номер дела (например, А40-123456/2024)';
          searchQueryInput.style.display = 'block';
          searchQueryInput.required = true;
          innListInput.style.display = 'none';
          innListInput.required = false;
          break;
        case 'inn':
          searchQueryInput.placeholder = 'Введите ИНН (10 или 12 цифр)';
          searchQueryInput.style.display = 'block';
          searchQueryInput.required = true;
          innListInput.style.display = 'none';
          innListInput.required = false;
          break;
        case 'bulkInn':
          searchQueryInput.style.display = 'none';
          searchQueryInput.required = false;
          innListInput.style.display = 'block';
          innListInput.required = true;
          break;
      }
    });
  }

  private async handleSearch(event: Event): Promise<void> {
    event.preventDefault();

    console.log('=== НАЧАЛО ОБРАБОТКИ ПОИСКА ===');

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    const searchType = formData.get('searchType') as 'debtor' | 'caseNumber' | 'inn' | 'bulkInn';

    console.log('Тип поиска:', searchType);

    console.log('Все данные формы:');
    for (let [key, value] of formData.entries()) {
      console.log(`${key}: ${value}`);
    }

    let searchParams: SearchParams;

    if (searchType === 'bulkInn') {
      console.log('=== ОБРАБОТКА МАССОВОГО ПОИСКА ===');

      const innListInput = document.getElementById('innListInput') as HTMLTextAreaElement;
      console.log('Элемент innListInput найден:', !!innListInput);

      if (!innListInput) {
        console.error('Элемент innListInput не найден!');
        this.showError('Ошибка: поле для ввода ИНН не найдено');
        return;
      }

      const innListText = (innListInput?.value || '').trim();

      console.log('Текст списка ИНН:', innListText);
      console.log('Длина текста:', innListText.length);

      if (!innListText) {
        console.log('Список ИНН пуст');
        this.showError('Введите список ИНН');
        return;
      }

      const innList = innListText
        .split('\n')
        .map(inn => inn.trim())
        .filter(inn => inn.length > 0);

      console.log('Обработанный список ИНН:', innList);
      console.log('Количество ИНН:', innList.length);

      if (innList.length === 0) {
        console.log('После обработки список ИНН пуст');
        this.showError('Список ИНН пуст');
        return;
      }

      console.log('Запускаем массовый поиск...');
      this.showLoading(true);
      this.hideError();
      this.hideResults();

      try {
        console.log('Вызываем displayBulkResults с списком:', innList);
        await this.displayBulkResults(innList);
        console.log('displayBulkResults завершен успешно');
      } catch (error) {
        console.error('Ошибка массового поиска:', error);
        this.showError('Произошла ошибка при выполнении массового поиска');
      } finally {
        console.log('Скрываем индикатор загрузки');
        this.showLoading(false);
      }

      console.log('=== КОНЕЦ ОБРАБОТКИ МАССОВОГО ПОИСКА ===');
      return;
    } else {
      console.log('=== ОБРАБОТКА ОБЫЧНОГО ПОИСКА ===');
      const query = (formData.get('searchQuery') as string || '').trim();
      const region = (formData.get('region') as string || '').trim() || 'Донецкая Народная Республика';
      if (!query) {
        this.showError('Введите поисковый запрос');
        return;
      }

      searchParams = {
        type: searchType,
        query,
        region,
      };
    }

    console.log('Параметры поиска:', searchParams);
    this.showLoading(true);
    this.hideError();
    this.hideResults();

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams),
      });
      const result = await response.json();

      if (result.success && result.data.length > 0) {
        this.currentResults = result.data;
        this.displayResults(result.data);
      } else {
        const errorMessage = result.error || 'По вашему запросу ничего не найдено. Проверьте правильность введенных данных.';
        this.showError(errorMessage);
      }
    } catch (error) {
      console.error('Ошибка поиска:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      this.showError(errorMessage);
    } finally {
      this.showLoading(false);
    }
  }

  private displayResults(cases: BankruptcyCase[]): void {
    const resultsSection = document.getElementById('results') as HTMLDivElement;
    const resultsContent = document.getElementById('resultsContent') as HTMLDivElement;

    if (!resultsSection || !resultsContent) return;

    resultsContent.innerHTML = '';

    cases.forEach((bankruptcyCase, index) => {
      const caseCard = this.createCaseCard(bankruptcyCase, index);
      resultsContent.appendChild(caseCard);
    });

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }

  private async displayBulkResults(innList: string[]): Promise<void> {
    console.log('=== НАЧАЛО displayBulkResults ===');
    console.log('Получен список ИНН:', innList);

    const response = await fetch('/api/bulkSearch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innList }),
    });
    const bulkResult = await response.json();
    console.log('Результат bulkSearch:', bulkResult);

    this.currentBulkResults = bulkResult.results;

    this.currentResults = [];
    bulkResult.results.forEach((r: BulkSearchResult) => {
      this.currentResults.push(...r.cases);
    });
    console.log('Данные для экспорта собраны:', this.currentResults.length, 'дел');

    const resultsSection = document.getElementById('results') as HTMLDivElement;
    const resultsContent = document.getElementById('resultsContent') as HTMLDivElement;

    console.log('resultsSection найден:', !!resultsSection);
    console.log('resultsContent найден:', !!resultsContent);

    if (!resultsSection || !resultsContent) return;

    // Удаляем прогресс-бар после завершения
    const progressDiv = document.getElementById('bulkProgress');
    if (progressDiv) {
      progressDiv.remove();
    }

    resultsContent.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'bulk-summary';

    const totalOriginal = innList.length;
    const totalUnique = bulkResult.results.length;
    const bankruptCount = bulkResult.results.filter((r: BulkSearchResult) => r.isBankrupt).length;
    const cleanCount = bulkResult.results.filter((r: BulkSearchResult) => !r.isBankrupt && !r.error).length;
    const errorCount = bulkResult.results.filter((r: BulkSearchResult) => r.error).length;

    summary.innerHTML = `
      <h3>Сводка по ${totalUnique} уникальным ИНН${totalUnique !== totalOriginal ? ` (из ${totalOriginal} введенных)` : ''}:</h3>
      <div class="summary-stats">
        <span class="stat-item bankrupt">Банкроты: ${bankruptCount}</span>
        <span class="stat-item clean">Чистые: ${cleanCount}</span>
        <span class="stat-item error">Ошибки: ${errorCount}</span>
      </div>
      ${totalUnique !== totalOriginal ? `<div class="dedup-info">Удалено дубликатов: ${totalOriginal - totalUnique}</div>` : ''}
    `;
    resultsContent.appendChild(summary);

    const bulkResultsDiv = document.createElement('div');
    bulkResultsDiv.className = 'bulk-results';

    bulkResult.results.forEach((result: BulkSearchResult) => {
      const resultItem = this.createBulkResultItem(result);
      bulkResultsDiv.appendChild(resultItem);
    });

    resultsContent.appendChild(bulkResultsDiv);
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }

  private createBulkResultItem(result: BulkSearchResult): HTMLElement {
    const item = document.createElement('div');
    const statusClass = result.error ? 'error' : result.isBankrupt ? 'bankrupt' : 'clean';
    item.className = `bulk-result-item ${statusClass}`;

    const statusText = result.error ? `Ошибка: ${result.error}` : result.isBankrupt ? 'БАНКРОТ' : 'Чистый';

    const casesText = result.cases.length > 0 ? `Дел о банкротстве: ${result.cases.length}` : '';

    item.innerHTML = `
      <div class="bulk-result-info">
        <div class="bulk-result-inn">${result.inn}</div>
        <div class="bulk-result-status ${statusClass}">${statusText}</div>
        ${casesText ? `<div class="bulk-result-cases">${casesText}</div>` : ''}
      </div>
      ${result.cases.length > 0 ? `<button class="btn btn-secondary btn-sm" onclick="this.parentElement.querySelector('.case-details').style.display = this.parentElement.querySelector('.case-details').style.display === 'none' ? 'block' : 'none'">Детали</button>` : ''}
    `;

    if (result.cases.length > 0) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'case-details';
      detailsDiv.style.display = 'none';
      detailsDiv.style.marginTop = '1rem';

      result.cases.forEach(case_ => {
        const caseCard = this.createCaseCard(case_, 0);
        detailsDiv.appendChild(caseCard);
      });

      item.appendChild(detailsDiv);
    }

    return item;
  }

  private createCaseCard(bankruptcyCase: BankruptcyCase, index: number): HTMLElement {
    const card = document.createElement('div');
    card.className = 'result-card';

    const statusClass = getStatusClass(bankruptcyCase.status);

    card.innerHTML = `
      <h3>${bankruptcyCase.debtorName}</h3>
      <div class="result-details">
        <div class="detail-group">
          <h4>Основная информация</h4>
          <div class="detail-item">
            <span class="detail-label">Номер дела:</span>
            <span class="detail-value">${bankruptcyCase.caseNumber}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Статус:</span>
            <span class="detail-value">
              <span class="status-badge ${statusClass}">${bankruptcyCase.status}</span>
            </span>
          </div>
          ${bankruptcyCase.inn ? `
          <div class="detail-item">
            <span class="detail-label">ИНН:</span>
            <span class="detail-value">${bankruptcyCase.inn}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.ogrn ? `
          <div class="detail-item">
            <span class="detail-label">ОГРН:</span>
            <span class="detail-value">${bankruptcyCase.ogrn}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.category ? `
          <div class="detail-item">
            <span class="detail-label">Категория:</span>
            <span class="detail-value">${bankruptcyCase.category}</span>
          </div>
          ` : ''}
        </div>

        <div class="detail-group">
          <h4>Судебная информация</h4>
          <div class="detail-item">
            <span class="detail-label">Суд:</span>
            <span class="detail-value">${bankruptcyCase.court}</span>
          </div>
          ${bankruptcyCase.judge ? `
          <div class="detail-item">
            <span class="detail-label">Судья:</span>
            <span class="detail-value">${bankruptcyCase.judge}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.manager ? `
          <div class="detail-item">
            <span class="detail-label">Управляющий:</span>
            <span class="detail-value">${bankruptcyCase.manager}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.openDate ? `
          <div class="detail-item">
            <span class="detail-label">Дата открытия:</span>
            <span class="detail-value">${bankruptcyCase.openDate}</span>
          </div>
          ` : ''}
        </div>

        <div class="detail-group">
          <h4>Финансовая информация</h4>
          ${bankruptcyCase.debtAmount ? `
          <div class="detail-item">
            <span class="detail-label">Сумма долга:</span>
            <span class="detail-value">${bankruptcyCase.debtAmount}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.region ? `
          <div class="detail-item">
            <span class="detail-label">Регион:</span>
            <span class="detail-value">${bankruptcyCase.region}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.address ? `
          <div class="detail-item">
            <span class="detail-label">Адрес:</span>
            <span class="detail-value">${bankruptcyCase.address}</span>
          </div>
          ` : ''}
          ${bankruptcyCase.lastUpdate ? `
          <div class="detail-item">
            <span class="detail-label">Обновлено:</span>
            <span class="detail-value">${bankruptcyCase.lastUpdate}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;

    return card;
  }

  private exportData(format: 'json' | 'csv'): void {
    const hasRegularResults = this.currentResults.length > 0;
    const hasBulkResults = this.currentBulkResults.length > 0;

    if (!hasRegularResults && !hasBulkResults) {
      this.showError('Нет данных для экспорта');
      return;
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

    try {
      if (hasBulkResults) {
        if (format === 'json') {
          exportToJSON(this.currentBulkResults, `efrsb_bulk_results_${timestamp}.json`);
        } else {
          exportBulkResultsToCSV(this.currentBulkResults, `efrsb_bulk_results_${timestamp}.csv`);
        }
      } else {
        if (format === 'json') {
          exportToJSON(this.currentResults, `efrsb_data_${timestamp}.json`);
        } else {
          exportToCSV(this.currentResults, `efrsb_data_${timestamp}.csv`);
        }
      }
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      this.showError('Ошибка при экспорте данных');
    }
  }

  private showLoading(show: boolean): void {
    const submitBtn = document.querySelector('#searchForm button[type="submit"]') as HTMLButtonElement;
    const btnText = submitBtn?.querySelector('.btn-text') as HTMLSpanElement;
    const spinner = submitBtn?.querySelector('.spinner') as HTMLDivElement;

    if (submitBtn && btnText && spinner) {
      submitBtn.disabled = show;
      btnText.style.display = show ? 'none' : 'inline';
      spinner.style.display = show ? 'inline-block' : 'none';
    }
  }

  private showError(message: string): void {
    const errorSection = document.getElementById('error') as HTMLDivElement;
    const errorText = document.getElementById('errorText') as HTMLParagraphElement;

    if (errorSection && errorText) {
      errorText.textContent = message;
      errorSection.style.display = 'block';
      errorSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  private hideError(): void {
    const errorSection = document.getElementById('error') as HTMLDivElement;
    if (errorSection) {
      errorSection.style.display = 'none';
    }
  }

  private hideResults(): void {
    const resultsSection = document.getElementById('results') as HTMLDivElement;
    if (resultsSection) {
      resultsSection.style.display = 'none';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new EFRSBApp();
});