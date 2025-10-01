import express from 'express';
import cors from 'cors';
import { EFRSBParser } from './parser';
import { SearchParams } from './types';
import { WebSocketServer } from 'ws';

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const parser = new EFRSBParser();

app.post('/search', async (req, res) => {
  const params: SearchParams = req.body;

  try {
    const result = await parser.search(params);
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/bulkSearch', async (req, res) => {
  const { innList }: { innList: string[] } = req.body;

  if (!innList || !Array.isArray(innList)) {
    return res.status(400).json({
      success: false,
      results: [],
      error: 'Invalid or missing innList'
    });
  }

  try {
    const result = await parser.bulkSearch(innList);
    res.json(result);
  } catch (error) {
    console.error('Bulk search error:', error);
    res.status(500).json({
      success: false,
      results: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// WebSocket для прогресса
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', (ws) => {
  console.log('WebSocket подключён');
  ws.on('message', (message) => {
    console.log('Получено сообщение:', message.toString());
  });
});

// Подписываемся на прогресс из parser
parser.onProgress((progress) => {
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(progress));
    }
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});