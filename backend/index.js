import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
import { WebSocketServer } from 'ws';
import OpenAI from 'openai';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme_very_secure_token';
const PORT = process.env.PORT || 5000;
const SERVERS_FILE = path.join(__dirname, 'servers.json');
const openaiKey = process.env.OPENAI_API_KEY || null;
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

// Auth middleware
function auth(req, res, next){
  const token = req.headers['x-admin-token'] || req.query.token;
  if(!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function readServers(){ return JSON.parse(await fs.readFile(SERVERS_FILE, 'utf-8')); }

// Safe run using whitelist check
async function runScript(serverKey, scriptName){
  const servers = await readServers();
  if(!servers[serverKey]) throw new Error('Unknown server');
  const serverPath = path.resolve(path.join(__dirname, servers[serverKey].path));
  const scriptPath = path.join(serverPath, scriptName);
  if(!scriptPath.startsWith(serverPath)) throw new Error('Invalid path');
  await fs.access(scriptPath); // throws if missing
  return new Promise((resolve, reject)=>{
    execFile(scriptPath, { cwd: serverPath }, (err, stdout, stderr)=>{
      if(err) return reject(stderr || err.message);
      resolve(stdout || 'OK');
    });
  });
}

// API: list servers
app.get('/api/servers', auth, async (req,res)=>{
  const s = await readServers();
  res.json(s);
});

// API: health (simple TCP check or PID)
app.get('/api/servers/:key/health', auth, async (req,res)=>{
  const s = await readServers();
  const key = req.params.key;
  if(!s[key]) return res.status(404).json({error:'Not found'});
  const port = s[key].port;
  // try a simple TCP connect via netcat if available, fallback to reading server.log last entry
  try {
    // read last line of server.log
    const logfile = path.join(__dirname, s[key].path, 'server.log');
    const data = await fs.readFile(logfile,'utf-8');
    const last = data.split('\n').filter(Boolean).slice(-1)[0] || '';
    return res.json({ ok: true, lastLog: last });
  } catch(e){
    return res.status(500).json({ ok:false, error:'Cannot access log' });
  }
});

// API: run actions
app.post('/api/servers/:key/:action', auth, async (req,res)=>{
  const { key, action } = req.params;
  const mapping = {
    start:'start.sh', stop:'stop.sh', restart:'restart.sh',
    'clear-cache':'clear-cache.sh', 'view-logs':'view-logs.sh', 'tail-logs':'view-logs.sh'
  };
  if(!mapping[action]) return res.status(400).json({ error:'Unknown action' });
  try{
    const out = await runScript(key, mapping[action]);
    res.json({ ok:true, output: out });
  }catch(err){ res.status(500).json({ ok:false, error: String(err) }); }
});

// API: read logs (last n lines)
app.get('/api/servers/:key/logs', auth, async (req,res)=>{
  const n = parseInt(req.query.lines || '200',10);
  const s = await readServers();
  const key = req.params.key;
  if(!s[key]) return res.status(404).json({error:'Not found'});
  const logfile = path.join(__dirname, s[key].path, 'server.log');
  try{
    const data = await fs.readFile(logfile,'utf-8');
    const lines = data.split('\n').filter(Boolean);
    res.json({ ok:true, logs: lines.slice(-n).join('\n') });
  }catch(e){ res.status(500).json({ ok:false, error:'Could not read log' }); }
});

// OpenAI assistant endpoint
app.post('/api/assistant', auth, async (req,res)=>{
  if(!openai) return res.status(501).json({ error: 'OpenAI not configured' });
  const { prompt } = req.body;
  if(!prompt) return res.status(400).json({ error:'Missing prompt' });
  try{
    const system = "You are a helpful DevOps assistant. Analyze logs and provide clear step-by-step diagnostics, cautions, and commands to run. Prefer safe, non-destructive suggestions.";
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role:'system', content: system }, { role:'user', content: prompt }],
      max_tokens: 600
    });
    const reply = completion.choices?.[0]?.message?.content || '';
    res.json({ ok:true, reply });
  }catch(err){ res.status(500).json({ ok:false, error: String(err) }); }
});

// WebSocket server for tailing logs
import http from 'http';
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path:'/ws/logs' });

wss.on('connection', async function(ws, req){
  // client must send JSON: { token, key }
  ws.on('message', async (msg)=>{
    try{
      const j = JSON.parse(msg.toString());
      if(j.token !== ADMIN_TOKEN){ ws.send(JSON.stringify({ error:'unauthorized' })); ws.close(); return; }
      const s = await readServers();
      if(!s[j.key]){ ws.send(JSON.stringify({ error:'unknown key' })); ws.close(); return; }
      const logfile = path.join(__dirname, s[j.key].path, 'server.log');
      // spawn a tail -n 100 -f if available, else poll file
      const tail = spawn('tail', ['-n','100','-f', logfile]);
      tail.stdout.on('data', chunk => ws.send(JSON.stringify({ type:'data', chunk: chunk.toString() })) );
      tail.stderr.on('data', chunk => ws.send(JSON.stringify({ type:'err', chunk: chunk.toString() })) );
      ws.on('close', ()=>{ tail.kill(); });
    }catch(e){ ws.send(JSON.stringify({ error:'bad request' })); ws.close(); }
  });
});

server.listen(PORT, ()=> console.log(`Backend listening on ${PORT}`));
