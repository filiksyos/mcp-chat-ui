// Simple state
const state = {
  xp: 0,
  level: 1,
  progress: 0,
  activeModuleId: 'overview',
};

const ensureMermaid = async () => {
  const m = window.mermaid;
  if (!m) return null;
  if (!window.__MMD_INIT__) {
    try {
      m.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: '#0ea5e9',
          primaryTextColor: '#0b1220',
          primaryBorderColor: '#0284c7',
          lineColor: '#94a3b8',
          secondaryColor: '#22c55e',
          tertiaryColor: '#f59e0b',
          noteBkgColor: '#eef2ff',
          noteTextColor: '#0f172a'
        }
      });
      window.__MMD_INIT__ = true;
    } catch (e) {
      console.warn('Mermaid initialize failed', e);
    }
  }
  return m;
};

async function renderMermaidIn(container) {
  const m = await ensureMermaid();
  if (!m) { console.warn('Mermaid not available'); return; }
  const nodes = Array.from(container.querySelectorAll('.mermaid'));
  await Promise.all(nodes.map(async (node) => {
    const def = node.textContent.trim();
    const id = 'mmd-' + Math.random().toString(36).slice(2);
    try {
      const { svg } = await m.render(id, def);
      node.innerHTML = svg;
    } catch (e) {
      console.warn('Mermaid render failed for diagram:', def, e);
    }
  }));
}

