import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// Initialize default data
const defaultData = {
  staff: [],
  history: [],
  masterQueue: [],
};

// Helper to read data
const readData = () => {
  if (!fs.existsSync(DATA_FILE)) {
    return defaultData;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading data", e);
    return defaultData;
  }
};

// Helper to save data
const saveData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Error saving data", e);
  }
};

// API Routes
app.get('/api/state', (req, res) => {
  const data = readData();
  res.json(data);
});

app.post('/api/state', (req, res) => {
  const newData = req.body;
  if (!newData) return res.status(400).send("No data provided");
  
  saveData(newData);
  res.json({ success: true });
});

// Serve Frontend (Dist)
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});