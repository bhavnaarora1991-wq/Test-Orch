import express from 'express';
import cors from 'cors';
import generateRouter from './routes/generate';
import modelsRouter from './routes/models';
import { testGroqConnection } from './services/groqService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/generate', generateRouter);
app.use('/api/models', modelsRouter);

app.post('/api/test-groq', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  const success = await testGroqConnection(apiKey);
  res.json({ success });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 TestCase Generator backend running on http://localhost:${PORT}`);
  console.log(`   Ollama endpoint: http://localhost:11434`);
});
