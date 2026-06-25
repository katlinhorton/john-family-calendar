class MealieShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._items = [];
    this._searchTimeout = null;
    this._units = [];
    this._loading = false;
    this._initialized = false;
    this._checkedOpen = false;
    this._labelSettings = [];
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
    await Promise.all([this._loadItems(), this._loadUnits()]);

  }

  disconnectedCallback() {
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
    if (!res.ok) throw new Error(`API error ${res.status} ${path}`);
    return res.json();
  }

  async _loadListId() {
    try {
      const data = await this._apiFetch('/api/households/shopping/lists?perPage=50');
      const lists = data.items || data;
      console.log('Mealie shopping: all lists:', lists.map(l => ({ id: l.id, name: l.name })));
      const match = lists.find(l => l.name.toLowerCase().includes(this._list_name.toLowerCase()));
      this._listId = match?.id || null;
      this._listName = match?.name || this._list_name;
      console.log('Mealie shopping: using list:', this._listId, this._listName);
    } catch (e) {
      console.error('Mealie shopping: failed to load list', e);
    }
  }

  async _loadUnits() {
    try {
      const data = await this._apiFetch('/api/units?perPage=200&orderBy=name&orderDirection=asc');
      this._units = data.items || data;
    } catch (e) {
      console.error('Mealie shopping: failed to load units', e);
    }
  }

  async _loadItems() {
    if (!this._listId) return;
    try {
      // Fetch the list directly to get only its items
      const listData = await this._apiFetch(`/api/households/shopping/lists/${this._listId}`);
      console.log('Mealie shopping: list data:', listData);
      const allItems = listData.listItems || [];
      this._labelSettings = listData.labelSettings || [];
      this._items = allItems.filter(i => !i.checked);
      this._checkedItems = allItems.filter(i => i.checked);
      console.log('Mealie shopping: unchecked:', this._items.length, 'checked:', this._checkedItems.length);
      this._renderItems();
    } catch (e) {
      console.error('Mealie shopping: failed to load items', e);
      const list = this.shadowRoot.getElementById('items-list');
      if (list) list.innerHTML = `<div class="loading-msg" style="color:#e53935">Error: ${e.message}</div>`;
    } finally {
      this._loading = false;
    }
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
          font-size: 1em;
          font-weight: 700;
          margin-bottom: 14px;
          color: var(--primary-text-color, #333);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--secondary-text-color, #888);
          font-size: 1em;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .refresh-btn:hover { background: rgba(0,0,0,0.05); }
        .check-all-btn {
          background: none;
          border: 1px solid var(--divider-color, #e0e0e0);
          cursor: pointer;
          color: var(--secondary-text-color, #888);
          font-size: 0.75em;
          padding: 2px 8px;
          border-radius: 6px;
          font-family: inherit;
        }
        .check-all-btn:hover { background: rgba(0,0,0,0.05); }

        /* Add item input */
        .add-row {
          display: flex;
          gap: 8px;
          margin-bottom: 14px;
          position: relative;
        }
        .add-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 24px;
          font-size: 0.88em;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          font-family: inherit;
        }
        .add-input:focus { outline: none; border-color: var(--primary-color, #03a9f4); }

        .add-btn {
          padding: 8px 16px;
          background: var(--primary-color, #03a9f4);
          color: #fff;
          border: none;
          border-radius: 24px;
          cursor: pointer;
          font-size: 0.88em;
          font-family: inherit;
          font-weight: 700;
          white-space: nowrap;
        }
        .add-btn:hover { opacity: 0.88; }

        /* Autocomplete dropdown */
        .autocomplete {
          position: absolute;
          top: 100%;
          left: 0;
          right: 60px;
          background: var(--card-background-color, #fff);
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          z-index: 999;
          max-height: 200px;
          overflow-y: auto;
          display: none;
        }
        .autocomplete.open { display: block; }
        .autocomplete-item {
          padding: 8px 14px;
          font-size: 0.85em;
          cursor: pointer;
          color: var(--primary-text-color, #333);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .autocomplete-item:hover { background: rgba(3,169,244,0.08); }
        .autocomplete-item .source-tag {
          font-size: 0.72em;
          color: var(--disabled-text-color, #bbb);
          margin-left: auto;
        }
        .autocomplete-item:first-child { border-radius: 12px 12px 0 0; }
        .autocomplete-item:last-child { border-radius: 0 0 12px 12px; }

        /* Items list */
        .items-list { display: flex; flex-direction: column; gap: 2px; }

        .item-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 10px;
          border-radius: 8px;
          transition: background 0.1s;
        }
        .item-row:hover { background: rgba(0,0,0,0.03); }

        .item-row input[type=checkbox] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          flex-shrink: 0;
          accent-color: var(--primary-color, #03a9f4);
          color-scheme: light;
        }

        .item-label {
          flex: 1;
          font-size: 0.88em;
          color: var(--primary-text-color, #333);
          line-height: 1.3;
        }
        .item-label .item-qty {
          font-size: 0.8em;
          color: var(--secondary-text-color, #888);
          margin-left: 4px;
        }

        .item-delete {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--disabled-text-color, #ccc);
          font-size: 0.9em;
          padding: 2px 4px;
          border-radius: 4px;
          opacity: 0;
          transition: opacity 0.1s;
          font-family: sans-serif;
        }
        .item-row:hover .item-delete { opacity: 1; }
        .item-delete:hover { color: #e53935; background: rgba(229,57,53,0.08); }

        .divider {
          height: 1px;
          background: var(--divider-color, #e8e8e8);
          margin: 10px 0;
        }

        .checked-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .checked-toggle {
          font-size: 0.78em;
          color: var(--secondary-text-color, #888);
          cursor: pointer;
          padding: 4px 0;
          display: flex;
          align-items: center;
          gap: 4px;
          user-select: none;
        }
        .checked-toggle:hover { color: var(--primary-text-color, #555); }
        .delete-all-btn {
          font-size: 0.72em;
          color: #e53935;
          background: none;
          border: 1px solid rgba(229,57,53,0.3);
          border-radius: 6px;
          padding: 2px 8px;
          cursor: pointer;
          font-family: inherit;
        }
        .delete-all-btn:hover { background: rgba(229,57,53,0.08); }

        .checked-section { display: none; }
        .checked-section.open { display: block; }
        .checked-section .item-label { text-decoration: line-through; color: var(--disabled-text-color, #bbb); }

        .category-header {
          font-size: 0.72em;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 10px 10px 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .category-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .category-name {
          color: var(--secondary-text-color, #888);
        }

        /* Quantity + unit controls */
        .item-qty-control {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }
        .item-qty-val {
          font-size: 0.8em;
          min-width: 28px;
          text-align: center;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          color: var(--secondary-text-color, #888);
          border: 1px solid transparent;
        }
        .item-qty-val:hover { border-color: var(--divider-color, #e0e0e0); background: var(--secondary-background-color, #f5f5f5); }
        .item-qty-input {
          font-size: 0.8em;
          width: 42px;
          text-align: center;
          border: 1px solid var(--primary-color, #03a9f4);
          border-radius: 4px;
          padding: 2px 4px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          font-family: inherit;
        }
        .item-qty-input:focus { outline: none; }
        .item-unit-val {
          font-size: 0.75em;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          color: var(--secondary-text-color, #888);
          border: 1px solid transparent;
          max-width: 60px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .item-unit-val:hover { border-color: var(--divider-color, #e0e0e0); background: var(--secondary-background-color, #f5f5f5); }
        .item-unit-select {
          font-size: 0.75em;
          border: 1px solid var(--primary-color, #03a9f4);
          border-radius: 4px;
          padding: 2px 2px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          font-family: inherit;
          max-width: 80px;
        }
        .item-unit-select:focus { outline: none; }

        /* Add row qty */
        .add-qty {
          width: 52px;
          padding: 8px 6px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 24px;
          font-size: 0.88em;
          text-align: center;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #333);
          font-family: inherit;
          flex-shrink: 0;
        }
        .add-qty:focus { outline: none; border-color: var(--primary-color, #03a9f4); }

        .empty-msg {
          font-size: 0.85em;
          color: var(--disabled-text-color, #bbb);
          text-align: center;
          padding: 20px 0;
        }

        .loading-msg {
          font-size: 0.85em;
          color: var(--disabled-text-color, #bbb);
          text-align: center;
          padding: 20px 0;
        }
      </style>

      <ha-card>
        <div class="card">
          <div class="card-title">
            <span id="list-title">Shopping List</span>
            <div style="display:flex;gap:6px;align-items:center">
              <button class="check-all-btn" id="check-all-btn" title="Check all">✓ All</button>
              <button class="refresh-btn" id="refresh-btn" title="Refresh">↻</button>
            </div>
          </div>

          <div class="add-row">
            <input class="add-input" id="add-input" placeholder="Add item…" autocomplete="off" />
            <div class="autocomplete" id="autocomplete"></div>
            <input class="add-qty" id="add-qty" type="number" min="1" value="1" />
            <button class="add-btn" id="add-btn">Add</button>
          </div>

          <div class="items-list" id="items-list">
            <div class="loading-msg">Loading…</div>
          </div>

          <div id="checked-section-wrapper"></div>
        </div>
      </ha-card>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    const s = this.shadowRoot;

    s.getElementById('refresh-btn').addEventListener('click', () => this._loadItems());
    s.getElementById('check-all-btn').addEventListener('click', async () => {
      const btn = s.getElementById('check-all-btn');
      btn.textContent = '…';
      await this._checkAllItems();
    });


    const input = s.getElementById('add-input');
    const autocomplete = s.getElementById('autocomplete');

    input.addEventListener('input', () => {
      input.dataset.selectedFoodId = '';
      clearTimeout(this._searchTimeout);
      this._searchTimeout = setTimeout(() => this._updateAutocomplete(input.value), 150);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const qty = parseFloat(s.getElementById('add-qty').value) || 1;
        const highlighted = autocomplete.querySelector('.highlighted');
        if (highlighted) {
          this._selectAutocomplete(highlighted.dataset.note, highlighted.dataset.foodId || null, qty);
        } else if (input.value.trim()) {
          const foodId = input.dataset.selectedFoodId || null;
          this._addItem(input.value.trim(), foodId, qty);
        }
        e.preventDefault();
      }
      if (e.key === 'ArrowDown') {
        this._moveHighlight(1);
        e.preventDefault();
      }
      if (e.key === 'ArrowUp') {
        this._moveHighlight(-1);
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        autocomplete.classList.remove('open');
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => autocomplete.classList.remove('open'), 150);
    });

    s.getElementById('add-btn').addEventListener('click', () => {
      const val = input.value.trim();
      const qty = parseFloat(s.getElementById('add-qty').value) || 1;
      const foodId = input.dataset.selectedFoodId || null;
      if (val) this._addItem(val, foodId, qty);
    });
  }

  async _updateAutocomplete(query) {
    const s = this.shadowRoot;
    const autocomplete = s.getElementById('autocomplete');
    const q = query.trim();

    if (!q) {
      autocomplete.classList.remove('open');
      return;
    }

    try {
      const data = await this._apiFetch(`/api/foods?search=${encodeURIComponent(q)}&perPage=10&orderBy=name&orderDirection=asc`);
      const foods = data.items || data;

      if (foods.length === 0) {
        autocomplete.classList.remove('open');
        return;
      }

      autocomplete.innerHTML = foods.map(food => `
        <div class="autocomplete-item" data-note="${food.name}" data-food-id="${food.id}">
          ${food.name}${food.label ? `<span class="source-tag">${food.label.name}</span>` : ''}
        </div>
      `).join('');

      autocomplete.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._selectAutocomplete(item.dataset.note, item.dataset.foodId || null);
        });
      });

      autocomplete.classList.add('open');
    } catch (e) {
      console.error('Mealie shopping: autocomplete error', e);
    }
  }

  _moveHighlight(delta) {
    const autocomplete = this.shadowRoot.getElementById('autocomplete');
    const items = [...autocomplete.querySelectorAll('.autocomplete-item')];
    if (!items.length) return;
    const current = autocomplete.querySelector('.highlighted');
    const currentIdx = current ? items.indexOf(current) : -1;
    if (current) current.classList.remove('highlighted');
    const next = items[Math.max(0, Math.min(items.length - 1, currentIdx + delta))];
    if (next) {
      next.classList.add('highlighted');
      next.style.background = 'rgba(3,169,244,0.12)';
    }
  }

  _selectAutocomplete(note, foodId, qty = 1) {
    const s = this.shadowRoot;
    const input = s.getElementById('add-input');
    input.value = note;
    input.dataset.selectedFoodId = foodId || '';
    s.getElementById('autocomplete').classList.remove('open');
    s.getElementById('add-qty').focus();
  }

  async _addItem(note, foodId, qty = 1) {
    if (!this._listId || !note) return;
    const s = this.shadowRoot;
    s.getElementById('add-input').value = '';
    s.getElementById('add-qty').value = 1;
    s.getElementById('autocomplete').classList.remove('open');

    try {
      await this._apiFetch('/api/households/shopping/items', {
        method: 'POST',
        body: JSON.stringify({
          shoppingListId: this._listId,
          note: foodId ? '' : note,
          quantity: qty,
          foodId: foodId || null,
          isFood: !!foodId,
          checked: false,
        })
      });
      await Promise.all([this._loadItems(), this._loadUnits()]);
    } catch (e) {
      console.error('Mealie shopping: failed to add item', e);
    }
  }

  async _updateItemUnit(item, unitId) {
    const unit = unitId ? this._units.find(u => u.id === unitId) : null;
    try {
      await this._apiFetch('/api/households/shopping/items', {
        method: 'PUT',
        body: JSON.stringify([{ ...item, unitId: unitId || null, unit: unit || null }])
      });
      await this._loadItems();
    } catch (e) {
      console.error('Mealie shopping: failed to update unit', e);
    }
  }

  async _updateItemQty(item, newQty) {
    if (newQty < 0) newQty = 0;
    try {
      await this._apiFetch('/api/households/shopping/items', {
        method: 'PUT',
        body: JSON.stringify([{ ...item, quantity: newQty }])
      });
      await Promise.all([this._loadItems(), this._loadUnits()]);
    } catch (e) {
      console.error('Mealie shopping: failed to update qty', e);
    }
  }

  async _checkAllItems() {
    const items = [...this._items];
    console.log('Mealie: checkAll, items:', items.length);
    if (!items.length) return;
    try {
      const res = await this._apiFetch('/api/households/shopping/items', {
        method: 'PUT',
        body: JSON.stringify(items.map(i => ({ ...i, checked: true })))
      });
      console.log('Mealie: checkAll response:', res);
      this._checkedOpen = true;
      await this._loadItems();
    } catch (e) {
      console.error('Mealie shopping: failed to check all', e);
    }
  }

  async _uncheckAllItems() {
    const items = [...this._checkedItems];
    console.log('Mealie: uncheckAll, items:', items.length);
    if (!items.length) return;
    try {
      const res = await this._apiFetch('/api/households/shopping/items', {
        method: 'PUT',
        body: JSON.stringify(items.map(i => ({ ...i, checked: false })))
      });
      console.log('Mealie: uncheckAll response:', res);
      this._checkedOpen = false;
      await this._loadItems();
    } catch (e) {
      console.error('Mealie shopping: failed to uncheck all', e);
    }
  }

  async _checkItem(item) {
    try {
      await this._apiFetch(`/api/households/shopping/items`, {
        method: 'PUT',
        body: JSON.stringify([{ ...item, checked: true }])
      });
      await Promise.all([this._loadItems(), this._loadUnits()]);
    } catch (e) {
      console.error('Mealie shopping: failed to check item', e);
    }
  }

  async _uncheckItem(item) {
    try {
      await this._apiFetch(`/api/households/shopping/items`, {
        method: 'PUT',
        body: JSON.stringify([{ ...item, checked: false }])
      });
      await Promise.all([this._loadItems(), this._loadUnits()]);
    } catch (e) {
      console.error('Mealie shopping: failed to uncheck item', e);
    }
  }

  async _deleteItem(item) {
    try {
      await this._apiFetch(`/api/households/shopping/items/${item.id}`, { method: 'DELETE' });
      await Promise.all([this._loadItems(), this._loadUnits()]);
    } catch (e) {
      console.error('Mealie shopping: failed to delete item', e);
    }
  }

  _formatItemLabel(item) {
    const foodName = item.food?.name || '';
    const note = item.note || '';

    let name;
    let displayNote = '';
    if (foodName) {
      name = foodName;
      // Show note separately if it adds info beyond the food name
      if (note && note.toLowerCase() !== foodName.toLowerCase()) {
        displayNote = note;
      }
    } else {
      // Manually added item — just use the note as the label
      name = note || item.display || '';
    }

    const qty = item.quantity && item.quantity > 0 ? item.quantity : null;
    const unit = item.unit?.name || item.unit?.abbreviation || '';
    let qtyStr = '';
    if (qty && qty !== 1) qtyStr = unit ? `${qty} ${unit}` : `${qty}`;
    else if (unit) qtyStr = unit;

    return { name, qtyStr, note: displayNote };
  }

  _renderItems() {
    const s = this.shadowRoot;
    const list = s.getElementById('items-list');
    const checkedWrapper = s.getElementById('checked-section-wrapper');

    if (this._items.length === 0 && this._checkedItems.length === 0) {
      list.innerHTML = '<div class="empty-msg">No items on the list</div>';
      checkedWrapper.innerHTML = '';
      return;
    }

    // Unchecked items grouped by category
    if (this._items.length === 0) {
      list.innerHTML = '<div class="empty-msg">All items checked off!</div>';
    } else {
      // Build label order from labelSettings
      const labelOrder = {};
      this._labelSettings.forEach((ls, idx) => { labelOrder[ls.labelId] = idx; });

      // Group items by label
      const groups = {};
      for (const item of this._items) {
        const labelId = item.labelId || '__none__';
        if (!groups[labelId]) groups[labelId] = { label: item.label, items: [] };
        groups[labelId].items.push(item);
      }

      // Sort groups by labelSettings position, uncategorized last
      const sortedGroups = Object.entries(groups).sort(([aId], [bId]) => {
        const aPos = labelOrder[aId] ?? 9999;
        const bPos = labelOrder[bId] ?? 9999;
        return aPos - bPos;
      });

      list.innerHTML = sortedGroups.map(([labelId, group]) => {
        const labelName = group.label?.name || 'Other';
        const labelColor = group.label?.color || '#ccc';
        const header = labelId !== '__none__'
          ? `<div class="category-header">
               <span class="category-dot" style="background:${labelColor}"></span>
               <span class="category-name">${labelName}</span>
             </div>`
          : `<div class="category-header"><span class="category-name">Other</span></div>`;

        const rows = group.items.map(item => {
          const { name, qtyStr, note } = this._formatItemLabel(item);
          const qty = item.quantity || 0;
          const unit = item.unit?.abbreviation || item.unit?.name || '';
          const qtyDisplay = qty > 0 ? `${qty}${unit ? ' ' + unit : ''}` : '–';
          return `
            <div class="item-row" data-id="${item.id}">
              <input type="checkbox" data-id="${item.id}" />
              <div class="item-qty-control">
                <span class="item-qty-val" data-id="${item.id}" data-qty="${qty}">${qty > 0 ? qty : '–'}</span>
                <span class="item-unit-val" data-id="${item.id}" data-unit-id="${item.unitId || ''}">${unit || 'unit'}</span>
              </div>
              <span class="item-label">${name}${note ? `<span style="font-style:italic;color:var(--secondary-text-color,#888);font-size:0.88em;margin-left:4px">${note}</span>` : ''}</span>
              <button class="item-delete" data-id="${item.id}" title="Remove">✕</button>
            </div>
          `;
        }).join('');

        return header + rows;
      }).join('');

      list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const item = this._items.find(i => i.id === cb.dataset.id);
          if (item) this._checkItem(item);
        });
      });

      list.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = this._items.find(i => i.id === btn.dataset.id);
          if (item) this._deleteItem(item);
        });
      });

      // Click qty val to edit inline
      list.querySelectorAll('.item-qty-val').forEach(val => {
        val.addEventListener('click', () => {
          const item = this._items.find(i => i.id === val.dataset.id);
          if (!item) return;
          const input = document.createElement('input');
          input.className = 'item-qty-input';
          input.type = 'number';
          input.min = '0';
          input.value = item.quantity || 0;
          val.replaceWith(input);
          input.focus();
          input.select();
          const commit = () => {
            const newQty = parseFloat(input.value) || 0;
            this._updateItemQty(item, newQty);
          };
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { this._renderItems(); }
          });
        });
      });

      // Click unit val to show dropdown
      list.querySelectorAll('.item-unit-val').forEach(val => {
        val.addEventListener('click', () => {
          const item = this._items.find(i => i.id === val.dataset.id);
          if (!item) return;
          const select = document.createElement('select');
          select.className = 'item-unit-select';
          // No unit option
          const noneOpt = document.createElement('option');
          noneOpt.value = '';
          noneOpt.textContent = '(none)';
          if (!item.unitId) noneOpt.selected = true;
          select.appendChild(noneOpt);
          // All units
          for (const u of this._units) {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.name;
            if (u.id === item.unitId) opt.selected = true;
            select.appendChild(opt);
          }
          val.replaceWith(select);
          select.focus();
          const commit = () => {
            this._updateItemUnit(item, select.value || null);
          };
          select.addEventListener('blur', commit);
          select.addEventListener('change', commit);
        });
      });
    }

    // Checked items section
    if (this._checkedItems.length > 0) {
      checkedWrapper.innerHTML = `
        <div class="divider"></div>
        <div class="checked-header">
          <div class="checked-toggle" id="checked-toggle">
            <span id="checked-toggle-icon">${this._checkedOpen ? '▼' : '▶'}</span>
            Checked (${this._checkedItems.length})
          </div>
          <div style="display:flex;gap:6px">
            <button class="delete-all-btn" id="uncheck-all-btn">Restore all</button>
            <button class="delete-all-btn" id="delete-all-btn">Delete all</button>
          </div>
        </div>
        <div class="checked-section${this._checkedOpen ? ' open' : ''}" id="checked-section">
          ${this._checkedItems.map(item => {
            const { name, qtyStr } = this._formatItemLabel(item);
            return `
              <div class="item-row" data-id="${item.id}">
                <input type="checkbox" data-id="${item.id}" checked />
                <span class="item-label">
                  ${name}${qtyStr ? `<span class="item-qty">(${qtyStr})</span>` : ''}
                </span>
                <button class="item-delete" data-id="${item.id}" title="Remove">✕</button>
              </div>
            `;
          }).join('')}
        </div>
      `;

      checkedWrapper.querySelector('#checked-toggle').addEventListener('click', () => {
        const section = checkedWrapper.querySelector('#checked-section');
        const icon = checkedWrapper.querySelector('#checked-toggle-icon');
        this._checkedOpen = !this._checkedOpen;
        section.classList.toggle('open', this._checkedOpen);
        icon.textContent = this._checkedOpen ? '▼' : '▶';
      });

      checkedWrapper.querySelector('#delete-all-btn').addEventListener('click', async () => {
        const btn = checkedWrapper.querySelector('#delete-all-btn');
        btn.textContent = '…';
        for (const item of [...this._checkedItems]) {
          await this._apiFetch(`/api/households/shopping/items/${item.id}`, { method: 'DELETE' });
        }
        await this._loadItems();
      });

      checkedWrapper.querySelector('#uncheck-all-btn').addEventListener('click', async () => {
        const btn = checkedWrapper.querySelector('#uncheck-all-btn');
        btn.textContent = '…';
        this._checkedOpen = false;
        await this._uncheckAllItems();
      });

      checkedWrapper.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          const item = this._checkedItems.find(i => i.id === cb.dataset.id);
          if (item) this._uncheckItem(item);
        });
      });

      checkedWrapper.querySelectorAll('.item-delete').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = this._checkedItems.find(i => i.id === btn.dataset.id);
          if (item) this._deleteItem(item);
        });
      });
    } else {
      checkedWrapper.innerHTML = '';
    }

    // Update title
    const titleEl = s.getElementById('list-title');
    if (titleEl) titleEl.textContent = this._listName.charAt(0).toUpperCase() + this._listName.slice(1);
  }

  getCardSize() { return 6; }

  static getStubConfig() {
    return { mealie_url: 'https://mealie.example.com', api_token: '', list_name: 'shopping' };
  }
}

customElements.define('mealie-shopping-list-card', MealieShoppingListCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'mealie-shopping-list-card',
  name: 'Mealie Shopping List',
  description: 'Shopping list with autocomplete powered by Mealie',
});