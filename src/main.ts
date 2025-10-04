import './style.css';
import { SearchParams, BankruptcyCase, BulkSearchResult, BulkParseResult, ParseResult } from './types2.js';
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

    // Подключение WebSocket для прогресса
    const wsUrl = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    this.ws = new WebSocket(`${wsUrl}${window.location.host}/ws`); // /ws endpoint на том же порту
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
        <p>Прогресс: ${progress.percentage}% (${progress.current}/${progress.total})</p>
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
      exportJsonBtn.addEventListener('click', () => this.handleExport('json'));
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.handleExport('csv'));
    }

    const searchTypeSelect = document.getElementById('searchType') as HTMLSelectElement;
    if (searchTypeSelect) {
      searchTypeSelect.addEventListener('change', this.toggleInnListInput.bind(this));
    }
  }

  private toggleInnListInput(e: Event): void {
    const select = e.target as HTMLSelectElement;
    const innListGroup = document.querySelector('.form-group:has(#innListInput)') as HTMLDivElement;
    if (innListGroup) {
      innListGroup.style.display = select.value === 'bulkInn' ? 'block' : 'none';
    }
  }

  private async handleSearch(e: Event): Promise<void> {
    e.preventDefault();
    this.hideError();
    this.hideResults();
    const formData = new FormData(e.target as HTMLFormElement);
    const searchType = formData.get('searchType') as SearchParams['type'];
    const searchQuery = formData.get('searchQuery') as string;
    const innListInput = document.getElementById('innListInput') as HTMLTextAreaElement;
    const region = formData.get('region') as string;

    this.showLoading(true);

    try {
      if (searchType === 'bulkInn') {
        const innList = innListInput.value.split('\n').filter((inn) => inn.trim() !== '');
        const progressDiv = document.getElementById('bulkProgress') as HTMLDivElement;
        if (progressDiv) {
          progressDiv.style.display = 'block';
          progressDiv.innerHTML = `
            <p>Подготовка...</p>
            <p>Прогресс: 0% (0/${innList.length})</p>
            <div class="progress-bar" style="width: 0%"></div>
          `;
        }

        const response = await fetch('/api/bulkSearch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ innList, region }),
        });
        const result: BulkParseResult = await response.json();
        if (result.success) {
          this.currentBulkResults = result.results;
          this.displayBulkResults();
        } else {
          this.showError(result.error || 'Ошибка обработки массового поиска');
        }
      } else {
        const params: SearchParams = { type: searchType, query: searchQuery, region };
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const result: ParseResult = await response.json();
        if (result.success) {
          this.currentResults = result.data;
          this.displayResults();
        } else {
          this.showError(result.error || 'Ошибка поиска');
        }
      }
    } catch (error) {
      this.showError((error as Error).message);
    } finally {
      this.showLoading(false);
    }
  }

  private handleExport(format: 'json' | 'csv'): void {
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    const hasBulkResults = this.currentBulkResults.length > 0;

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

  private setupValidation(): void {
    const searchQueryInput = document.getElementById('searchQuery') as HTMLInputElement;
    if (searchQueryInput) {
      searchQueryInput.addEventListener('input', debounce((e: Event) => {
        const target = e.target as HTMLInputElement;
        const searchTypeSelect = document.getElementById('searchType') as HTMLSelectElement;
        const innValidation = document.getElementById('innValidation') as HTMLDivElement;

        if (searchTypeSelect.value === 'inn' && target.value) {
          const isValid = validateINN(target.value);
          innValidation.textContent = isValid ? 'ИНН валиден' : 'Неверный формат ИНН';
          innValidation.className = `validation-message ${isValid ? 'valid' : 'invalid'}`;
        } else {
          innValidation.textContent = '';
        }
      }, 300));
    }
  }

  private displayResults(): void {
    const resultsContent = document.getElementById('resultsContent') as HTMLDivElement;
    if (resultsContent) {
      if (this.currentResults.length === 0) {
        resultsContent.innerHTML = '<p>Ничего не найдено</p>';
      } else {
        resultsContent.innerHTML = this.currentResults
          .map((result) => `
            <div class="card ${getStatusClass(result.status)}">
              <h3>${result.debtorName}</h3>
              <p><strong>ИНН:</strong> ${result.inn || 'Не указан'}</p>
              <p><strong>ОГРН:</strong> ${result.ogrn || 'Не указан'}</p>
              <p><strong>Номер дела:</strong> ${result.caseNumber}</p>
              <p><strong>Статус:</strong> ${result.status}</p>
              <p><strong>Суд:</strong> ${result.court}</p>
              <p><strong>Судья:</strong> ${result.judge || 'Не указан'}</p>
              <p><strong>Арбитражный управляющий:</strong> ${result.manager || 'Не указан'}</p>
              <p><strong>Дата открытия:</strong> ${result.openDate ? new Date(result.openDate).toLocaleDateString() : 'Не указана'}</p>
              <p><strong>Сумма долга:</strong> ${result.debtAmount || 'Не указана'}</p>
              <p><strong>Регион:</strong> ${result.region || 'Не указан'}</p>
              <p><strong>Адрес:</strong> ${result.address || 'Не указан'}</p>
              <p><strong>Категория:</strong> ${result.category || 'Не указана'}</p>
              <p><strong>Последнее обновление:</strong> ${result.lastUpdate ? new Date(result.lastUpdate).toLocaleDateString() : 'Не указана'}</p>
              <p><strong>Дата публикации:</strong> ${result.publicationDate ? new Date(result.publicationDate).toLocaleDateString() : 'Не указана'}</p>
            </div>
          `)
          .join('');
      }
      resultsContent.parentElement!.style.display = 'block';
      resultsContent.scrollIntoView({ behavior: 'smooth' });
    }
  }

  private displayBulkResults(): void {
    const resultsContent = document.getElementById('resultsContent') as HTMLDivElement;
    if (resultsContent) {
      if (this.currentBulkResults.length === 0) {
        resultsContent.innerHTML = '<p>Ничего не найдено для указанных ИНН</p>';
      } else {
        resultsContent.innerHTML = this.currentBulkResults
          .map((result) => `
            <div class="card">
              <h3>ИНН: ${result.inn}</h3>
              <p><strong>Статус банкротства:</strong> ${result.isBankrupt ? 'Да' : 'Нет'}</p>
              <p><strong>Ошибка:</strong> ${result.error || 'Нет ошибок'}</p>
              ${result.cases.length > 0 ? result.cases.map((c) => `
                <div class="sub-card ${getStatusClass(c.status)}">
                  <p><strong>Номер дела:</strong> ${c.caseNumber}</p>
                  <p><strong>Название должника:</strong> ${c.debtorName}</p>
                  <p><strong>ИНН:</strong> ${c.inn || 'Не указан'}</p>
                  <p><strong>ОГРН:</strong> ${c.ogrn || 'Не указан'}</p>
                  <p><strong>Статус:</strong> ${c.status}</p>
                  <p><strong>Суд:</strong> ${c.court}</p>
                  <p><strong>Судья:</strong> ${c.judge || 'Не указан'}</p>
                  <p><strong>Арбитражный управляющий:</strong> ${c.manager || 'Не указан'}</p>
                  <p><strong>Дата открытия:</strong> ${c.openDate ? new Date(c.openDate).toLocaleDateString() : 'Не указана'}</p>
                  <p><strong>Сумма долга:</strong> ${c.debtAmount || 'Не указана'}</p>
                  <p><strong>Регион:</strong> ${c.region || 'Не указан'}</p>
                  <p><strong>Адрес:</strong> ${c.address || 'Не указан'}</p>
                  <p><strong>Категория:</strong> ${c.category || 'Не указана'}</p>
                  <p><strong>Последнее обновление:</strong> ${c.lastUpdate ? new Date(c.lastUpdate).toLocaleDateString() : 'Не указана'}</p>
                  <p><strong>Дата публикации:</strong> ${c.publicationDate ? new Date(c.publicationDate).toLocaleDateString() : 'Не указана'}</p>
                </div>
              `).join('') : '<p>Нет данных по делам</p>'}
              <p><strong>Дата публикации:</strong> ${result.publicationDate ? new Date(result.publicationDate).toLocaleDateString() : 'Не указана'}</p>
            </div>
          `)
          .join('');
      }
      resultsContent.parentElement!.style.display = 'block';
      resultsContent.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new EFRSBApp();
});