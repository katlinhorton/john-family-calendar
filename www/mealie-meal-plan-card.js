class MealieMealPlanCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._weekOffset = 0;
      this._mealPlanData = {};
      this._allRecipes = [];
      this._searchTimeout = null;
      this._pendingDate = null;
      this._pendingMealType = null;
      this._config = {};
    }
  
    setConfig(config) {
      this._config = config;
      this._mealie_url = config.mealie_url || '';
      this._api_token = config.api_token || '';
      this._render();
    }
  
    set hass(hass) {
      this._hass = hass;
      if (!this._initialized) {
        this._initialized = true;
        this._loadMealPlan();
      }
    }
  
    // Read CSS variables from the HA host document
    _getVar(name, fallback) {
      const val = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return val || fallback;
    }
  
    _render() {
      const s = this.shadowRoot;
      s.innerHTML = `
        <style>
          :host {
            display: block;
          }
  
          * { box-sizing: border-box; margin: 0; padding: 0; }
  
          .card {
            background: rgba(255,255,255,0.6);
            border-radius: 24px;
            padding: 12px;
            font-family: var(--primary-font-family, 'Ovo', serif);
            color: var(--primary-text-color, #333);
          }
  
          /* Week nav */
          .week-nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 0 4px;
          }
          .week-nav button {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 22px;
            color: var(--secondary-text-color, #555);
            padding: 2px 8px;
            border-radius: 6px;
            line-height: 1;
            font-family: inherit;
          }
          .week-nav button:hover { background: rgba(0,0,0,0.06); }
          .week-label {
            font-size: 0.95em;
            color: var(--primary-text-color, #333);
            cursor: pointer;
            padding: 4px 10px;
            border-radius: 8px;
            font-family: inherit;
          }
          .week-label:hover { background: rgba(0,0,0,0.06); }
  
          /* Grid */
          .grid {
            display: grid;
            grid-template-columns: 52px repeat(7, 1fr);
            gap: 1px;
            background: var(--divider-color, #e8e8e8);
            border: 1px solid var(--divider-color, #e8e8e8);
            border-radius: 16px;
            overflow: hidden;
          }
  
          /* Day headers */
          .day-header {
            background: var(--card-background-color, #fff);
            text-align: center;
            padding: 8px 4px 6px;
          }
          .day-header .day-name {
            font-size: 0.62em;
            color: var(--secondary-text-color, #999);
            text-transform: uppercase;
            letter-spacing: 0.08em;
            font-family: inherit;
          }
          .day-header .day-num {
            font-size: 1.55em;
            color: var(--primary-text-color, #222);
            line-height: 1.1;
            margin-top: 1px;
            display: inline-block;
            min-width: 28px;
            border-radius: 6px;
            padding: 0 3px;
            font-family: inherit;
          }
          .day-header.today .day-num {
            background: var(--accent-color, #ff9800);
            color: #fff;
          }
          .day-header.past .day-name,
          .day-header.past .day-num {
            color: var(--disabled-text-color, #ccc);
          }
  
          .corner { background: var(--card-background-color, #fff); }
  
          /* Meal type label */
          .meal-label {
            background: var(--secondary-background-color, #fafafa);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            padding: 4px 2px;
          }
          .meal-label .meal-icon { font-size: 1em; }
          .meal-label .meal-name {
            font-size: 0.52em;
            color: var(--disabled-text-color, #bbb);
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-family: inherit;
          }
  
          /* Meal cells */
          .meal-cell {
            background: var(--card-background-color, #fff);
            min-height: 58px;
            padding: 5px 4px;
            cursor: pointer;
            transition: background 0.1s;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            text-align: center;
          }
          .meal-cell:hover { background: rgba(251,128,114,0.06); }
          .meal-cell.past { background: var(--secondary-background-color, #fafafa); }
          .meal-cell.past:hover { background: var(--divider-color, #f0f0f0); }
  
          .meal-cell.empty .plus {
            font-size: 1.2em;
            color: var(--disabled-text-color, #ddd);
            font-family: sans-serif;
          }
          .meal-cell.empty:hover .plus { color: var(--secondary-text-color, #bbb); }
  
          .meal-pill {
            background: rgba(251,128,114,0.12);
            color: var(--kat-default-primary-color, #fb8072);
            border-radius: 6px;
            padding: 3px 5px;
            font-size: 0.62em;
            line-height: 1.3;
            word-break: break-word;
            width: 100%;
            text-align: center;
            font-family: inherit;
          }
          .meal-cell.past .meal-pill {
            background: rgba(0,0,0,0.05);
            color: var(--disabled-text-color, #bbb);
          }
  
          /* Modal */
          .modal-overlay {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.3);
            z-index: 9999;
            align-items: center;
            justify-content: center;
          }
          .modal-overlay.open { display: flex; }
  
          .modal {
            background: var(--card-background-color, #fff);
            border-radius: 16px;
            padding: 20px;
            width: min(400px, 92vw);
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 8px 40px rgba(0,0,0,0.15);
            font-family: inherit;
          }
          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
          }
          .modal h3 {
            font-size: 0.95em;
            color: var(--primary-text-color, #222);
            font-family: inherit;
          }
          .modal-close {
            background: none;
            border: none;
            font-size: 1.2em;
            cursor: pointer;
            color: var(--disabled-text-color, #bbb);
            padding: 2px 6px;
            border-radius: 4px;
            line-height: 1;
          }
          .modal-close:hover {
            background: var(--secondary-background-color, #f0f0f0);
            color: var(--primary-text-color, #555);
          }
  
          .search-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--divider-color, #e8e8e8);
            border-radius: 8px;
            font-size: 0.88em;
            margin-bottom: 10px;
            background: var(--secondary-background-color, #fafafa);
            color: var(--primary-text-color, #333);
            font-family: inherit;
          }
          .search-input:focus {
            outline: none;
            border-color: var(--kat-default-primary-color, #fb8072);
            background: var(--card-background-color, #fff);
          }
  
          .recipe-list { display: flex; flex-direction: column; gap: 5px; }
          .recipe-item {
            padding: 8px 12px;
            border: 1px solid var(--divider-color, #efefef);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.84em;
            background: var(--secondary-background-color, #fafafa);
            transition: background 0.1s, border-color 0.1s;
            font-family: inherit;
          }
          .recipe-item:hover {
            background: rgba(251,128,114,0.08);
            border-color: var(--kat-default-primary-color, #fb8072);
          }
          .recipe-item .recipe-name { color: var(--primary-text-color, #222); }
          .recipe-item:hover .recipe-name { color: var(--kat-default-primary-color, #fb8072); }
          .recipe-item .recipe-desc {
            font-size: 0.8em;
            color: var(--disabled-text-color, #bbb);
            margin-top: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
  
          .no-results, .loading-msg {
            font-size: 0.84em;
            color: var(--disabled-text-color, #bbb);
            text-align: center;
            padding: 16px 0;
            font-family: inherit;
          }
  
          .open-mealie-btn {
            display: block;
            width: 100%;
            margin-top: 12px;
            padding: 9px;
            background: var(--secondary-background-color, #f5f5f5);
            color: var(--secondary-text-color, #777);
            border: 1px solid var(--divider-color, #e8e8e8);
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.82em;
            font-family: inherit;
            text-align: center;
          }
          .open-mealie-btn:hover { background: var(--divider-color, #eee); }
  
          .status-msg {
            font-size: 0.78em;
            text-align: center;
            padding: 6px 0 0;
            color: var(--disabled-text-color, #bbb);
            font-family: inherit;
          }
        </style>
  
        <ha-card>
          <div class="card">
            <div class="week-nav">
              <button id="prev-btn">&#8249;</button>
              <span class="week-label" id="week-label"></span>
              <button id="next-btn">&#8250;</button>
            </div>
            <div class="grid" id="grid"></div>
          </div>
        </ha-card>
  
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal">
            <div class="modal-header">
              <h3 id="modal-title">Add Meal</h3>
              <button class="modal-close" id="modal-close">&#x2715;</button>
            </div>
            <div id="modal-body"></div>
          </div>
        </div>
      `;
  
      this._bindNav();
    }
  
    _bindNav() {
      const s = this.shadowRoot;
      s.getElementById('prev-btn').addEventListener('click', () => { this._weekOffset--; this._loadMealPlan(); });
      s.getElementById('next-btn').addEventListener('click', () => { this._weekOffset++; this._loadMealPlan(); });
      s.getElementById('week-label').addEventListener('click', () => { this._weekOffset = 0; this._loadMealPlan(); });
      s.getElementById('modal-close').addEventListener('click', () => this._closeModal());
      s.getElementById('modal-overlay').addEventListener('click', (e) => {
        if (e.target === s.getElementById('modal-overlay')) this._closeModal();
      });
    }
  
    _getWeekStart(offset = 0) {
      const today = new Date();
      const sun = new Date(today);
      sun.setDate(today.getDate() - today.getDay() + offset * 7);
      sun.setHours(0, 0, 0, 0);
      return sun;
    }
  
    _formatDate(d) {
      return d.toISOString().split('T')[0];
    }
  
    _isToday(d) {
      return this._formatDate(d) === this._formatDate(new Date());
    }
  
    _isPast(d) {
      const today = new Date(); today.setHours(0,0,0,0);
      return d < today;
    }
  
    async _apiFetch(path, options = {}) {
      const res = await fetch(this._mealie_url + path, {
        headers: {
          'Authorization': 'Bearer ' + this._api_token,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json();
    }
  
    async _loadMealPlan() {
      const start = this._getWeekStart(this._weekOffset);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
  
      const opts = { month: 'short', day: 'numeric' };
      const label = this.shadowRoot.getElementById('week-label');
      if (label) label.textContent =
        start.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', opts);
  
      try {
        const data = await this._apiFetch(
          `/api/households/mealplans?start_date=${this._formatDate(start)}&end_date=${this._formatDate(end)}&perPage=100`
        );
        this._mealPlanData = {};
        for (const item of (data.items || data)) {
          const key = item.date + '|' + item.entryType;
          if (!this._mealPlanData[key]) this._mealPlanData[key] = [];
          this._mealPlanData[key].push(item);
        }
      } catch (e) {
        console.error('Mealie: failed to load meal plan', e);
        this._mealPlanData = {};
      }
      this._renderGrid();
    }
  
    _renderGrid() {
      const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
      const MEAL_ICONS = { breakfast: '🌅', lunch: '🥗', dinner: '🍲', snack: '🍪' };
      const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
      const start = this._getWeekStart(this._weekOffset);
      const grid = this.shadowRoot.getElementById('grid');
      if (!grid) return;
      grid.innerHTML = '';
  
      // Corner
      const corner = document.createElement('div');
      corner.className = 'corner';
      grid.appendChild(corner);
  
      // Day headers
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const el = document.createElement('div');
        el.className = 'day-header' + (this._isToday(d) ? ' today' : this._isPast(d) ? ' past' : '');
        el.innerHTML = `<div class="day-name">${DAYS[i]}</div><div class="day-num">${d.getDate()}</div>`;
        grid.appendChild(el);
      }
  
      // Meal rows
      for (const mealType of MEAL_TYPES) {
        const label = document.createElement('div');
        label.className = 'meal-label';
        label.innerHTML = `<span class="meal-icon">${MEAL_ICONS[mealType]}</span><span class="meal-name">${mealType}</span>`;
        grid.appendChild(label);
  
        for (let i = 0; i < 7; i++) {
          const d = new Date(start);
          d.setDate(start.getDate() + i);
          const dateStr = this._formatDate(d);
          const meals = this._mealPlanData[dateStr + '|' + mealType] || [];
          const past = this._isPast(d);
  
          const cell = document.createElement('div');
          cell.className = 'meal-cell ' + (meals.length > 0 ? 'filled' : 'empty') + (past ? ' past' : '');
  
          if (meals.length > 0) {
            meals.forEach(m => {
              const pill = document.createElement('div');
              pill.className = 'meal-pill';
              pill.textContent = m.recipe ? m.recipe.name : (m.title || '?');
              cell.appendChild(pill);
            });
            cell.addEventListener('click', () => this._openRecipe(meals[0]));
          } else {
            const plus = document.createElement('span');
            plus.className = 'plus';
            plus.textContent = '+';
            cell.appendChild(plus);
            cell.addEventListener('click', () => this._openAddModal(dateStr, mealType));
          }
  
          grid.appendChild(cell);
        }
      }
    }
  
    _openRecipe(meal) {
      if (meal.recipe && meal.recipe.slug) {
        window.open(this._mealie_url + '/g/home/r/' + meal.recipe.slug, '_blank');
      } else {
        window.open(this._mealie_url + '/meal-plan', '_blank');
      }
    }
  
    async _openAddModal(date, mealType) {
      this._pendingDate = date;
      this._pendingMealType = mealType;
  
      const d = new Date(date + 'T00:00:00');
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      const s = this.shadowRoot;
  
      s.getElementById('modal-title').textContent =
        `Add ${mealType.charAt(0).toUpperCase() + mealType.slice(1)} — ${dayLabel}`;
  
      s.getElementById('modal-body').innerHTML = `
        <input class="search-input" id="recipe-search" placeholder="Search recipes..." autocomplete="off" />
        <div class="recipe-list" id="recipe-results"><div class="loading-msg">Loading recipes…</div></div>
        <button class="open-mealie-btn" id="open-mealie-btn">Open Mealie Meal Planner ↗</button>
        <div class="status-msg" id="status-msg"></div>
      `;
  
      s.getElementById('open-mealie-btn').addEventListener('click', () => {
        window.open(this._mealie_url + '/meal-plan', '_blank');
      });
      s.getElementById('recipe-search').addEventListener('input', (e) => {
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => this._renderRecipeResults(e.target.value), 250);
      });
  
      s.getElementById('modal-overlay').classList.add('open');
  
      if (this._allRecipes.length === 0) {
        try {
          const data = await this._apiFetch('/api/recipes?perPage=500&orderBy=name&orderDirection=asc');
          this._allRecipes = data.items || data;
        } catch (e) { this._allRecipes = []; }
      }
      this._renderRecipeResults('');
    }
  
    _renderRecipeResults(query) {
      const container = this.shadowRoot.getElementById('recipe-results');
      if (!container) return;
      const q = query.toLowerCase().trim();
      const filtered = q
        ? this._allRecipes.filter(r => r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
        : this._allRecipes;
  
      if (filtered.length === 0) {
        container.innerHTML = '<div class="no-results">No recipes found</div>';
        return;
      }
      container.innerHTML = '';
      filtered.slice(0, 30).forEach(recipe => {
        const item = document.createElement('div');
        item.className = 'recipe-item';
        item.innerHTML = `<div class="recipe-name">${recipe.name}</div>${recipe.description ? `<div class="recipe-desc">${recipe.description}</div>` : ''}`;
        item.addEventListener('click', () => this._addMealPlan(recipe));
        container.appendChild(item);
      });
    }
  
    async _addMealPlan(recipe) {
      const statusEl = this.shadowRoot.getElementById('status-msg');
      if (statusEl) statusEl.textContent = 'Adding…';
      try {
        await this._apiFetch('/api/households/mealplans', {
          method: 'POST',
          body: JSON.stringify({
            date: this._pendingDate,
            entryType: this._pendingMealType,
            recipeId: recipe.id,
            title: recipe.name
          })
        });
        this._closeModal();
        await this._loadMealPlan();
      } catch (e) {
        if (statusEl) statusEl.textContent = 'Error adding meal. Try again.';
        console.error(e);
      }
    }
  
    _closeModal() {
      const overlay = this.shadowRoot.getElementById('modal-overlay');
      if (overlay) overlay.classList.remove('open');
      this._pendingDate = null;
      this._pendingMealType = null;
    }
  
    getCardSize() { return 4; }
  
    static getConfigElement() {
      return document.createElement('mealie-meal-plan-card-editor');
    }
  
    static getStubConfig() {
      return { mealie_url: 'https://mealie.example.com', api_token: '' };
    }
  }
  
  customElements.define('mealie-meal-plan-card', MealieMealPlanCard);
  
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'mealie-meal-plan-card',
    name: 'Mealie Meal Plan',
    description: 'Weekly meal plan grid powered by Mealie',
  });