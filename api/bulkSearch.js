import { EFRSBParser } from '../src/parser';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parser = new EFRSBParser();
  try {
    await parser.initialize(); // Инициализация браузера
    const result = await parser.bulkSearch(req.body.innList);
    await parser.close(); // Закрытие браузера
    res.status(200).json(result);
  } catch (error) {
    await parser.close();
    res.status(500).json({ error: error.message });
  }
}