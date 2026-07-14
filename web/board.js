(() => {
  const STORAGE_KEY = 'squad-board.positions.v1';
  const ORACLE_LIST_EL = document.getElementById('oracles');
  const SQUADS_EL = document.getElementById('squads');
  const BOARD_EL = document.getElementById('board');
  const NAME_EL = document.getElementById('squadName');
  const DEFAULT_NODE_WIDTH = 190;
  const DEFAULT_NODE_HEIGHT = 42;
  const NODE_SPACING = 24;

  let oracles = [];
  let squads = [];
  const selected = new Set();
  const nodeState = new Map();
  let positions = loadPositions();
  let dragging = null;

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function colorFromSquad(name) {
    const hue = hashString(name) % 360;
    return `hsl(${hue} 75% 54%)`;
  }

  function readJSON(response) {
    return response.json();
  }

  async function j(url, opts) {
    const res = await fetch(url, opts);
    return readJSON(res);
  }

  function savePositions() {
    const payload = {};
    nodeState.forEach((node, id) => {
      payload[id] = { x: node.x, y: node.y };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function loadPositions() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function layoutNodes() {
    let col = 0;
    let row = 0;
    const maxRowItems = 6;
    oracles.forEach((oracle, index) => {
      if (nodeState.has(oracle)) return;
      const x = 48 + (index % maxRowItems) * (DEFAULT_NODE_WIDTH + NODE_SPACING);
      const y = 48 + Math.floor(index / maxRowItems) * (DEFAULT_NODE_HEIGHT + NODE_SPACING);
      const stored = positions[oracle];
      nodeState.set(oracle, {
        id: oracle,
        x: Number.isFinite(stored?.x) ? stored.x : x,
        y: Number.isFinite(stored?.y) ? stored.y : y,
      });
    });
    oracles.forEach((oracle, index) => {
      const state = nodeState.get(oracle);
      if (state) {
        const stored = positions[oracle];
        if (stored?.x !== undefined && stored?.y !== undefined) {
          state.x = stored.x;
          state.y = stored.y;
        } else {
          const x = 48 + (index % maxRowItems) * (DEFAULT_NODE_WIDTH + NODE_SPACING);
          const y = 48 + Math.floor(index / maxRowItems) * (DEFAULT_NODE_HEIGHT + NODE_SPACING);
          state.x = x;
          state.y = y;
        }
      }
    });
    savePositions();
  }

  function ensureSvgDimensions() {
    const width = BOARD_EL.clientWidth;
    const height = BOARD_EL.clientHeight;
    BOARD_EL.setAttribute('viewBox', `0 0 ${width} ${height}`);
    BOARD_EL.setAttribute('width', String(width));
    BOARD_EL.setAttribute('height', String(height));
  }

  function svgEl(tag, props) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        el.setAttribute(key, String(value));
      }
    });
    return el;
  }

  function render() {
    ensureSvgDimensions();

    const oracleNodes = oracles.map((id) => nodeState.get(id)).filter(Boolean);
    while (BOARD_EL.firstChild) {
      BOARD_EL.removeChild(BOARD_EL.firstChild);
    }

    const defs = svgEl('defs', {});
    BOARD_EL.appendChild(defs);

    // edges
    const edgeGroup = svgEl('g', { id: 'edges' });
    squads.forEach((squad) => {
      const color = colorFromSquad(squad.name || '');
      const members = (squad.members || [])
        .map((member) => member.tmuxPaneId)
        .filter((id) => nodeState.has(id));
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const from = nodeState.get(members[i]);
          const to = nodeState.get(members[j]);
          const line = svgEl('line', {
            x1: from.x + DEFAULT_NODE_WIDTH / 2,
            y1: from.y + DEFAULT_NODE_HEIGHT / 2,
            x2: to.x + DEFAULT_NODE_WIDTH / 2,
            y2: to.y + DEFAULT_NODE_HEIGHT / 2,
            stroke: color,
            'stroke-width': '2.4',
            class: 'edge',
          });
          edgeGroup.appendChild(line);
        }
      }

      if (members.length >= 2) {
        const total = members.reduce((acc, id) => {
          const n = nodeState.get(id);
          return { x: acc.x + n.x, y: acc.y + n.y };
        }, { x: 0, y: 0 });
        const cx = total.x / members.length;
        const cy = total.y / members.length;
        const label = svgEl('text', {
          class: 'label',
          x: cx + 18,
          y: Math.max(20, cy - 12),
          fill: color,
        });
        label.textContent = squad.name || 'squad';
        edgeGroup.appendChild(label);
      }
    });
    BOARD_EL.appendChild(edgeGroup);

    const nodeGroup = svgEl('g', { id: 'nodes' });
    oracleNodes.forEach((node) => {
      const g = svgEl('g', {
        class: `node${selected.has(node.id) ? ' selected' : ''}`,
        'data-id': node.id,
      });
      const rect = svgEl('rect', {
        x: node.x,
        y: node.y,
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
        rx: 9,
        ry: 9,
      });
      const text = svgEl('text', {
        x: node.x + DEFAULT_NODE_WIDTH / 2,
        y: node.y + DEFAULT_NODE_HEIGHT / 2 + 4,
        fill: '#e6fff1',
        'text-anchor': 'middle',
      });
      text.textContent = node.id;
      g.appendChild(rect);
      g.appendChild(text);
      g.addEventListener('pointerdown', onPointerDown);
      nodeGroup.appendChild(g);
    });

    BOARD_EL.appendChild(nodeGroup);

    renderOracleList();
    renderSquads();
  }

  function renderOracleList() {
    if (!oracles.length) {
      ORACLE_LIST_EL.innerHTML = '<p>No oracles online.</p>';
      return;
    }

    ORACLE_LIST_EL.innerHTML = oracles
      .map((id) => `<div class="oracle-item${selected.has(id) ? ' selected' : ''}" data-id="${id}">${id}</div>`)
      .join('');

    ORACLE_LIST_EL.querySelectorAll('.oracle-item').forEach((item) => {
      item.addEventListener('click', () => {
        const nodeId = item.getAttribute('data-id');
        if (!nodeId) return;
        toggleSelection(nodeId);
      });
    });
  }

  function renderSquads() {
    if (!squads.length) {
      SQUADS_EL.innerHTML = '<p>no squads yet — click nodes, name it, create.</p>';
      return;
    }

    SQUADS_EL.innerHTML = squads
      .map((squad) => {
        const members = (squad.members || []).map((m) => m.tmuxPaneId).join(', ');
        return `
          <div class="squad">
            <b>${squad.name}</b> — ${members}
            <div><button data-squad="${encodeURIComponent(squad.name)}">📢 broadcast to squad</button></div>
            <div class="result"></div>
          </div>
        `;
      })
      .join('');

    SQUADS_EL.querySelectorAll('button[data-squad]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = decodeURIComponent(btn.getAttribute('data-squad') || '');
        broadcast(name, btn);
      });
    });
  }

  function onPointerDown(event) {
    const target = event.currentTarget;
    const id = target.getAttribute('data-id');
    if (!id) return;

    dragging = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      node: { ...nodeState.get(id) },
      moved: false,
      clicked: false,
    };

    dragging.clicked = true;
    target.setPointerCapture(event.pointerId);
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerCancel);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragging) return;
    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;
    if (!dragging.moved && Math.hypot(dx, dy) > 3) {
      dragging.moved = true;
    }
    if (!dragging.moved) return;

    const node = nodeState.get(dragging.id);
    if (!node) return;

    node.x = dragging.node.x + dx;
    node.y = dragging.node.y + dy;
    const maxX = BOARD_EL.clientWidth - DEFAULT_NODE_WIDTH;
    const maxY = BOARD_EL.clientHeight - DEFAULT_NODE_HEIGHT;
    node.x = Math.max(0, Math.min(maxX, node.x));
    node.y = Math.max(0, Math.min(maxY, node.y));
    savePositions();
    render();
  }

  function onPointerUp(event) {
    if (!dragging) return;
    const target = event.currentTarget;

    if (!dragging.moved) {
      toggleSelection(dragging.id);
    }

    if (dragging.moved) {
      savePositions();
    }

    target.releasePointerCapture(event.pointerId);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    dragging = null;
  }

  function onPointerCancel(event) {
    if (!dragging) return;
    const target = event.currentTarget;
    target.releasePointerCapture(event.pointerId);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    dragging = null;
  }

  function toggleSelection(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    render();
  }

  async function createSquad() {
    const name = NAME_EL.value.trim();
    const members = Array.from(selected);
    if (!name || members.length === 0) {
      window.alert('need a name + at least one selected oracle');
      return;
    }

    await j('/api/squads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, members }),
    });
    NAME_EL.value = '';
    await refresh();
  }

  async function broadcast(name, button) {
    button.disabled = true;
    try {
      const res = await j('/api/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ squad: name }),
      });
      const resultEl = button.closest('.squad').querySelector('.result');
      resultEl.textContent = (res.sent || []).map((r) => `${r.ok ? '✓' : '✗'} ${r.to}`).join('\n') || JSON.stringify(res);
    } catch (e) {
      const resultEl = button.closest('.squad').querySelector('.result');
      resultEl.textContent = String(e);
    } finally {
      button.disabled = false;
    }
  }

  async function refresh() {
    positions = loadPositions();
    const nextOracles = await j('/api/oracles');
    const nextSquads = await j('/api/squads');
    oracles = Array.isArray(nextOracles) ? nextOracles : [];
    squads = Array.isArray(nextSquads) ? nextSquads : [];
    const nextState = new Map(nodeState);
    nodeState.clear();

    oracles.forEach((id) => {
      const restored = nextState.get(id) || positions[id];
      if (restored) {
        nodeState.set(id, { id, x: restored.x, y: restored.y });
      }
    });

    layoutNodes();
    render();
    return { oracles, squads };
  }

  const createButton = document.getElementById('createSquadButton');
  createButton?.addEventListener('click', (event) => {
    event.preventDefault();
    createSquad();
  });

  new ResizeObserver(() => {
    if (oracles.length) {
      render();
    }
  }).observe(BOARD_EL);

  window.addEventListener('load', () => {
    refresh();
  });
})();
