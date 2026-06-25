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
          font-family: var(--primary-font-family, Roboto, Noto, sans-serif);
          color: var(--primary-text-color, #333);
        }

        /* Week nav */
        .week-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
          gap: 8px;
        }
        .week-nav button {
          flex: 1;
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 24px;
          cursor: pointer;
          font-size: 1em;
          color: var(--secondary-text-color, #555);
          padding: 8px 0;
          line-height: 1;
          font-family: inherit;
          transition: background 0.1s;
        }
        .week-nav button:hover { background: var(--secondary-background-color, #f5f5f5); }
        .week-label {
          flex: 2;
          font-size: 14px;
          font-weight: 700;
          color: var(--primary-text-color, #333);
          cursor: pointer;
          padding: 8px 16px;
          border-radius: 24px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--card-background-color, #fff);
          text-align: center;
          font-family: Roboto, Noto, sans-serif;
          transition: background 0.1s;
        }
        .week-label:hover { background: var(--secondary-background-color, #f5f5f5); }

        /* Day name row */
        .day-name-row {
          display: grid;
          grid-template-columns: 52px repeat(7, 1fr);
          gap: 6px;
          margin-bottom: 8px;
        }
        .day-name-cell {
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 24px;
          text-align: center;
          padding: 6px 12px;
          font-size: 14px;
          font-weight: 700;
          color: var(--primary-text-color, #333);
          font-family: Roboto, Noto, sans-serif;
          white-space: nowrap;
        }
        .day-name-cell.corner-spacer {
          background: transparent;
          border-color: transparent;
        }
        .day-name-cell.today {
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          border-color: var(--divider-color, #e0e0e0);
          font-weight: 700;
        }

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
          font-size: 0.9em;
          font-weight: 400;
          color: var(--secondary-text-color, #888);
          line-height: 1.1;
          margin-top: 1px;
          display: inline-block;
          min-width: 24px;
          border-radius: 4px;
          padding: 1px 4px;
          font-family: Roboto, Noto, sans-serif;
        }
        .day-header.today .day-num {
          background: var(--accent-color, #ff9800);
          color: #fff;
          font-weight: 400;
        }
        .day-header.past .day-num {
          color: var(--disabled-text-color, #ccc);
        }

        .corner { background: var(--card-background-color, #fff); }

        /* Meal type label */
        .meal-label {
          background: var(--card-background-color, #fff);
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
        .meal-cell:hover { background: rgba(0,0,0,0.03); }
        .meal-cell.past { background: var(--card-background-color, #fff); }
        .meal-cell.past:hover { background: rgba(0,0,0,0.03); }

        .meal-cell.empty .plus {
          font-size: 1.2em;
          color: var(--disabled-text-color, #ddd);
          font-family: sans-serif;
        }
        .meal-cell.empty:hover .plus { color: var(--secondary-text-color, #bbb); }

        .meal-pill {
          position: relative;
          background: rgba(3,169,244,0.10);
          color: var(--primary-color, #03a9f4);
          border-radius: 6px;
          padding: 3px 20px 3px 5px;
          font-size: 0.62em;
          line-height: 1.3;
          word-break: break-word;
          width: 100%;
          text-align: center;
          font-family: inherit;
          cursor: pointer;
        }
        .meal-pill:hover {
          background: rgba(3,169,244,0.18);
        }
        .meal-pill .pill-remove {
          display: none;
          position: absolute;
          right: 3px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 1.1em;
          line-height: 1;
          color: var(--primary-color, #03a9f4);
          padding: 0 2px;
          font-family: sans-serif;
        }
        .meal-pill:hover .pill-remove {
          display: block;
        }
        .meal-pill .pill-remove:hover {
          color: #e53935;
        }
        .meal-cell-add {
          display: none;
          font-size: 0.7em;
          color: var(--disabled-text-color, #ccc);
          cursor: pointer;
          padding: 1px 4px;
          border-radius: 4px;
          margin-top: 2px;
          font-family: sans-serif;
          line-height: 1;
          align-self: center;
        }
        .meal-cell:hover .meal-cell-add { display: block; }
        .meal-cell-add:hover { color: var(--primary-color, #03a9f4) !important; }

        .meal-cell.past .meal-pill {
          background: rgba(0,0,0,0.06);
          color: var(--secondary-text-color, #999);
          padding: 3px 20px 3px 5px;
        }
        .meal-cell.past .meal-pill .pill-remove {
          color: var(--secondary-text-color, #999);
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
          border-color: var(--primary-color, #03a9f4);
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
          background: rgba(3,169,244,0.06);
          border-color: var(--primary-color, #03a9f4);
        }
        .recipe-item .recipe-name { color: var(--primary-text-color, #222); }
        .recipe-item:hover .recipe-name { color: var(--primary-color, #03a9f4); }
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

        /* Shopping list button */
        .shop-btn {
          display: block;
          width: 100%;
          margin-top: 10px;
          padding: 9px;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          border: none;
          border-radius: 24px;
          cursor: pointer;
          font-size: 0.85em;
          font-family: Roboto, Noto, sans-serif;
          font-weight: 700;
          text-align: center;
        }
        .shop-btn:hover { opacity: 0.88; }

        /* Shopping modal specifics */
        .shop-recipe-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .shop-recipe-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border: 1px solid var(--divider-color, #efefef);
          border-radius: 8px;
          background: var(--secondary-background-color, #fafafa);
          font-size: 0.85em;
          cursor: pointer;
        }
        .shop-recipe-item input[type=checkbox] { cursor: pointer; width: 16px; height: 16px; flex-shrink: 0; }
        .shop-recipe-item label { cursor: pointer; color: var(--primary-text-color, #222); flex: 1; font-family: Roboto, Noto, sans-serif; }
        .shop-qty-control { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .shop-qty-btn {
          background: var(--secondary-background-color, #f0f0f0);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 4px;
          width: 22px; height: 22px;
          cursor: pointer;
          font-size: 0.9em;
          display: flex; align-items: center; justify-content: center;
          padding: 0; line-height: 1;
        }
        .shop-qty-btn:hover { background: var(--divider-color, #ddd); }
        .shop-qty-val { font-size: 0.85em; min-width: 18px; text-align: center; font-family: Roboto, Noto, sans-serif; color: var(--primary-text-color, #333); }
        .shop-options {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 0 14px;
          border-top: 1px solid var(--divider-color, #eee);
          font-size: 0.84em;
          color: var(--secondary-text-color, #666);
          font-family: Roboto, Noto, sans-serif;
        }
        input[type=checkbox] {
          cursor: pointer;
          width: 16px;
          height: 16px;
          accent-color: var(--primary-color, #03a9f4);
          appearance: auto;
          -webkit-appearance: auto;
          background-color: #fff;
          border: 1px solid #ccc;
          color-scheme: light;
        }
        .shop-add-btn {
          width: 100%;
          padding: 10px;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.88em;
          font-family: Roboto, Noto, sans-serif;
          font-weight: 700;
        }
        .shop-add-btn:hover { opacity: 0.88; }
        .shop-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .shop-status { font-size: 0.78em; text-align: center; padding: 6px 0 0; color: var(--disabled-text-color, #bbb); font-family: Roboto, Noto, sans-serif; }
        .no-meals-msg { font-size: 0.84em; color: var(--disabled-text-color, #bbb); text-align: center; padding: 16px 0; }
      </style>

      <ha-card>
        <div class="card">
          <div class="week-nav">
            <button id="prev-btn">&#8249;</button>
            <span class="week-label" id="week-label"></span>
            <button id="next-btn">&#8250;</button>
          </div>
          <div class="day-name-row" id="day-name-row"></div>
          <div class="grid" id="grid"></div>
          <button class="shop-btn" id="shop-btn">🛒 Add This Week to Shopping List</button>
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

      <div class="modal-overlay" id="shop-modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3 id="shop-modal-title">Add to Shopping List</h3>
            <button class="modal-close" id="shop-modal-close">&#x2715;</button>
          </div>
          <div id="shop-modal-body"></div>
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
    s.getElementById('shop-btn').addEventListener('click', () => this._openShopModal());
    s.getElementById('shop-modal-close').addEventListener('click', () => this._closeShopModal());
    s.getElementById('shop-modal-overlay').addEventListener('click', (e) => {
      if (e.target === s.getElementById('shop-modal-overlay')) this._closeShopModal();
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
    // Use local date to avoid UTC offset bugs
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  _isToday(d) {
    return this._formatDate(d) === this._formatDate(new Date());
  }

  _isPast(d) {
    const today = new Date(); today.setHours(0,0,0,0);
    const compare = new Date(d); compare.setHours(0,0,0,0);
    return compare < today;
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
    // Populate day name row above grid
    const dayNameRow = this.shadowRoot.getElementById('day-name-row');
    dayNameRow.innerHTML = '';
    const spacer = document.createElement('div');
    spacer.className = 'day-name-cell corner-spacer';
    dayNameRow.appendChild(spacer);
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const cell = document.createElement('div');
      cell.className = 'day-name-cell' + (this._isToday(d) ? ' today' : '');
      cell.textContent = DAYS[i];
      dayNameRow.appendChild(cell);
    }

    // Corner spacer in grid (no day headers in grid anymore)
    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);

    // Date number row inside grid
    const dateCorner = document.createElement('div');
    dateCorner.className = 'corner';
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const el = document.createElement('div');
      el.className = 'day-header' + (this._isToday(d) ? ' today' : this._isPast(d) ? ' past' : '');
      el.innerHTML = `<div class="day-num">${d.getDate()}</div>`;
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
            pill.style.cssText = 'display:flex;flex-direction:row;align-items:center;text-align:left;gap:6px;padding:4px 20px 4px 4px;';

            // Image or placeholder
            if (m.recipe?.image) {
              const img = document.createElement('img');
              img.className = 'meal-pill-image';
              img.style.cssText = 'width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;';
              img.src = `${this._mealie_url}/api/media/recipes/${m.recipe.id}/images/min-original.webp`;
              img.alt = '';
              img.onerror = () => {
                const placeholder = document.createElement('div');
                placeholder.className = 'meal-pill-image-placeholder';
                placeholder.style.cssText = 'width:28px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(3,169,244,0.1);display:flex;align-items:center;justify-content:center;font-size:0.9em;';
                placeholder.textContent = '🍽';
                img.replaceWith(placeholder);
              };
              pill.appendChild(img);
            } else {
              const placeholder = document.createElement('div');
              placeholder.className = 'meal-pill-image-placeholder';
              placeholder.style.cssText = 'width:28px;height:28px;border-radius:4px;flex-shrink:0;background:rgba(3,169,244,0.1);display:flex;align-items:center;justify-content:center;font-size:0.9em;';
              placeholder.textContent = '🍽';
              pill.appendChild(placeholder);
            }

            const nameSpan = document.createElement('span');
            nameSpan.className = 'meal-pill-name';
            nameSpan.textContent = m.recipe ? m.recipe.name : (m.title || '?');
            pill.appendChild(nameSpan);

            const removeBtn = document.createElement('span');
            removeBtn.className = 'pill-remove';
            removeBtn.textContent = '✕';
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this._removeMeal(m);
            });
            pill.appendChild(removeBtn);

            pill.addEventListener('click', () => this._openRecipe(m));
            cell.appendChild(pill);
          });

          // Add another meal button
          const addMore = document.createElement('span');
          addMore.className = 'meal-cell-add';
          addMore.textContent = '+ add';
          addMore.addEventListener('click', (e) => {
            e.stopPropagation();
            this._openAddModal(dateStr, mealType);
          });
          cell.appendChild(addMore);
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

  async _removeMeal(meal) {
    const id = meal.id || meal.mealplan_id;
    if (!id) return;
    try {
      await this._apiFetch('/api/households/mealplans/' + id, { method: 'DELETE' });
      await this._loadMealPlan();
    } catch (e) {
      console.error('Mealie: failed to remove meal', e);
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
    s.getElementById('modal-overlay').classList.add('open');

    if (this._allRecipes.length === 0) {
      try {
        const data = await this._apiFetch('/api/recipes?perPage=500&orderBy=name&orderDirection=asc');
        this._allRecipes = data.items || data;
      } catch (e) { this._allRecipes = []; }
    }
    this._renderRecipeResults('');

    // Bind search AFTER recipes are loaded so filtering works immediately
    const searchInput = s.getElementById('recipe-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value || '';
        clearTimeout(this._searchTimeout);
        this._searchTimeout = setTimeout(() => this._renderRecipeResults(val), 250);
      });
    }
  }

  _renderRecipeResults(query) {
    const container = this.shadowRoot.getElementById('recipe-results');
    if (!container) return;
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? this._allRecipes.filter(r => (r.name || '').toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
      : this._allRecipes.filter(r => r.name);

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

  _openShopModal() {
    const s = this.shadowRoot;

    // Collect unique recipes from this week's meal plan, tracking counts
    const recipeCounts = {};
    const recipeMap = {};
    for (const key of Object.keys(this._mealPlanData)) {
      for (const meal of this._mealPlanData[key]) {
        if (meal.recipe && meal.recipe.id) {
          const id = meal.recipe.id;
          recipeCounts[id] = (recipeCounts[id] || 0) + 1;
          recipeMap[id] = meal.recipe;
        }
      }
    }
    const recipes = Object.keys(recipeMap).map(id => ({ ...recipeMap[id], count: recipeCounts[id] }));

    const start = this._getWeekStart(this._weekOffset);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    s.getElementById('shop-modal-title').textContent =
      `Add to Shopping List — ${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;

    if (recipes.length === 0) {
      s.getElementById('shop-modal-body').innerHTML = `
        <div class="no-meals-msg">No recipes planned this week.</div>
      `;
    } else {
      s.getElementById('shop-modal-body').innerHTML = `
        <div class="shop-recipe-list" id="shop-recipe-list">
          ${recipes.map(r => `
            <div class="shop-recipe-item">
              <input type="checkbox" id="shop-r-${r.id}" value="${r.id}" checked />
              <label for="shop-r-${r.id}">${r.name}</label>
              <div class="shop-qty-control">
                <button class="shop-qty-btn" data-id="${r.id}" data-delta="-1">−</button>
                <span class="shop-qty-val" id="shop-qty-${r.id}">${r.count}</span>
                <button class="shop-qty-btn" data-id="${r.id}" data-delta="1">+</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="shop-options">
          <input type="checkbox" id="shop-also-basics" />
          <label for="shop-also-basics">Also add Basics staples to Shopping list</label>
        </div>
        <button class="shop-add-btn" id="shop-add-btn">Add to Shopping List</button>
        <div class="shop-status" id="shop-status"></div>
      `;

      // Qty +/- button handlers
      s.querySelectorAll('.shop-qty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          const delta = parseInt(btn.dataset.delta);
          const valEl = s.getElementById(`shop-qty-${id}`);
          const current = parseInt(valEl.textContent) || 1;
          const next = Math.max(1, current + delta);
          valEl.textContent = next;
        });
      });

      s.getElementById('shop-add-btn').addEventListener('click', () => this._doAddToShoppingList(recipes));
    }

    s.getElementById('shop-modal-overlay').classList.add('open');
  }

  async _doAddToShoppingList(recipes) {
    const s = this.shadowRoot;
    const btn = s.getElementById('shop-add-btn');
    const status = s.getElementById('shop-status');
    const alsoBasics = s.getElementById('shop-also-basics').checked;

    // Get checked recipe IDs
    const checkedIds = recipes
      .filter(r => s.getElementById(`shop-r-${r.id}`)?.checked)
      .map(r => r.id);

    if (checkedIds.length === 0) {
      status.textContent = 'No recipes selected.';
      return;
    }

    btn.disabled = true;
    status.textContent = 'Fetching shopping lists…';

    try {
      // Get all shopping lists to find the right ones
      const listsData = await this._apiFetch('/api/households/shopping/lists?perPage=50');
      const lists = listsData.items || listsData;
      console.log('Mealie shopping lists:', lists.map(l => ({ id: l.id, name: l.name })));

      const shoppingList = lists.find(l => l.name.toLowerCase().includes('shopping'));
      const basicsList = lists.find(l => l.name.toLowerCase().includes('basic'));

      console.log('Found shopping list:', shoppingList?.id, shoppingList?.name);
      console.log('Found basics list:', basicsList?.id, basicsList?.name);

      if (!shoppingList) {
        status.textContent = 'Could not find Shopping list.';
        btn.disabled = false;
        return;
      }

      let added = 0;
      for (const recipeId of checkedIds) {
        const qtyEl = s.getElementById(`shop-qty-${recipeId}`);
        const scale = qtyEl ? parseInt(qtyEl.textContent) || 1 : 1;
        status.textContent = `Adding recipe ${++added} of ${checkedIds.length}…`;
        await this._apiFetch(`/api/households/shopping/lists/${shoppingList.id}/recipe/${recipeId}?scale=${scale}`, { method: 'POST' });
      }

      // Copy items from Basics list into Shopping list
      if (alsoBasics && basicsList) {
        status.textContent = 'Adding Basics staples…';
        const [basicsData, foodsData] = await Promise.all([
          this._apiFetch(`/api/households/shopping/lists/${basicsList.id}`),
          this._apiFetch('/api/foods?perPage=500'),
        ]);
        const items = basicsData.listItems || [];
        const allFoods = foodsData.items || foodsData;
        console.log('Mealie basics item 0:', items[0]);
        console.log('Mealie basics item 1:', items[1]);
        console.log('Mealie foods matching basics 0 and 1:', allFoods.filter(f => f.id === items[0]?.foodId || f.id === items[1]?.foodId));
        const onHandIds = new Set(
          allFoods.filter(f => f.onHand).map(f => f.id)
        );
        for (const item of items) {
          if (item.checked || onHandIds.has(item.foodId)) continue;
          await this._apiFetch(`/api/households/shopping/items`, {
            method: 'POST',
            body: JSON.stringify({
              shoppingListId: shoppingList.id,
              note: item.foodId ? '' : (item.note || item.display || ''),
              quantity: item.quantity || 1,
              unitId: item.unitId || null,
              foodId: item.foodId || null,
              isFood: item.isFood || false,
            })
          });
        }
      }

      status.textContent = `✓ Added ${checkedIds.length} recipe${checkedIds.length > 1 ? 's' : ''} to shopping list!`;
      btn.disabled = false;
      setTimeout(() => this._closeShopModal(), 1500);
    } catch (e) {
      console.error('Mealie: failed to add to shopping list', e);
      status.textContent = 'Error adding to shopping list. Try again.';
      btn.disabled = false;
    }
  }

  _closeShopModal() {
    this.shadowRoot.getElementById('shop-modal-overlay').classList.remove('open');
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