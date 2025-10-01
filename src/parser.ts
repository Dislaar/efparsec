import { chromium, Browser, Page } from 'playwright';
import { SearchParams, ParseResult, BulkParseResult, BulkSearchResult, BankruptcyCase } from './types';
import { validateINN } from './utils';
import { Solver } from '@2captcha/captcha-solver';
import { EventEmitter } from 'events';

export class EFRSBParser {
  private solver = new Solver(process.env.TWOCAPTCHA_KEY || '06dc1226bf2e6dc40227cc6c608ede0e');
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly baseUrl = 'https://bankrot.fedresurs.ru/bankrupts';
  private eventEmitter = new EventEmitter();

  async initialize(): Promise<void> {
    console.log('Инициализация браузера...');
    this.browser = await chromium.launch({
      headless: true, // Оставляем false для отладки
      slowMo: 100,
      // proxy: { server: 'http://your-proxy:port', username: 'user', password: 'pass' } // Раскомментируй, если нужен прокси
    });
    this.page = await this.browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    console.log('Переход на страницу:', this.baseUrl);
    try {
      await this.page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
      console.log('Страница загружена');

      // Проверяем наличие сообщения об ошибке
      const errorMessage = await this.page.evaluate(() => document.body.innerText);
      if (errorMessage.includes('Доступ запрещён') || errorMessage.includes('Доступ ограничен')) {
        throw new Error('Сайт заблокировал доступ. Возможно, требуется CAPTCHA или обход блокировки.');
      }

      // Проверка CAPTCHA
      const captcha = await this.page.$('.g-recaptcha');
      if (captcha) {
        console.log('Обнаружена CAPTCHA, решаем...');
        const siteKey = await this.page.evaluate(() => {
          const captchaDiv = document.querySelector('.g-recaptcha');
          return captchaDiv ? captchaDiv.getAttribute('data-sitekey') : null;
        });
        if (!siteKey) {
          throw new Error('Не удалось найти ключ reCAPTCHA (data-sitekey)');
        }
        console.log('Найден siteKey:', siteKey);
        try {
          const response = await this.solver.recaptcha({ googlekey: siteKey, pageurl: this.baseUrl });
          const captchaCode = response.data;
          console.log('CAPTCHA решена, код:', captchaCode);
          await this.page.evaluate((code) => {
            const textarea = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement;
            if (textarea) textarea.value = code;
          }, captchaCode);
          const submitCaptcha = await this.page.$('input[type="submit"], button[type="submit"]');
          if (submitCaptcha) {
            console.log('Отправляем форму CAPTCHA...');
            await submitCaptcha.click();
            await this.page.waitForTimeout(2000);
          } else {
            console.log('Кнопка отправки CAPTCHA не найдена, продолжаем...');
          }
        } catch (captchaError) {
          console.error('Ошибка при решении CAPTCHA:', captchaError);
          throw new Error('Не удалось решить CAPTCHA: ' + (captchaError instanceof Error ? captchaError.message : 'Неизвестная ошибка'));
        }
      } else {
        console.log('CAPTCHA не обнаружена');
      }
    } catch (error) {
      console.error('Ошибка при загрузке страницы:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      console.log('Закрытие браузера...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async search(params: SearchParams): Promise<ParseResult> {
    if (!this.page) {
      await this.initialize();
      if (!this.page) {
        throw new Error('Не удалось инициализировать страницу браузера');
      }
    }

    try {
      console.log('🔍 Начинаем поиск:', params);

      // Валидация
      const validation = this.validateSearchParams(params);
      if (!validation.isValid) {
        return { success: false, data: [], error: validation.message };
      }

      const { query = '', region = 'Донецкая Народная Республика' } = params;

      // Логирование HTML страницы для отладки
      const pageHtml = await this.page.evaluate(() => document.documentElement.outerHTML);
      console.log('HTML страницы:', pageHtml.substring(0, 2000));

      // Ввод запроса
      const searchInput = '[formcontrolname="searchString"]';
      console.log('Ожидание поля ввода:', searchInput);
      await this.page.waitForSelector(searchInput, { state: 'visible', timeout: 30000 });
      await this.page.fill(searchInput, '');
      await this.page.fill(searchInput, query);
      console.log('Введён запрос:', query);

      // Выбор региона
      const regionSelector = 'input[role="combobox"]:not([readonly])';
      console.log('Ожидание селектора региона:', regionSelector);
      try {
        const comboboxes = await this.page.$$('input[role="combobox"]');
        console.log('Найдено элементов с role="combobox":', comboboxes.length);
        for (let i = 0; i < comboboxes.length; i++) {
          const isVisible = await comboboxes[i].isVisible();
          const isReadonly = await comboboxes[i].getAttribute('readonly');
          console.log(`Элемент ${i + 1}: visible=${isVisible}, readonly=${isReadonly}`);
        }

        await this.page.waitForSelector(regionSelector, { state: 'visible', timeout: 30000 });
        await this.page.click(regionSelector);
        await this.page.fill(regionSelector, region);
        await this.page.keyboard.press('Enter');
        console.log('Выбран регион:', region);
      } catch (error) {
        console.error('Ошибка при выборе региона:', error);
        const fallbackSelector = 'input[role="combobox"][aria-expanded]';
        console.log('Пробуем альтернативный селектор региона:', fallbackSelector);
        await this.page.waitForSelector(fallbackSelector, { state: 'visible', timeout: 15000 });
        await this.page.click(fallbackSelector);
        await this.page.fill(fallbackSelector, region);
        await this.page.keyboard.press('Enter');
        console.log('Выбран регион с альтернативным селектором:', region);
      }

      // Проверка CAPTCHA после выбора региона
      const captcha = await this.page.$('.g-recaptcha');
      if (captcha) {
        console.log('Обнаружена CAPTCHA после выбора региона, решаем...');
        const siteKey = await this.page.evaluate(() => {
          const captchaDiv = document.querySelector('.g-recaptcha');
          return captchaDiv ? captchaDiv.getAttribute('data-sitekey') : null;
        });
        if (!siteKey) {
          throw new Error('Не удалось найти ключ reCAPTCHA (data-sitekey) после выбора региона');
        }
        const response = await this.solver.recaptcha({ googlekey: siteKey, pageurl: this.baseUrl });
        const captchaCode = response.data;
        console.log('CAPTCHA решена, код:', captchaCode);
        await this.page.evaluate((code) => {
          const textarea = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement;
          if (textarea) textarea.value = code;
        }, captchaCode);
          const submitCaptcha = await this.page.$('input[type="submit"], button[type="submit"]');
          if (submitCaptcha) {
            console.log('Отправляем форму CAPTCHA...');
            await submitCaptcha.click();
            await this.page.waitForTimeout(2000);
          }
      }

      // Кнопка поиска
      const submitButton = '.u-svg-lupa';
      console.log('Ожидание кнопки поиска:', submitButton);
      try {
        await this.page.waitForSelector(submitButton, { state: 'visible', timeout: 40000 });
        await this.page.click(submitButton);
        console.log('Нажата кнопка поиска (.u-svg-lupa)');
      } catch (error) {
        console.error('Ошибка при клике на .u-svg-lupa:', error);
        const fallbackButton = '.itm-lupa';
        console.log('Пробуем альтернативный селектор кнопки:', fallbackButton);
        try {
          await this.page.waitForSelector(fallbackButton, { state: 'visible', timeout: 15000 });
          await this.page.click(fallbackButton);
          console.log('Нажата кнопка поиска (.itm-lupa)');
        } catch (fallbackError) {
          console.error('Ошибка при клике на .itm-lupa:', fallbackError);
          const secondFallback = '.itm-lupa__img';
          console.log('Пробуем второй альтернативный селектор кнопки:', secondFallback);
          await this.page.waitForSelector(secondFallback, { state: 'visible', timeout: 15000 });
          await this.page.click(secondFallback);
          console.log('Нажата кнопка поиска (.itm-lupa__img)');
        }
      }

      // Ждём результаты
      console.log('Ожидание результатов...');
      await this.page.waitForTimeout(5000);

      // Парсинг результатов
      const resultSelector = '.u-card-result__wrapper';
      console.log('Парсинг результатов с селектором:', resultSelector);
      const results = await this.page.$$eval(
        resultSelector,
        (cards: Element[], args: { query: string; region: string }) => {
          return cards.map((card: Element) => {
            const text = card.textContent || '';
            const caseNumberMatch = text.match(/А\d+-\d+\/\d{4}/);
            const innMatch = text.match(/\b\d{10,12}\b/);
            const statusKeywords = ['наблюдение', 'конкурсное производство', 'мировое соглашение', 'завершено', 'прекращено'];
            let status = 'Активное';
            for (const keyword of statusKeywords) {
              if (text.toLowerCase().includes(keyword)) {
                status = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                break;
              }
            }

            return {
              caseNumber: caseNumberMatch ? caseNumberMatch[0] : 'Не указан',
              debtorName: card.querySelector('.u-card-result__name span')?.textContent || args.query,
              inn: innMatch ? innMatch[0] : undefined,
              address: card.querySelector('.u-card-result__value_adr')?.textContent || '',
              ogrn: card.querySelector('.u-card-result__item-id:nth-child(2) .u-card-result__value_fw')?.textContent || '',
              status: card.querySelector('.u-card-result__value_item-property')?.textContent || status,
              court: 'Арбитражный суд',
              region: args.region,
              lastUpdate: card.querySelector('.status-date')?.textContent || new Date().toLocaleDateString('ru-RU'),
              manager: card.querySelector('.u-card-result__manager .u-card-result__value_w230')?.textContent || ''
            };
          }).filter((result: BankruptcyCase | null) => result !== null) as BankruptcyCase[];
        },
        { query, region }
      );

      // Пагинация: кликаем "Загрузить еще", пока кнопка видна
      const loadMoreButton = '.btn_load_more';
      while (await this.page.isVisible(loadMoreButton)) {
        console.log('Кликаем "Загрузить еще"...');
        await this.page.click(loadMoreButton);
        await this.page.waitForTimeout(5000);
        const newResults = await this.page.$$eval(
          resultSelector,
          (cards: Element[], args: { query: string; region: string }) => {
            return cards.map((card: Element) => {
              const text = card.textContent || '';
              const caseNumberMatch = text.match(/А\d+-\d+\/\d{4}/);
              const innMatch = text.match(/\b\d{10,12}\b/);
              const statusKeywords = ['наблюдение', 'конкурсное производство', 'мировое соглашение', 'завершено', 'прекращено'];
              let status = 'Активное';
              for (const keyword of statusKeywords) {
                if (text.toLowerCase().includes(keyword)) {
                  status = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                  break;
                }
              }

              return {
                caseNumber: caseNumberMatch ? caseNumberMatch[0] : 'Не указан',
                debtorName: card.querySelector('.u-card-result__name span')?.textContent || args.query,
                inn: innMatch ? innMatch[0] : undefined,
                address: card.querySelector('.u-card-result__value_adr')?.textContent || '',
                ogrn: card.querySelector('.u-card-result__item-id:nth-child(2) .u-card-result__value_fw')?.textContent || '',
                status: card.querySelector('.u-card-result__value_item-property')?.textContent || status,
                court: 'Арбитражный суд',
                region: args.region,
                lastUpdate: card.querySelector('.status-date')?.textContent || new Date().toLocaleDateString('ru-RU'),
                manager: card.querySelector('.u-card-result__manager .u-card-result__value_w230')?.textContent || ''
              };
            }).filter((result: BankruptcyCase | null) => result !== null) as BankruptcyCase[];
          },
          { query, region }
        );
        results.push(...newResults);
      }

      console.log('Найдено результатов:', results.length);
      return {
        success: true,
        data: results,
        totalFound: results.length
      };
    } catch (error) {
      console.error('Ошибка поиска:', error);
      return {
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  async bulkSearch(innList: string[]): Promise<BulkParseResult> {
    if (!this.page) {
      await this.initialize();
      if (!this.page) throw new Error('Не удалось инициализировать страницу браузера');
    }

    let totalProcessed = 0;
    const results: BulkSearchResult[] = [];

    try {
      for (const [index, inn] of innList.entries()) {
        const trimmedInn = inn.trim();
        totalProcessed++;
        const validation = validateINN(trimmedInn);
        if (!validation.isValid) {
          this.dispatchProgressEvent(index + 1, innList.length, trimmedInn);
          results.push({ inn: trimmedInn, isBankrupt: false, cases: [], error: validation.message });
          await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка 1 сек
          continue;
        }
        const params: SearchParams = { type: 'inn', query: trimmedInn, region: 'Донецкая Народная Республика' };
        const result = await this.search(params);
        this.dispatchProgressEvent(index + 1, innList.length, trimmedInn);
        results.push({ inn: trimmedInn, isBankrupt: result.success && result.data.length > 0, cases: result.data, error: result.error });
        await new Promise(resolve => setTimeout(resolve, 1000)); // Задержка 1 сек
      }

      return { success: true, results, totalProcessed };
    } catch (error) {
      console.error('Ошибка массового поиска:', error);
      return {
        success: false,
        results,
        totalProcessed,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    } finally {
      await this.close();
    }
  }

  private validateSearchParams(params: SearchParams): { isValid: boolean; message: string } {
    if (!params.query || params.query.trim().length === 0) {
      return { isValid: false, message: 'Поисковый запрос не может быть пустым' };
    }
    if (params.type === 'inn') {
      const innValidation = validateINN(params.query);
      if (!innValidation.isValid) {
        return { isValid: false, message: innValidation.message };
      }
    }
    if (params.query.trim().length < 3) {
      return { isValid: false, message: 'Поисковый запрос должен содержать минимум 3 символа' };
    }
    return { isValid: true, message: '' };
  }

  private dispatchProgressEvent(current: number, total: number, currentInn: string): void {
    const progress = { current, total, currentInn, percentage: Math.round((current / total) * 100) };
    console.log('Прогресс массового поиска:', progress);
    this.eventEmitter.emit('progress', progress);
  }

  onProgress(callback: (progress: { current: number; total: number; currentInn: string; percentage: number }) => void): void {
    this.eventEmitter.on('progress', callback);
  }
}