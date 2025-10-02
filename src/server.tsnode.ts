import express from 'express';
import cors from 'cors';
import { EFRSBParser } from './parser.tsnode.ts'; // .ts для ts-node
import { SearchParams } from './types2.ts'; // .ts для ts-node
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // ESM-only, работает с module: "NodeNext"
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const parser = new EFRSBParser();

app.post('/api/search', async (req, res) => {
  const params: SearchParams = req.body;

  try {
    await parser.initialize();
    const result = await parser.search(params);
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    await parser.close();
  }
});

app.post('/api/bulkSearch', async (req, res) => {
  const { innList }: { innList: string[] } = req.body;

  if (!innList || !Array.isArray(innList)) {
    return res.status(400).json({ error: 'Invalid or missing innList' });
  }

  try {
    await parser.initialize();
    const result = await parser.bulkSearch(innList);
    res.json(result);
  } catch (error) {
    console.error('Bulk search error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    await parser.close();
  }
});

// Заглушка для прогресса (для совместимости с фронтендом)
app.get('/api/progress', (req, res) => {
  res.json({ current: 0, total: 0, currentInn: '', percentage: 0 });
});

const port = process.env.PORT || 3001; // Динамический PORT для Render
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

const wss = new WebSocketServer({ port: Number(process.env.WS_PORT) || 8081 }); // WebSocket на 8081
wss.on('connection', (ws) => {
  console.log('WebSocket подключён');
  ws.on('message', (message) => {
    console.log('Получено сообщение:', message.toString());
  });
});

parser.onProgress((progress) => {
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(progress));
    }
  });
});