const MODULES = [
  {
    id: 'overview',
    title: '1) Big Picture: CAST & WARM',
    render: () => `
      <section class="card">
        <h2>System Overview</h2>
        <p>This app wires <strong>Client</strong> ⇄ <strong>Server</strong> over WebSockets, then streams events from an <strong>Agent</strong> that can call <strong>MCP tools</strong>. Dual-coded diagram below:</p>
        <div class="mermaid">
          flowchart LR
            subgraph CLIENT[Client]
              UI[Chat UI]
              WSClient[WebSocket Client]
            end
            subgraph SERVER[Server]
              WSConn[WS Connection]\nws_connection.ts
              MCP[Stateless MCP HTTP]\nmcp.ts
              Tools[Tools: custom_math, data_chart]
            end
            subgraph AGENTS[Agents]
              ChartAgent[Chart Generator]\nchart_agent.ts
            end
            UI -- send prompt --> WSClient
            WSClient -- start-process --> WSConn
            WSConn -- stream events --> WSClient
            WSConn -- HTTP /mcp --> MCP
            MCP -- register --> Tools
            WSConn -- run via AgentsHelper --> ChartAgent
        </div>
      </section>
      <section class="card">
        <h3>CAST Mnemonic</h3>
        <ul>
          <li><strong>C</strong>lient: React UI in <code>client/src</code> dispatches messages via <code>ws_client.ts</code>.</li>
          <li><strong>A</strong>gents: Orchestrate reasoning/outputs (e.g., <code>chart_agent.ts</code>).</li>
          <li><strong>S</strong>erver: Express + WS entry (<code>src/index.ts</code>, <code>ws_server.ts</code>, <code>ws_connection.ts</code>).</li>
          <li><strong>T</strong>ools: MCP tools in <code>src/tools</code> (math, chart).</li>
        </ul>
      </section>
    `,
  },
  {
    id: 'client',
    title: '2) Client Flow',
    render: () => `
      <section class="card">
        <h2>Client Flow</h2>
        <div class="mermaid">
          sequenceDiagram
            participant UI as Chat UI
            participant WSC as WebSocket Client
            participant WSS as WS Server
            UI->>WSC: user message
            WSC->>WSS: { type: start-process, prompt, model }
            WSS-->>WSC: deltas, tool_call, tool_output
            WSC->>UI: update store (items / tokens)
        </div>
        <ul>
          <li><code>client/src/lib/ws_client.ts</code>: manages WS, heartbeats, and dispatch.</li>
          <li><code>client/src/store/slices/chatSessionSlice.ts</code>: stores responses, tool calls, charts.</li>
          <li><code>ChatContainer.tsx</code>: renders MCP server selector, tokens, and chat UI.</li>
        </ul>
      </section>
    `,
  },
  {
    id: 'server',
    title: '3) Server & Transport',
    render: () => `
      <section class="card">
        <h2>Server & Transport</h2>
        <div class="mermaid">
          flowchart TB
            A[index.ts] --> B[setupWsServer]\nws_server.ts
            A --> C[setupMcpServer]\nmcp.ts
            B --> D[WebSocketConnection]\nws_connection.ts
            C --> E[Autoload Tools]\nsrc/tools/*.ts
        </div>
        <ol>
          <li><code>src/index.ts</code>: Express app, static dist, WS server, MCP endpoint.</li>
          <li><code>src/server/ws_connection.ts</code>: handles <code>start-process</code>, streams model events, forwards tool calls/outputs.</li>
          <li><code>src/server/mcp.ts</code>: stateless MCP handler, auto-registers tools from <code>src/tools</code>.</li>
        </ol>
      </section>
    `,
  },
  {
    id: 'agents',
    title: '4) Agents & Instructions',
    render: () => `
      <section class="card">
        <h2>Agents</h2>
        <p><code>src/agents/chart_agent.ts</code> uses <code>@openai/agents</code> + OpenRouter model, constrained by a Zod schema.</p>
        <pre class="card"><code>model: anthropic/claude-3.5-sonnet\noutputType: chartOutputSchema\ninstructions: chart_agent_system_prompt</code></pre>
        <p>Prompts live in <code>src/instructions</code>:</p>
        <ul>
          <li><code>system_prompt.ts</code>: general system behavior & tool usage.</li>
          <li><code>coding_agent_instructions.ts</code>: single-file HTML generator persona.</li>
          <li><code>chart_agent_system_prompt.ts</code>: two-phase chart logic, outputs title/description/chartData/config.</li>
        </ul>
      </section>
    `,
  },
  {
    id: 'tools',
    title: '5) MCP Tools',
    render: () => `
      <section class="card">
        <h2>MCP Tools</h2>
        <div class="mermaid">
          flowchart LR
            Server-->|registerTool| Math[custom_math_calculations]
            Server-->|registerTool| Chart[data_chart_generator]
            subgraph Client
              Store[addChartItem/addImageItem/addHTMLItem]
            end
            Chart-->|structuredContent.result| Store
        </div>
        <ul>
          <li><code>custom_math_calculations_tool.ts</code>: evaluates math/chrono expressions, returns results array.</li>
          <li><code>data_chart_generator_tool.ts</code>: runs <code>chartAgent()</code> with prompt/cols/rows and returns Zod-validated config + data.</li>
        </ul>
      </section>
    `,
  },
  {
    id: 'extend',
    title: '6) Extend: Add a Tool',
    render: () => `
      <section class="card">
        <h2>Add a New MCP Tool</h2>
        <ol>
          <li>Create <code>src/tools/your_tool.ts</code> exporting a default function that calls <code>mcpServer.registerTool</code>.</li>
          <li>Define <strong>inputSchema</strong> and <strong>outputSchema</strong> with Zod.</li>
          <li>Return both <code>content</code> and <code>structuredContent</code> so the UI can consume it.</li>
          <li>Restart server; <code>mcp.ts</code> autoloads it.</li>
        </ol>
      </section>
    `,
  },
];

function $(sel) { return document.querySelector(sel); }

function renderModuleList() {
  const el = $('#moduleList');
  el.innerHTML = '';
  MODULES.forEach(m => {
    const b = document.createElement('button');
    b.textContent = m.title;
    b.className = state.activeModuleId === m.id ? 'active' : '';
    b.addEventListener('click', () => {
      state.activeModuleId = m.id;
      renderAll();
      addXP(5); // micro XP for navigation
    });
    el.appendChild(b);
  });
}

async function renderContent() {
  const container = $('#contentContainer');
  const mod = MODULES.find(m => m.id === state.activeModuleId) || MODULES[0];
  container.innerHTML = mod.render();
  await new Promise(r => setTimeout(r));
  await renderMermaidIn(container);
}

function addXP(points) {
  state.xp += points;
  const levelUp = Math.floor(state.xp / 100) + 1;
  state.level = Math.max(state.level, levelUp);
  state.progress = Math.min(100, (state.xp % 100));
  $('#xpValue').textContent = state.xp.toString();
  $('#levelValue').textContent = state.level.toString();
  $('#progressBar').style.width = `${state.progress}%`;
}

