import express from 'express';
import fs from 'fs';
const app = express();
const log = (m)=> fs.appendFileSync('server.log', `[${new Date().toISOString()}] ${m}\n`);
app.get('/', (req,res)=>{ log('health check'); res.send('Hello from UAT Server 2'); });
app.listen(3002, ()=>{ log('started server on 3002'); console.log('started'); });
