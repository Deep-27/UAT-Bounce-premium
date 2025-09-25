<template>
  <div :class="theme">
    <div class="flex min-h-screen">
      <!-- Sidebar -->
      <aside class="w-64 bg-white dark:bg-gray-800 shadow h-screen p-4">
        <div class="flex items-center gap-3 mb-6">
          <img src="/assets/logo.svg" class="h-12 w-12" alt="logo"/>
          <div>
            <div class="font-bold text-lg dark:text-white">UAT Bounce</div>
            <div class="text-xs text-gray-500 dark:text-gray-300">Premium Dashboard</div>
          </div>
        </div>
        <div class="mb-4">
          <input v-model="token" placeholder="Admin token" class="w-full p-2 border rounded" type="password"/>
        </div>
        <nav class="space-y-2 text-sm">
          <button @click="fetchServers" class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">Refresh servers</button>
          <button @click="toggleTheme" class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">Toggle Theme</button>
          <div class="text-xs text-gray-400 mt-4">Actions</div>
          <button @click="healthAll" class="w-full text-left px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">Health check all</button>
        </nav>
      </aside>

      <!-- Main -->
      <main class="flex-1 p-6">
        <header class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-semibold dark:text-white">Servers</h1>
          <div class="flex items-center gap-3">
            <div class="text-sm text-gray-600 dark:text-gray-300">Connected: {{ wsStatus }}</div>
            <button @click="connectWS" class="px-3 py-1 bg-indigo-600 text-white rounded">Connect Tail WS</button>
          </div>
        </header>

        <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="(s,k) in servers" :key="k" class="bg-white dark:bg-gray-900 p-4 rounded shadow">
            <div class="flex justify-between items-start">
              <div>
                <div class="font-semibold text-lg dark:text-white">{{ s.name }}</div>
                <div class="text-xs text-gray-500 dark:text-gray-400">{{ k }} • port {{ s.port }}</div>
              </div>
              <div class="text-right">
                <div :class="statusClass(k)">{{ statuses[k] || 'unknown' }}</div>
                <div class="text-xs text-gray-400">{{ lastSeen[k] || '' }}</div>
              </div>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button @click="action(k,'start')" class="px-2 py-2 rounded bg-green-500 text-white">Start</button>
              <button @click="action(k,'stop')" class="px-2 py-2 rounded bg-gray-600 text-white">Stop</button>
              <button @click="action(k,'restart')" class="px-2 py-2 rounded bg-yellow-500 text-white">Restart</button>
              <button @click="action(k,'clear-cache')" class="px-2 py-2 rounded bg-indigo-500 text-white">Clear Cache</button>
              <button @click="viewLogs(k)" class="px-2 py-2 rounded bg-slate-700 text-white col-span-2">View Logs</button>
              <button @click="tailLogs(k)" class="px-2 py-2 rounded bg-pink-600 text-white col-span-3">Tail Logs (WS)</button>
            </div>
          </div>
        </section>

        <!-- Assistant and Console -->
        <section class="mt-6 bg-white dark:bg-gray-900 p-4 rounded shadow">
          <h2 class="font-semibold mb-2 dark:text-white">Assistant</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input v-model="assistantPrompt" placeholder="Ask AI (paste logs or describe problem)" class="p-2 border rounded col-span-2" />
            <div class="flex gap-2">
              <button @click="askAssistant" class="px-3 py-2 bg-purple-600 text-white rounded">Ask AI</button>
              <button @click="clearConsole" class="px-3 py-2 bg-gray-200 rounded">Clear</button>
            </div>
          </div>
          <textarea v-model="consoleOutput" rows="6" class="w-full mt-3 p-2 border rounded bg-gray-50 dark:bg-gray-800 dark:text-white"></textarea>
        </section>
      </main>
    </div>

    <!-- Logs modal -->
    <div v-if="showLogs" class="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-gray-900 w-full max-w-4xl rounded p-4 max-h-[80vh] overflow-auto">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-semibold dark:text-white">Logs: {{ currentLogKey }}</h3>
          <div class="flex items-center gap-2">
            <button @click="copyLogs" class="px-2 py-1 bg-gray-200 rounded">Copy</button>
            <button @click="showLogs=false" class="px-2 py-1 bg-gray-200 rounded">Close</button>
          </div>
        </div>
        <pre class="whitespace-pre-wrap text-sm bg-gray-100 dark:bg-gray-800 p-3 rounded">{{ logs }}</pre>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
