import express from 'express';
import fs from 'fs';
const app = express();
const log = (m)=> fs.appendFileSync('server.log', `[${new Date().toISOString()}] ${m}\n`);
app.get('/', (req,res)=>{ log('health check'); res.send('Hello from UAT Server 1'); });
app.listen(3001, ()=>{ log('started server on 3001'); console.log('started'); });