function setupQuiz() {
  const bank = $('#bank');
  const columns = ['Client','Server','Agents','Tools','Transport'];
  const items = [
    { label: 'ws_client.ts', group: 'Client' },
    { label: 'chatSessionSlice.ts', group: 'Client' },
    { label: 'ws_connection.ts', group: 'Server' },
    { label: 'ws_server.ts', group: 'Server' },
    { label: 'index.ts (server)', group: 'Server' },
    { label: 'chart_agent.ts', group: 'Agents' },
    { label: 'system_prompt.ts', group: 'Agents' },
    { label: 'data_chart_generator_tool.ts', group: 'Tools' },
    { label: 'custom_math_calculations_tool.ts', group: 'Tools' },
    { label: '/mcp HTTP', group: 'Transport' },
    { label: 'WebSocket /client-ws', group: 'Transport' },
  ];

  // Clear
  bank.innerHTML = '';
  columns.forEach(c => { const d = document.getElementById(`col-${c}`); if (d) d.innerHTML = ''; });

  // Create tokens
  items.sort(() => Math.random() - 0.5).forEach(item => {
    const t = document.createElement('div');
    t.className = 'token';
    t.textContent = item.label;
    t.draggable = true;
    t.dataset.answer = item.group;
    dragify(t);
    bank.appendChild(t);
  });

  // Make drops
  columns.forEach(col => {
    const drop = document.getElementById(`col-${col}`);
    makeDropzone(drop);
  });

  // Check button
  $('#checkQuiz').onclick = () => {
    let correct = 0, total = 0;
    columns.forEach(col => {
      const drop = document.getElementById(`col-${col}`);
      drop.querySelectorAll('.token').forEach(tok => {
        total += 1;
        if (tok.dataset.answer === col) correct += 1;
      });
    });
    const pct = Math.round((correct / Math.max(1,total)) * 100);
    const fb = $('#quizFeedback');
    fb.textContent = `Score: ${correct}/${total} (${pct}%)`;
    fb.className = 'feedback ' + (pct >= 80 ? 'correct' : 'incorrect');
    addXP(Math.round(pct / 5));
  };
}

function dragify(el) {
  el.addEventListener('dragstart', e => {
    el.classList.add('dragging');
    e.dataTransfer.setData('text/plain', el.textContent);
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
}

function makeDropzone(zone) {
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    const dragging = document.querySelector('.token.dragging');
    if (dragging) zone.appendChild(dragging);
  });
}

function renderMCQ() {
  const el = $('#mcqContainer');
  const questions = [
    {
      q: 'Which file autoloads all MCP tools?',
      a: ['src/server/mcp.ts','src/index.ts','client/src/App.tsx'],
      correct: 0,
    },
    {
      q: 'Which slice stores tool call results and charts?',
      a: ['client/src/store/slices/chatSessionSlice.ts','src/utils/agents_helper.ts','client/src/components/chat/ChatContainer.tsx'],
      correct: 0,
    },
    {
      q: 'Where is the WebSocket path exposed?',
      a: ['src/server/ws_server.ts: /client-ws','src/index.ts: /mcp','client/src/lib/ws_client.ts: /api/ws'],
      correct: 0,
    },
  ];

  el.innerHTML = '';
  questions.forEach((qq, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    const title = document.createElement('h4');
    title.textContent = `Q${i+1}. ${qq.q}`;
    card.appendChild(title);

    qq.a.forEach((opt, idx) => {
      const label = document.createElement('label');
      label.style.display = 'block';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `q${i}`;
      input.value = String(idx);
      label.appendChild(input);
      const span = document.createElement('span');
      span.textContent = ' ' + opt;
      label.appendChild(span);
      card.appendChild(label);
    });

    const btn = document.createElement('button');
    btn.textContent = 'Check';
    btn.className = 'primary';
    const fb = document.createElement('div');
    fb.className = 'feedback';

    btn.onclick = () => {
      const chosen = card.querySelector('input[type=radio]:checked');
      if (!chosen) return;
      const ok = Number(chosen.value) === qq.correct;
      fb.textContent = ok ? 'Correct!' : 'Try again';
      fb.className = 'feedback ' + (ok ? 'correct' : 'incorrect');
      if (ok) addXP(10);
    };

    card.appendChild(btn);
    card.appendChild(fb);
    el.appendChild(card);
  });
}

function renderAll() {
  renderModuleList();
  renderContent();
  setupQuiz();
  renderMCQ();
}

renderAll();