let ws = null;
export default {
  data(){ return {
    token: '',
    servers: {},
    statuses: {},
    lastSeen: {},
    consoleOutput: '',
    assistantPrompt: '',
    logs: '',
    showLogs: false,
    currentLogKey: '',
    theme: 'light',
    wsStatus: 'disconnected'
  }},
  mounted(){ this.fetchServers(); },
  methods:{
    async fetchServers(){
      if(!this.token) { /* allow empty token only for dev */ }
      try{
        const res = await axios.get('/api/servers', { headers: { 'x-admin-token': this.token } });
        this.servers = res.data;
        for(const k of Object.keys(this.servers)) this.statuses[k] = 'unknown';
      }catch(e){ console.error(e); }
    },
    async action(key, act){
      this.consoleOutput = `Running ${act} on ${key}...`;
      try{
        const res = await axios.post(`/api/servers/${key}/${act}`, {}, { headers:{ 'x-admin-token': this.token } });
        this.consoleOutput = res.data.output || JSON.stringify(res.data);
      }catch(e){ this.consoleOutput = e.response ? JSON.stringify(e.response.data) : e.message; }
    },
    async viewLogs(key){
      this.currentLogKey = key;
      try{
        const res = await axios.get(`/api/servers/${key}/logs`, { headers:{ 'x-admin-token': this.token } });
        this.logs = res.data.logs || '';
        this.showLogs = true;
      }catch(e){ this.logs = e.response ? JSON.stringify(e.response.data) : e.message; this.showLogs = true; }
    },
    connectWS(){
      if(ws) ws.close();
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:5000/ws/logs`);
      ws.onopen = ()=> { this.wsStatus='connected'; };
      ws.onclose = ()=> { this.wsStatus='disconnected'; };
      ws.onmessage = (evt)=>{
        try{
          const j = JSON.parse(evt.data);
          if(j.type === 'data'){ this.consoleOutput += j.chunk; }
        }catch(e){ console.log('ws', e); }
      };
    },
    tailLogs(key){
      if(!ws || ws.readyState !== WebSocket.OPEN){ alert('Connect WS first'); return; }
      ws.send(JSON.stringify({ token: this.token || 'changeme_very_secure_token', key }));
      this.consoleOutput = `Tailing logs for ${key}...`;
    },
    async askAssistant(){
      if(!this.assistantPrompt){ alert('Enter a prompt'); return; }
      this.consoleOutput = 'AI thinking...';
      try{
        const res = await axios.post('/api/assistant', { prompt: this.assistantPrompt }, { headers:{ 'x-admin-token': this.token } });
        this.consoleOutput = res.data.reply || JSON.stringify(res.data);
      }catch(e){ this.consoleOutput = e.response ? JSON.stringify(e.response.data) : e.message; }
    },
    clearConsole(){ this.consoleOutput=''; },
    statusClass(k){ return this.statuses[k] === 'running' ? 'text-green-600' : 'text-red-600'; },
    toggleTheme(){ this.theme = this.theme === 'light' ? 'dark' : 'light'; document.documentElement.classList.toggle('dark'); },
    async healthAll(){ for(const k of Object.keys(this.servers)){ try{ const r = await axios.get(`/api/servers/${k}/health`, { headers:{ 'x-admin-token': this.token } }); this.statuses[k] = 'running'; this.lastSeen[k] = new Date().toLocaleTimeString(); }catch(e){ this.statuses[k] = 'stopped'; } } },
    copyLogs(){ navigator.clipboard.writeText(this.logs); alert('Copied'); }
  }
}
</script>

<style>
.dark { background:#0b1220; color:#fff; }
</style>
