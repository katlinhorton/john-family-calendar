class MealieShoppingMobileCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      this._items = [];
      this._checkedItems = [];
      this._labelSettings = [];
      this._initialized = false;
      this._loading = false;
      this._checkedOpen = false;
    }
  
    setConfig(config) {
      this._config = config;
      this._mealie_url = config.mealie_url || '';
      this._api_token = config.api_token || '';
      this._list_name = config.list_name || 'shopping';
      this._render();
    }
  
    set hass(hass) {
      this._hass = hass;
      if (!this._initialized) {
        this._initialized = true;
        this._init();
      }
    }
  
    async _init() {
      await this._loadListId();
      await this._loadItems();
  
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
  
    async _loadListId() {
      try {
        const data = await this._apiFetch('/api/households/shopping/lists?perPage=50');
        const lists = data.items || data;
        const match = lists.find(l => l.name.toLowerCase().includes(this._list_name.toLowerCase()));
        this._listId = match?.id || null;
      } catch (e) {
        console.error('Mealie mobile: failed to load list', e);
        const list = this.shadowRoot.getElementById('items-list');
        if (list) list.innerHTML = `<div class="empty-msg" style="color:#e53935">Error loading list:<br>${e.message}</div>`;
      }
    }
  
    async _loadItems() {
      if (!this._listId || this._loading) return;
      this._loading = true;
      try {
        const listData = await this._apiFetch(`/api/households/shopping/lists/${this._listId}`);
        const allItems = listData.listItems || [];
        this._labelSettings = listData.labelSettings || [];
        this._items = allItems.filter(i => !i.checked);
        this._checkedItems = allItems.filter(i => i.checked);
        this._renderItems();
      } catch (e) {
        console.error('Mealie mobile: failed to load items', e);
        const list = this.shadowRoot.getElementById('items-list');
        if (list) list.innerHTML = `<div class="empty-msg" style="color:#e53935">Error loading items:<br>${e.message}</div>`;
      } finally {
        this._loading = false;
      }
    }
  
    async _checkItem(item) {
      try {
        await this._apiFetch('/api/households/shopping/items', {
          method: 'PUT',
          body: JSON.stringify([{ ...item, checked: true }])
        });
        await this._loadItems();
      } catch (e) {
        console.error('Mealie mobile: failed to check item', e);
      }
    }
  
    async _uncheckItem(item) {
      try {
        await this._apiFetch('/api/households/shopping/items', {
          method: 'PUT',
          body: JSON.stringify([{ ...item, checked: false }])
        });
        await this._loadItems();
      } catch (e) {
        console.error('Mealie mobile: failed to uncheck item', e);
      }
    }
  
    _formatItemLabel(item) {
      const foodName = item.food?.name || '';
      const note = item.note || '';
      let name, displayNote = '';
      if (foodName) {
        name = foodName;
        if (note && note.toLowerCase() !== foodName.toLowerCase()) displayNote = note;
      } else {
        name = note || item.display || '';
      }
      const qty = item.quantity && item.quantity > 0 ? item.quantity : null;
      const unit = item.unit?.abbreviation || item.unit?.name || '';
      let qtyStr = qty ? `${qty}${unit ? ' ' + unit : ''}` : (unit || '');
      return { name, qtyStr, note: displayNote };
    }
  
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          :host { display: block; }
  
          .card {
            background: rgba(255,255,255,0.6);
            border-radius: 24px;
            padding: 16px;
            font-family: Roboto, Noto, sans-serif;
            color: var(--primary-text-color, #333);
          }
  
          .card-title {
            font-size: 1.1em;
            font-weight: 700;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
  
          .refresh-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--secondary-text-color, #888);
            font-size: 1.2em;
            padding: 4px 8px;
            border-radius: 4px;
          }
          .refresh-btn:hover { background: rgba(0,0,0,0.05); }
  
          .category-header {
            font-size: 0.72em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 14px 4px 6px;
            display: flex;
            align-items: center;
            gap: 6px;
            color: var(--secondary-text-color, #888);
          }
          .category-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
          }
  
          .item-row {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 12px 8px;
            border-radius: 10px;
            border-bottom: 1px solid var(--divider-color, #f0f0f0);
            cursor: pointer;
            transition: background 0.1s;
            -webkit-tap-highlight-color: transparent;
          }
          .item-row:last-child { border-bottom: none; }
          .item-row:active { background: rgba(0,0,0,0.04); }
  
          .item-check {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            border: 2px solid var(--divider-color, #ccc);
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s;
          }
          .item-check.checked {
            background: var(--primary-color, #03a9f4);
            border-color: var(--primary-color, #03a9f4);
            color: #fff;
            font-size: 0.85em;
          }
  
          .item-label {
            flex: 1;
            font-size: 1em;
            line-height: 1.3;
          }
          .item-label.checked {
            text-decoration: line-through;
            color: var(--disabled-text-color, #bbb);
          }
          .item-note {
            font-size: 0.82em;
            color: var(--secondary-text-color, #888);
            font-style: italic;
            margin-left: 4px;
          }
  
          .item-qty {
            font-size: 0.82em;
            color: var(--secondary-text-color, #888);
            flex-shrink: 0;
            text-align: right;
          }
  
          .divider {
            height: 1px;
            background: var(--divider-color, #e8e8e8);
            margin: 12px 0 4px;
          }
  
          .checked-toggle {
            font-size: 0.78em;
            color: var(--secondary-text-color, #888);
            cursor: pointer;
            padding: 8px 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            user-select: none;
          }
  
          .checked-section { display: none; }
          .checked-section.open { display: block; }
  
          .empty-msg {
            font-size: 0.9em;
            color: var(--disabled-text-color, #bbb);
            text-align: center;
            padding: 32px 0;
          }
        </style>
  
        <ha-card>
          <div class="card">
            <div class="card-title">
              <span>Shopping List</span>
              <button class="refresh-btn" id="refresh-btn">↻</button>
            </div>
            <div id="items-list"><div class="empty-msg">Loading…</div></div>
            <div id="checked-wrapper"></div>
          </div>
        </ha-card>
      `;
  
      this.shadowRoot.getElementById('refresh-btn')
        .addEventListener('click', () => this._loadItems());
    }
  
    _renderItems() {
      const list = this.shadowRoot.getElementById('items-list');
      const checkedWrapper = this.shadowRoot.getElementById('checked-wrapper');
  
      // Build label order
      const labelOrder = {};
      this._labelSettings.forEach((ls, idx) => { labelOrder[ls.labelId] = idx; });
  
      if (this._items.length === 0 && this._checkedItems.length === 0) {
        list.innerHTML = '<div class="empty-msg">Your list is empty</div>';
        checkedWrapper.innerHTML = '';
        return;
      }
  
      if (this._items.length === 0) {
        list.innerHTML = '<div class="empty-msg">All done! 🎉</div>';
      } else {
        // Group by category
        const groups = {};
        for (const item of this._items) {
          const labelId = item.labelId || '__none__';
          if (!groups[labelId]) groups[labelId] = { label: item.label, items: [] };
          groups[labelId].items.push(item);
        }
        const sortedGroups = Object.entries(groups).sort(([aId], [bId]) => {
          return (labelOrder[aId] ?? 9999) - (labelOrder[bId] ?? 9999);
        });
  
        list.innerHTML = sortedGroups.map(([labelId, group]) => {
          const labelName = group.label?.name || 'Other';
          const labelColor = group.label?.color || '#ccc';
          const header = `<div class="category-header">
            ${labelId !== '__none__' ? `<span class="category-dot" style="background:${labelColor}"></span>` : ''}
            ${labelName}
          </div>`;
          const rows = group.items.map(item => {
            const { name, qtyStr, note } = this._formatItemLabel(item);
            return `<div class="item-row" data-id="${item.id}">
              <div class="item-check"></div>
              <span class="item-label">${name}${note ? `<span class="item-note">, ${note}</span>` : ''}</span>
              ${qtyStr ? `<span class="item-qty">${qtyStr}</span>` : ''}
            </div>`;
          }).join('');
          return header + rows;
        }).join('');
  
        list.querySelectorAll('.item-row').forEach(row => {
          row.addEventListener('click', () => {
            const item = this._items.find(i => i.id === row.dataset.id);
            if (item) this._checkItem(item);
          });
        });
      }
  
      // Checked section
      if (this._checkedItems.length > 0) {
        checkedWrapper.innerHTML = `
          <div class="divider"></div>
          <div class="checked-toggle" id="checked-toggle">
            <span id="checked-icon">${this._checkedOpen ? '▼' : '▶'}</span>
            Checked (${this._checkedItems.length})
          </div>
          <div class="checked-section${this._checkedOpen ? ' open' : ''}" id="checked-section">
            ${this._checkedItems.map(item => {
              const { name, qtyStr, note } = this._formatItemLabel(item);
              return `<div class="item-row" data-id="${item.id}">
                <div class="item-check checked">✓</div>
                <span class="item-label checked">${name}${note ? `<span class="item-note">, ${note}</span>` : ''}</span>
                ${qtyStr ? `<span class="item-qty">${qtyStr}</span>` : ''}
              </div>`;
            }).join('')}
          </div>
        `;
  
        checkedWrapper.querySelector('#checked-toggle').addEventListener('click', () => {
          this._checkedOpen = !this._checkedOpen;
          const section = checkedWrapper.querySelector('#checked-section');
          const icon = checkedWrapper.querySelector('#checked-icon');
          section.classList.toggle('open', this._checkedOpen);
          icon.textContent = this._checkedOpen ? '▼' : '▶';
        });
  
        checkedWrapper.querySelectorAll('.item-row').forEach(row => {
          row.addEventListener('click', () => {
            const item = this._checkedItems.find(i => i.id === row.dataset.id);
            if (item) this._uncheckItem(item);
          });
        });
      } else {
        checkedWrapper.innerHTML = '';
      }
    }
  
    getCardSize() { return 8; }
    static getStubConfig() {
      return { mealie_url: 'https://mealie.example.com', api_token: '', list_name: 'shopping' };
    }
  }
  
  customElements.define('mealie-shopping-mobile-card', MealieShoppingMobileCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'mealie-shopping-mobile-card',
    name: 'Mealie Shopping Mobile',
    description: 'Mobile-optimized shopping list for in-store use',
  });