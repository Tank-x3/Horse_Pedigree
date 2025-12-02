window.App = window.App || {};

// --- UI操作・画面描画ロジック ---
window.App.UI = {
    // --- 初期化・生成系 ---
    initUI: function() {
        App.Logger.add('UI', 'initUI started');
        this.initTheme(); // ★追加
        this.initFormPreviewSync();
        this.initResponsiveTabs();
        this.initAutocomplete();
        this.initInputValidation();
        this.initSimpleModeToggle();
    },

    initDOM: function() {
        this.createFormGroups();
        this.createPreviewTable();
    },

    createFormGroups: function() {
        const { ALL_IDS, GENERATION_LABELS } = App.Consts;
        const { getGeneration } = App.Utils;
        
        const container = document.getElementById('dynamic-form-container');
        if (!container) return;
        container.innerHTML = '';

        ALL_IDS.forEach(id => {
            const gen = getGeneration(id);
            const labelInfo = GENERATION_LABELS[id] || { label: id.toUpperCase(), tag: gen === 3 ? 'h4' : 'h5' };
            const group = document.createElement('div');
            group.className = 'horse-input-group';
            group.dataset.generation = gen;
            group.dataset.horseId = id;

            const header = document.createElement(labelInfo.tag);
            // ★変更: クリアボタンをSVGアイコン化、通知エリアを独立
            header.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <span>${labelInfo.label}</span>
                    <button type="button" class="clear-ancestor-btn" data-target-id="${id}">
                        <svg viewBox="0 0 24 24"><path d="M12.6,16.4l-4.2-4.2c-1.6,1.6-4.2,1.6-5.8,0c-1.6-1.6-1.6-4.2,0-5.8l3.2-3.2c1.6-1.6,4.2-1.6,5.8,0l0.7,0.7 L10.9,5.3L10.2,4.6c-0.8-0.8-2.1-0.8-2.9,0L4.1,7.8c-0.8,0.8-0.8,2.1,0,2.9c0.8,0.8,2.1,0.8,2.9,0l4.2,4.2L12.6,16.4z M19.9,4.1 c0.8,0.8,0.8,2.1,0,2.9l-4.2,4.2l-1.4-1.4l4.2-4.2c0.8-0.8,2.1-0.8,2.9,0c0.8,0.8,0.8,2.1,0,2.9l-3.2,3.2c-0.8,0.8-2.1,0.8-2.9,0 l-0.7-0.7l-1.4,1.4l0.7,0.7c1.6,1.6,4.2,1.6,5.8,0l3.2-3.2C21.5,8.3,21.5,5.7,19.9,4.1z M3.6,21.9L2.1,20.4l18.4-18.4l1.4,1.4 L3.6,21.9z"/></svg>
                        <span style="font-size:0.75em; margin-left:2px; vertical-align:middle;">この馬を含む系統をクリア</span>
                    </button>
                    <label class="fictional-check-label" style="margin-left:auto;"><input type="checkbox" id="${id}-is-fictional"> 架空馬</label>
                </div>
            `;
            group.appendChild(header);

            // ダミー馬通知エリア（独立行）
            const dummyNotif = document.createElement('div');
            dummyNotif.id = `${id}-dummy-notification`;
            dummyNotif.className = 'dummy-notification-area';
            group.appendChild(dummyNotif);
            
            // クリアボタンのイベント登録
            const clearBtn = header.querySelector('.clear-ancestor-btn');
            if(clearBtn) clearBtn.onclick = (e) => this.handleClearAncestors(id);

            const basicRow = document.createElement('div');
            basicRow.className = 'input-row autocomplete-wrapper';
            basicRow.innerHTML = `
                <input type="text" id="${id}-name-ja" class="input-name-ja" placeholder="カナ馬名 (任意)">
                <input type="text" id="${id}-name-en" class="input-name-en" placeholder="欧字馬名 (必須)">
                <input type="number" id="${id}-birth-year" class="input-year" placeholder="生年">
            `;
            group.appendChild(basicRow);

            const details = document.createElement('details');
            details.className = 'details-input';
            details.open = true;
            details.innerHTML = `
                <summary>詳細情報...</summary>
                <div class="input-row">
                    <input type="text" id="${id}-country" class="input-detail" placeholder="生産国">
                    <input type="text" id="${id}-color" class="input-detail" placeholder="毛色">
                    <input type="text" id="${id}-family-no" class="input-detail" placeholder="F-No.">
                    <input type="text" id="${id}-lineage" class="input-lineage" placeholder="系統 (例: Halo系)">
                </div>
                <div class="input-row" style="margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 5px;">
                    <label style="font-size: 0.85em; color: #d9534f; cursor: pointer;">
                        <input type="checkbox" id="${id}-allow-rename" class="allow-rename-check"> 
                        ⚠️ 既存データの馬名を修正する (IDを維持)
                    </label>
                </div>
                </div>
            `;
            group.appendChild(details);
            container.appendChild(group);
        });
    },

    createPreviewTable: function() {
        // テーブル構造定義
        const rows = [
            [{id:'s',rs:16,c:1}, {id:'ss',rs:8,c:2}, {id:'sss',rs:4,c:3}, {id:'ssss',rs:2,c:4}, {id:'sssss',c:5}],
            [{id:'ssssd',c:5}],
            [{id:'sssd',rs:2,c:4}, {id:'sssds',c:5}],
            [{id:'sssdd',c:5}],
            [{id:'ssd',rs:4,c:3}, {id:'ssds',rs:2,c:4}, {id:'ssdss',c:5}],
            [{id:'ssdsd',c:5}],
            [{id:'ssdd',rs:2,c:4}, {id:'ssdds',c:5}],
            [{id:'ssddd',c:5}],
            [{id:'sd',rs:8,c:2}, {id:'sds',rs:4,c:3}, {id:'sdss',rs:2,c:4}, {id:'sdsss',c:5}],
            [{id:'sdssd',c:5}],
            [{id:'sdsd',rs:2,c:4}, {id:'sdsds',c:5}],
            [{id:'sdsdd',c:5}],
            [{id:'sdd',rs:4,c:3}, {id:'sdds',rs:2,c:4}, {id:'sddss',c:5}],
            [{id:'sddsd',c:5}],
            [{id:'sddd',rs:2,c:4}, {id:'sddds',c:5}],
            [{id:'sdddd',c:5}],
            [{id:'d',rs:16,c:1}, {id:'ds',rs:8,c:2}, {id:'dss',rs:4,c:3}, {id:'dsss',rs:2,c:4}, {id:'dssss',c:5}],
            [{id:'dsssd',c:5}],
            [{id:'dssd',rs:2,c:4}, {id:'dssds',c:5}],
            [{id:'dssdd',c:5}],
            [{id:'dsd',rs:4,c:3}, {id:'dsds',rs:2,c:4}, {id:'dsdss',c:5}],
            [{id:'dsdsd',c:5}],
            [{id:'dsdd',rs:2,c:4}, {id:'dsdds',c:5}],
            [{id:'dsddd',c:5}],
            [{id:'dd',rs:8,c:2}, {id:'dds',rs:4,c:3}, {id:'ddss',rs:2,c:4}, {id:'ddsss',c:5}],
            [{id:'ddssd',c:5}],
            [{id:'ddsd',rs:2,c:4}, {id:'ddsds',c:5}],
            [{id:'ddsdd',c:5}],
            [{id:'ddd',rs:4,c:3}, {id:'ddds',rs:2,c:4}, {id:'dddss',c:5}],
            [{id:'dddsd',c:5}],
            [{id:'dddd',rs:2,c:4}, {id:'dddds',c:5}],
            [{id:'ddddd',c:5}]
        ];

        const tbody = document.getElementById('preview-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        rows.forEach(rowCells => {
            const tr = document.createElement('tr');
            rowCells.forEach(cell => {
                const td = document.createElement('td');
                if (cell.id === 's' || cell.id === 'ss' || cell.id === 'sss' || cell.id === 'ssss' || cell.id === 'sssss') {
                    td.className = 'pedigree-cell sire-cell';
                } else {
                    td.className = `pedigree-cell ${cell.id.endsWith('s') ? 'sire-cell' : 'dam-cell'}`;
                }
                if (cell.rs) td.rowSpan = cell.rs;
                td.dataset.col = cell.c;
                td.dataset.horseId = cell.id;

                td.onclick = (e) => this.handleCellClick(cell.id);
                
                td.innerHTML = `
                    <div class="pedigree-cell-content">
                        <span class="horse-name" id="preview-${cell.id}-name">&nbsp;</span>
                        <span class="horse-name-en" id="preview-${cell.id}-name-en"></span>
                        <div class="horse-info-row">
                            <span class="horse-year" id="preview-${cell.id}-year"></span>
                            <span class="horse-color" id="preview-${cell.id}-color"></span>
                        </div>
                        <div class="horse-lineage" id="preview-${cell.id}-lineage"></div>
                        <div class="horse-bottom-row">
                            <span class="horse-family-no" id="preview-${cell.id}-family-no"></span>
                            <span class="horse-country" id="preview-${cell.id}-country"></span>
                        </div>
                    </div>
                `;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    },

    initGenerationSelector: function() {
        const selectors = document.querySelectorAll('input[name="generation"]');
        if (selectors.length === 0) return;
        selectors.forEach(radio => { radio.onclick = () => this.handleGenerationChange(); });
        this.handleGenerationChange();
    },

    handleGenerationChange: function() {
        const selectedRadio = document.querySelector('input[name="generation"]:checked');
        if(!selectedRadio) return;
        const selectedGen = parseInt(selectedRadio.value);
        
        document.querySelectorAll('.horse-input-group[data-generation]').forEach(group => {
            const gen = parseInt(group.dataset.generation);
            if(gen > selectedGen && gen !== 0) group.classList.add('hidden');
            else group.classList.remove('hidden');
        });
        document.querySelectorAll('.pedigree-cell[data-col]').forEach(cell => {
            const col = parseInt(cell.dataset.col);
            if(col > selectedGen) cell.classList.add('hidden');
            else cell.classList.remove('hidden');
        });
    },

    initFormPreviewSync: function() {
        const { ALL_IDS } = App.Consts;
        ALL_IDS.forEach(id => {
            const inputs = [
                `${id}-name-ja`, `${id}-name-en`, `${id}-birth-year`, `${id}-is-fictional`,
                `${id}-country`, `${id}-color`, `${id}-family-no`, `${id}-lineage`
            ];
            inputs.forEach(inId => {
                const el = document.getElementById(inId);
                if(el) {
                    const eventType = el.type === 'checkbox' ? 'change' : 'input';
                    // 入力イベントのログ取り
                    el.addEventListener(eventType, (e) => {
                        // 頻繁に出るため、入力完了に近いタイミング（blurなど）が良いが、
                        // 動作追跡のため簡易的に記録する（大量になるので注意）
                        // App.Logger.add('UI', `Input changed: ${inId}`, { val: el.value, checked: el.checked });
                        this.updatePreview(id);
                        this.updateDummyIndicator(); // ★追加
                    });
                }
            });
            this.updatePreview(id);
        });
    },

    updatePreview: function(id) {
        const ja = document.getElementById(`${id}-name-ja`)?.value.trim();
        const en = document.getElementById(`${id}-name-en`)?.value.trim();
        const year = document.getElementById(`${id}-birth-year`)?.value.trim();
        const isFict = document.getElementById(`${id}-is-fictional`)?.checked;
        
        const country = document.getElementById(`${id}-country`)?.value.trim();
        const color = document.getElementById(`${id}-color`)?.value.trim();
        const lineage = document.getElementById(`${id}-lineage`)?.value.trim();
        const familyNo = document.getElementById(`${id}-family-no`)?.value.trim(); // 追加
        
        // ダミー馬名はプレビューに出さない
        let dispName = ja || en || '&nbsp;';
        if (this.isDummyHorseName(ja)) {
            dispName = '&nbsp;';
        } else if ((ja || en) && isFict) {
            dispName = `【${dispName}】`;
        }

        if (id === 'target') {
            const title = document.getElementById('preview-title');
            const rawName = ja || en;
            const text = rawName ? `${rawName}${year ? ` (${year})` : ''} の血統` : '血統表プレビュー';
            title.textContent = text;
        } else {
            const pName = document.getElementById(`preview-${id}-name`);
            if(!pName) return;
            
            const cellEl = pName.closest('.pedigree-cell');
            const col = parseInt(cellEl?.dataset.col);
            
            if (col === 5) {
                // 5代目はスペースがないので名前と生年のみ（既存通り）
                let text = dispName;
                if ((ja || en) && year) text += `<span class="preview-year-5th"> (${year})</span>`;
                else if (year) text = `<span class="preview-year-5th">(${year})</span>`;
                pName.innerHTML = text;
            } else {
                pName.innerHTML = dispName;
                const pNameEn = document.getElementById(`preview-${id}-name-en`);
                if (pNameEn) pNameEn.textContent = (ja && en) ? en : '';

                const pYear = document.getElementById(`preview-${id}-year`);
                const pColor = document.getElementById(`preview-${id}-color`);
                if (pYear) pYear.innerHTML = year || '&nbsp;';
                if (pColor) pColor.textContent = color || '';

                const pLineage = document.getElementById(`preview-${id}-lineage`);
                const pCountry = document.getElementById(`preview-${id}-country`);
                const pFamily = document.getElementById(`preview-${id}-family-no`); // 追加

                if (pLineage) pLineage.textContent = lineage || '';
                if (pCountry) pCountry.textContent = country || '';
                
                // ★F-No.の表示更新
                if (pFamily) {
                    pFamily.textContent = familyNo || '';
                    pFamily.style.display = familyNo ? 'inline-block' : 'none';
                }
            }
        }
        
        this.updateCrossList();
    },

    updateCrossList: function() {
        const formData = this.getFormDataAsMap();
        const result = App.Pedigree.calculateCrosses(formData);
        
        this.renderCrossList(result.list);
    },

    renderCrossList: function(crosses) {
        const container = document.getElementById('cross-list-container');
        if(!container) return; 

        document.querySelectorAll('.pedigree-cell .horse-name').forEach(el => {
            el.classList.remove('cross-highlight-text');
        });

        container.style.display = 'block';
        let html = '<span class="cross-list-title">5代内クロス:</span> ';

        if (!crosses || crosses.length === 0) {
            html += '<span style="color: #666;">なし</span>';
            container.innerHTML = html;
            return;
        }
        
        crosses.forEach(cross => {
            const pctStr = parseFloat(cross.pct.toFixed(2)) + '%';
            html += `<span class="cross-item"><span class="cross-item-name">${cross.name}</span> ${pctStr} (${cross.gens})</span> `;

            cross.ids.forEach(htmlId => {
                const span = document.getElementById(`preview-${htmlId}-name`);
                if (span) span.classList.add('cross-highlight-text');
            });
        });

        container.innerHTML = html;
    },

    initSimpleModeToggle: function() {
        const toggle = document.getElementById('simple-mode-toggle');
        const table = document.querySelector('.pedigree-table');
        if(toggle && table) {
            toggle.addEventListener('change', () => {
                if(toggle.checked) table.classList.add('simple-mode');
                else table.classList.remove('simple-mode');
            });
        }
    },

    handleCellClick: function(horseId) {
        const formTabBtn = document.querySelector('.tab-button[data-tab="form"]');
        if (formTabBtn) {
            const tabContainer = document.querySelector('.tab-container');
            if (tabContainer && getComputedStyle(tabContainer).display !== 'none') {
                formTabBtn.click();
            }
        }
        const targetInputId = (horseId === 'target') ? 'target-name-ja' : `${horseId}-name-ja`;
        const inputEl = document.getElementById(targetInputId);
        if(inputEl) {
            inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => {
                inputEl.focus();
                inputEl.style.transition = 'background-color 0.3s';
                inputEl.style.backgroundColor = '#fff3cd'; 
                setTimeout(() => { inputEl.style.backgroundColor = ''; }, 1000);
            }, 300);
        }
    },

    getFormDataAsMap: function() {
        const { ALL_IDS } = App.Consts;
        const formData = new Map();
        ALL_IDS.forEach(id => {
            const nameJa = document.getElementById(`${id}-name-ja`).value.trim();
            const nameEn = document.getElementById(`${id}-name-en`).value.trim();
            const year = document.getElementById(`${id}-birth-year`).value.trim();
            
            if (id === 'target' || nameJa || nameEn || year) { 
                const isFictional = document.getElementById(`${id}-is-fictional`).checked;
                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                
                // ★ログ追加: どの要素からUUIDを取得しようとしているか
                const uuid = group ? group.dataset.uuid : null;
                /*
                if (uuid) {
                    App.Logger.add('DATA', `Reading UUID from DOM`, { id, uuid });
                }
                */

                let sireName = '', damName = '';
                if (id === 'target') {
                    sireName = this.getInputValue('s'); damName = this.getInputValue('d');
                } else {
                    const sId = id + 's'; const dId = id + 'd';
                    if (ALL_IDS.includes(sId)) sireName = this.getInputValue(sId);
                    if (ALL_IDS.includes(dId)) damName = this.getInputValue(dId);
                }

                const horse = {
                    id: uuid,
                    name_ja: nameJa, name_en: nameEn, birth_year: year,
                    is_fictional: isFictional,
                    country: document.getElementById(`${id}-country`).value.trim(),
                    color: document.getElementById(`${id}-color`).value.trim(),
                    family_no: document.getElementById(`${id}-family-no`).value.trim(),
                    lineage: document.getElementById(`${id}-lineage`).value.trim(),
                    sire_name: sireName, dam_name: damName
                };
                formData.set(id, horse);
            }
        });
        return formData;
    },

    getInputValue: function(id) {
        const ja = document.getElementById(`${id}-name-ja`);
        const en = document.getElementById(`${id}-name-en`);
        if (ja && ja.value) return ja.value.trim();
        if (en && en.value) return en.value.trim();
        return '';
    },

    initInputValidation: function() {
        const { ALL_IDS } = App.Consts;
        ALL_IDS.forEach(id => {
            const jaInput = document.getElementById(`${id}-name-ja`);
            const enInput = document.getElementById(`${id}-name-en`);
            const fictCheck = document.getElementById(`${id}-is-fictional`);
            if(!jaInput || !enInput || !fictCheck) return;

            // --- 修正: 名前入力時に、紐付いているUUIDをクリアする ---
            const clearUUID = (e) => {
                // プログラムによる入力は無視
                if (e && !e.isTrusted) return;

                // ★追加: 「馬名修正モード」がONなら、IDをクリアせずに維持する
                const allowRename = document.getElementById(`${id}-allow-rename`)?.checked;
                if (allowRename) {
                    if (window.App && window.App.Logger) {
                        window.App.Logger.add('UI', `UUID Kept (Rename Mode ON)`, { id });
                    }
                    return; 
                }

                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                if (group && group.dataset.uuid) {
                    // ★追加: 紐付いているのが「ダミー馬」なら、IDを維持する（実在馬への昇格を許可）
                    const currentUUID = group.dataset.uuid;
                    if (window.App && window.App.State && window.App.State.db) {
                        const dbHorse = window.App.State.db.get(currentUUID);
                        if (dbHorse && App.UI.isDummyHorseName(dbHorse.name_ja)) {
                            if (window.App.Logger) {
                                window.App.Logger.add('UI', `UUID Kept (Promoting Dummy)`, { id, uuid: currentUUID });
                            }
                            return; // 削除せずに終了
                        }
                    }

                    // それ以外（通常の実在馬）なら、安全のためリンクを切る
                    delete group.dataset.uuid;
                    if (window.App && window.App.Logger) {
                        window.App.Logger.add('UI', `UUID Cleared by input (User Action)`, { id });
                    }
                }
            };

            // 日本語名・英語名どちらを変更してもIDリンクを切る
            jaInput.addEventListener('input', clearUUID);
            enInput.addEventListener('input', clearUUID);
            // -------------------------------------------------------------------

            jaInput.addEventListener('input', () => this.validateInput(jaInput, 'ja'));
            enInput.addEventListener('input', () => this.validateInput(enInput, 'en'));
            this.updatePlaceholder(fictCheck, jaInput, enInput);
            fictCheck.addEventListener('change', () => {
                this.updatePlaceholder(fictCheck, jaInput, enInput);
                jaInput.classList.remove('input-error');
                enInput.classList.remove('input-error');
            });
        });
    },

    updatePlaceholder: function(checkbox, jaInput, enInput) {
        if (checkbox.checked) {
            enInput.placeholder = "欧字馬名 (任意)"; jaInput.placeholder = "カナ馬名 (必須)";
        } else {
            enInput.placeholder = "欧字馬名 (必須)"; jaInput.placeholder = "カナ馬名 (任意)";
        }
    },

    validateInput: function(input, type) {
        const val = input.value;
        if (!val) { input.classList.remove('input-error'); return; }
        let isValid = true;
        if (type === 'en') isValid = /^[\x20-\x7E]+$/.test(val);
        if (isValid) input.classList.remove('input-error');
        else input.classList.add('input-error');
    },

    checkRequiredFields: function() {
        const { ALL_IDS } = App.Consts;
        let hasError = false; let firstErrorId = null;
        ALL_IDS.forEach(id => {
            const jaInput = document.getElementById(`${id}-name-ja`);
            const enInput = document.getElementById(`${id}-name-en`);
            const yearInput = document.getElementById(`${id}-birth-year`);
            const fictCheck = document.getElementById(`${id}-is-fictional`);
            const hasInput = jaInput.value.trim() || enInput.value.trim();
            if (id === 'target' || hasInput) {
                const isFictional = fictCheck.checked;
                if (!isFictional && !enInput.value.trim()) {
                    enInput.classList.add('input-error'); hasError = true; if(!firstErrorId) firstErrorId = enInput;
                }
                if (isFictional && !jaInput.value.trim()) {
                    jaInput.classList.add('input-error'); hasError = true; if(!firstErrorId) firstErrorId = jaInput;
                }
                if (!isFictional && !yearInput.value.trim()) {
                    yearInput.classList.add('input-error'); hasError = true; if(!firstErrorId) firstErrorId = yearInput;
                }
                if (jaInput.classList.contains('input-error') || enInput.classList.contains('input-error')) {
                    hasError = true; if(!firstErrorId) firstErrorId = jaInput.classList.contains('input-error') ? jaInput : enInput;
                }
            }
        });
        if (hasError && firstErrorId) {
            alert('入力内容にエラーがあります。赤枠の項目を確認してください。');
            firstErrorId.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }
        return true;
    },

    initResponsiveTabs: function() {
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabContents = document.querySelectorAll('.tab-content');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                tabContents.forEach(content => {
                    content.classList.toggle('active', content.id === `${button.dataset.tab}-tab`);
                });
            });
        });
    },
    
    initAutocomplete: function() {
        const { ALL_IDS } = App.Consts;
        ALL_IDS.forEach(id => {
            ['name-ja', 'name-en'].forEach(suffix => {
                const input = document.getElementById(`${id}-${suffix}`);
                if (!input) return;
                const wrapper = input.closest('.autocomplete-wrapper');
                let suggestionsContainer = wrapper.querySelector('.autocomplete-suggestions');
                if (!suggestionsContainer) {
                    suggestionsContainer = document.createElement('div');
                    suggestionsContainer.className = 'autocomplete-suggestions';
                    wrapper.appendChild(suggestionsContainer);
                }
                input.addEventListener('input', () => this.showSuggestions(input, suggestionsContainer, id));
                document.addEventListener('click', (e) => {
                    if (!wrapper.contains(e.target)) suggestionsContainer.innerHTML = '';
                });
            });
        });
    },

    showSuggestions: function(input, container, idPrefix) {
        const value = input.value.toLowerCase();
        container.innerHTML = '';
        if (value.length === 0) return;
        const suggestions = [];
        
        if (App.State && App.State.db) {
            for (const horse of App.State.db.values()) {
                const matchJa = horse.name_ja && horse.name_ja.includes(value);
                const matchEn = horse.name_en && horse.name_en.toLowerCase().includes(value);
                if (matchJa || matchEn) suggestions.push(horse);
                if (suggestions.length >= 10) break;
            }
        }
        
        suggestions.forEach(horse => {
            const item = document.createElement('div');
            item.className = 'autocomplete-suggestion';
            let label = horse.name_ja || '';
            if (horse.name_en) label += ` (${horse.name_en})`;
            if (horse.birth_year) label += ` ${horse.birth_year}`;
            // ★変更: ダミー馬の場合は整形した名前を表示
            if (this.isDummyHorseName(horse.name_ja)) {
                label = this.formatDummyName(horse.name_ja);
            }
            item.textContent = label;
            
            item.addEventListener('click', () => {
                // ★ログ追加: オートコンプリート選択
                App.Logger.add('UI', 'Autocomplete Selected', { idPrefix, horseId: horse.id, name: horse.name_ja || horse.name_en });
                this.populateFormRecursively(horse.id, idPrefix);
                container.innerHTML = '';
            });
            container.appendChild(item);
        });
    },

    populateFormRecursively: function(horseId, idPrefix) {
        // ★ログ追加: 再帰処理の開始地点
        App.Logger.add('LOGIC', 'populateFormRecursively START', { horseId, idPrefix });
        
        if (!App.State || !App.State.db) return;
        const horse = App.State.db.get(horseId);
        if (!horse) {
            App.Logger.add('WARN', 'populateFormRecursively: Horse not found in DB', { horseId });
            return;
        }
        
        // --- 1. 現世代の入力 ---
        const ja = document.getElementById(`${idPrefix}-name-ja`);
        const en = document.getElementById(`${idPrefix}-name-en`);
        const yr = document.getElementById(`${idPrefix}-birth-year`);
        const fict = document.getElementById(`${idPrefix}-is-fictional`);
        
        const group = document.querySelector(`.horse-input-group[data-horse-id="${idPrefix}"]`);
        
        // ★DOMへのUUIDセットを記録
        if (group) {
            group.dataset.uuid = horseId;
            // App.Logger.add('DOM', `Set dataset.uuid`, { idPrefix, uuid: horseId });
        }

        // 値がない場合は空文字をセットして「ゴミ」を消す
        // ★修正: ダミー馬の場合は名前を表示せず、空欄に見せる
        if (this.isDummyHorseName(horse.name_ja)) {
            if(ja) ja.value = '';
            // ダミー馬であることを示すために、UUIDは保持するが画面は空
            // バッジを出しても良いが、updateDummyIndicatorで自動判定されるので任せる
        } else {
            if(ja) ja.value = horse.name_ja || '';
        }
        
        if(en) en.value = horse.name_en || '';
        if(yr) yr.value = horse.birth_year || '';
        if(fict) fict.checked = horse.is_fictional;

        const country = document.getElementById(`${idPrefix}-country`);
        const color = document.getElementById(`${idPrefix}-color`);
        const family = document.getElementById(`${idPrefix}-family-no`);
        const lineage = document.getElementById(`${idPrefix}-lineage`);

        if(country) country.value = horse.country || '';
        if(color) color.value = horse.color || '';
        if(family) family.value = horse.family_no || '';
        if(lineage) lineage.value = horse.lineage || '';
        
        // ★追加: データ読み込み時は、必ず「修正モード」をOFFにリセットする（安全のため）
        const renameCheck = document.getElementById(`${idPrefix}-allow-rename`);
        if (renameCheck) renameCheck.checked = false;
        
        // 入力イベント発火（プレビュー更新用）
        if(ja) ja.dispatchEvent(new Event('input', { bubbles: true }));

        // --- 2. 親世代への再帰処理 ---
        let sirePrefix, damPrefix;
        if (idPrefix === 'target') { sirePrefix = 's'; damPrefix = 'd'; }
        else { sirePrefix = idPrefix + 's'; damPrefix = idPrefix + 'd'; }
        
        // 5代以上は再帰しない
        if (sirePrefix.length > 5) return;

        // 父の処理
        if (horse.sire_id) {
            this.populateFormRecursively(horse.sire_id, sirePrefix);
        } else if (horse.is_fictional && horse.sire_name) {
            this.clearFormRecursively(sirePrefix); 
            const sGroup = document.querySelector(`.horse-input-group[data-horse-id="${sirePrefix}"]`);
            if(sGroup) delete sGroup.dataset.uuid;
            const sJa = document.getElementById(`${sirePrefix}-name-ja`);
            if(sJa) { sJa.value = horse.sire_name; sJa.dispatchEvent(new Event('input', { bubbles: true })); }
        } else {
            this.clearFormRecursively(sirePrefix);
        }

        // 母の処理
        if (horse.dam_id) {
            this.populateFormRecursively(horse.dam_id, damPrefix);
        } else if (horse.is_fictional && horse.dam_name) {
            this.clearFormRecursively(damPrefix); 
            const dGroup = document.querySelector(`.horse-input-group[data-horse-id="${damPrefix}"]`);
            if(dGroup) delete dGroup.dataset.uuid;
            const dJa = document.getElementById(`${damPrefix}-name-ja`);
            if(dJa) { dJa.value = horse.dam_name; dJa.dispatchEvent(new Event('input', { bubbles: true })); }
        } else {
            this.clearFormRecursively(damPrefix);
        }
    },

    clearFormRecursively: function(idPrefix) {
        if (idPrefix.length > 5) return;
        
        // App.Logger.add('LOGIC', 'clearFormRecursively', { idPrefix });

        // 現世代のクリア
        const inputs = [
            `${idPrefix}-name-ja`, `${idPrefix}-name-en`, `${idPrefix}-birth-year`,
            `${idPrefix}-country`, `${idPrefix}-color`, `${idPrefix}-family-no`, `${idPrefix}-lineage`
        ];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = '';
        });
        const fict = document.getElementById(`${idPrefix}-is-fictional`);
        if(fict) fict.checked = false;

        const group = document.querySelector(`.horse-input-group[data-horse-id="${idPrefix}"]`);
        if (group) delete group.dataset.uuid;

        // プレビュー反映
        this.updatePreview(idPrefix);

        // 子世代へ
        this.clearFormRecursively(idPrefix + 's');
        this.clearFormRecursively(idPrefix + 'd');
    },

    handleSaveImage: async function() {
        // (省略: 変更なし)
        const { IMAGE_WIDTHS } = App.Consts;
        const { downloadFile } = App.Utils;
        
        const titleEl = document.getElementById('preview-title');
        const crossList = document.getElementById('cross-list-container'); 
        
        const ja = document.getElementById('target-name-ja').value.trim();
        const en = document.getElementById('target-name-en').value.trim();
        const year = document.getElementById('target-birth-year').value.trim();
        const name = ja || en;
        const selectedGen = document.querySelector('input[name="generation"]:checked').value;
        let fileName = `${selectedGen}代血統表.png`;
        if (name) fileName = `${name}${year ? `(${year})` : ''}_${fileName}`;

        const cloneContainer = document.createElement('div');
        cloneContainer.className = 'clone-container-for-image';
        
        const h2 = document.createElement('h2');
        const clonedSpan = titleEl.cloneNode(true);
        h2.style.fontSize = '24px';
        h2.style.fontWeight = 'bold';
        h2.style.margin = '0 0 15px 0';
        h2.style.textAlign = 'left';
        h2.appendChild(clonedSpan);
        cloneContainer.appendChild(h2);
        
        const table = document.querySelector('.pedigree-table');
        cloneContainer.appendChild(table.cloneNode(true));

        if (crossList && crossList.style.display !== 'none') {
            const clonedCross = crossList.cloneNode(true);
            clonedCross.style.marginTop = '10px';
            clonedCross.style.borderTop = 'none'; 
            cloneContainer.appendChild(clonedCross);
        }
        
        cloneContainer.style.width = `${IMAGE_WIDTHS[selectedGen]}px`;
        document.body.appendChild(cloneContainer);
        
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
            const canvas = await html2canvas(cloneContainer, { scale: 1 });
            const dataUrl = canvas.toDataURL('image/png');
            downloadFile(dataUrl, fileName, 'image/png');
        } catch (e) { console.error(e); alert('保存失敗'); }
        finally { document.body.removeChild(cloneContainer); }
    },

    setGlobalLoading: function(isLoading, title = '処理中...', message = '') {
        const overlay = document.getElementById('global-loading-overlay');
        const titleEl = document.getElementById('loading-title');
        const msgEl = document.getElementById('loading-message');

        if (overlay && titleEl && msgEl) {
            if (isLoading) {
                titleEl.textContent = title;
                msgEl.textContent = message || title;
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    },

    setSaveButtonLoading: function(isLoading, label) {
        const saveBtn = document.getElementById('save-db');
        if (saveBtn) {
            saveBtn.disabled = isLoading;
            if (label) saveBtn.textContent = label;
        }
    },

    showSaveConfirmModal: function(conflicts, pendingSaveData) {
        App.Logger.add('UI', 'Showing Conflict Modal', { conflictCount: conflicts.length });
        
        const listContainer = document.getElementById('save-confirm-list');
        listContainer.innerHTML = '';

        conflicts.forEach((conflict, index) => {
            const card = document.createElement('div');
            card.className = 'confirm-card';
            let tableRows = '';
            const fieldNames = { 
                name_ja: 'カナ馬名', name_en: '欧字馬名', birth_year: '生年', 
                country: '生産国', color: '毛色', family_no: 'F-No.', lineage: '系統'
            };
            conflict.diffs.forEach(d => {
                tableRows += `<tr><th>${fieldNames[d.field] || d.field}</th><td>${d.old}</td><td class="diff-highlight">${d.new}</td></tr>`;
            });

            const tempKey = Array.from(pendingSaveData.entries()).find(([k, v]) => v === conflict.horse)[0];

            card.innerHTML = `
                <h4>${conflict.dbHorse.name_ja || conflict.dbHorse.name_en} <small>(ID: ...${conflict.dbHorse.id.slice(-4)})</small></h4>
                <table class="diff-table"><thead><tr><th>項目</th><th>変更前</th><th>変更後</th></tr></thead><tbody>${tableRows}</tbody></table>
                <div class="confirm-options">
                    <label><input type="radio" name="action_${index}" value="update" checked> 情報を更新する <small>(入力内容で上書き)</small></label>
                    <label><input type="radio" name="action_${index}" value="skip"> DBの情報を維持する <small>(この馬の変更を破棄)</small></label>
                    <label><input type="radio" name="action_${index}" value="new"> 新しい馬として登録する <small>(別IDを発行)</small></label>
                </div>
            `;
            card.dataset.tempId = tempKey;
            listContainer.appendChild(card);
        });
        document.getElementById('save-confirm-modal-overlay').classList.remove('hidden');
    },

    showToast: function(message, duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.textContent = message;

        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if(container.contains(toast)) container.removeChild(toast);
            }, 300);
        }, duration);
    },

// --- ダークモード管理 ---
    initTheme: function() {
        const toggleBtn = document.getElementById('toggle-theme');
        if (!toggleBtn) return;

        // 保存された設定、またはOSの設定を確認
        const savedTheme = localStorage.getItem('app-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // 初期適応
        if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
            document.body.dataset.theme = 'dark';
            toggleBtn.textContent = '☀️';
        }

        // 切り替えイベント
        toggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.dataset.theme;
            if (currentTheme === 'dark') {
                document.body.removeAttribute('data-theme');
                localStorage.setItem('app-theme', 'light');
                toggleBtn.textContent = '🌙';
            } else {
                document.body.dataset.theme = 'dark';
                localStorage.setItem('app-theme', 'dark');
                toggleBtn.textContent = '☀️';
            }
        });
    },

    // --- フォームリセット機能 ---
    resetForm: function() {
        if (!confirm("入力内容をすべて消去し、リセットしますか？\n（保存していない入力内容は失われます）")) return;

        // 1. 全入力フィールドのクリア
        const inputs = document.querySelectorAll('.horse-input-group input');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = false; // 架空馬フラグ、修正モードなどもOFF
            } else {
                input.value = '';
            }
        });

        // 2. プレースホルダーのリセット（架空馬チェックOFFに伴う対応）
        const { ALL_IDS } = App.Consts;
        ALL_IDS.forEach(id => {
            const ja = document.getElementById(`${id}-name-ja`);
            const en = document.getElementById(`${id}-name-en`);
            const check = document.getElementById(`${id}-is-fictional`);
            if (ja && en && check) this.updatePlaceholder(check, ja, en);
            
            // エラー表示の解除
            if (ja) ja.classList.remove('input-error');
            if (en) en.classList.remove('input-error');
            const year = document.getElementById(`${id}-birth-year`);
            if (year) year.classList.remove('input-error');
        });

        // 3. データ属性(UUID)の完全削除
        const groups = document.querySelectorAll('.horse-input-group');
        groups.forEach(group => {
            delete group.dataset.uuid;
        });

        // 4. プレビューの全更新
        ALL_IDS.forEach(id => this.updatePreview(id));

        // 5. 状態のリセット
        if (window.App.State) window.App.State.isDirty = false;

        // ★追加: ダミー通知のクリア
        document.querySelectorAll('.dummy-notification-area').forEach(el => {
            el.classList.remove('visible');
            el.innerHTML = '';
        });
        document.querySelectorAll('.dummy-badge').forEach(el => el.classList.remove('visible'));

        this.showToast("フォームをリセットしました");
        
        // ログ出力
        if (window.App.Logger) window.App.Logger.add('ACTION', 'Form Reset Executed');
    },

    // --- 系統クリア機能 ---
    handleClearAncestors: function(startId) {
        if (!confirm(`【${startId.toUpperCase()}】\nこの馬と、繋がっている先祖のデータをすべて消去しますか？`)) return;
        this.clearFormRecursively(startId);
        this.updateDummyIndicator();
    },

    // --- ダミー生成インジケーターの更新 ---
    updateDummyIndicator: function() {
        const { ALL_IDS } = App.Consts;
        const formData = this.getFormDataAsMap();

        ALL_IDS.forEach(id => {
            const notifArea = document.getElementById(`${id}-dummy-notification`);
            if (!notifArea) return;
            notifArea.classList.remove('visible');
            notifArea.innerHTML = '';

            // 1. 既にダミー馬が読み込まれている場合
            const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
            if (group && group.dataset.uuid && window.App.State.db) {
                const dbHorse = window.App.State.db.get(group.dataset.uuid);
                if (dbHorse && this.isDummyHorseName(dbHorse.name_ja)) {
                    const prettyName = this.formatDummyName(dbHorse.name_ja);
                    notifArea.innerHTML = `✅ <strong>${prettyName}</strong> として登録済みです。<br>（名前を入力すると実在馬として上書き登録されます）`;
                    notifArea.classList.add('visible');
                    return;
                }
            }

            // 2. 空欄による新規補完判定
            // 自身が入力済みなら対象外
            const self = formData.get(id);
            const hasSelfName = self && (self.name_ja || self.name_en);
            if (hasSelfName) return;

            if (id === 'target') return;

            // 対象馬(target)が架空馬かどうかチェック
            const targetHorse = formData.get('target');
            if (!targetHorse || !targetHorse.is_fictional) return;

            // ★修正: 直下の親だけでなく、「その先にデータがあるか」を再帰チェック
            if (this.hasAncestorData(id, formData)) {
                // 補完対象確定: 名前を予測して表示
                let childId = (id.length === 1) ? 'target' : id.substring(0, id.length - 1);
                const child = formData.get(childId);
                
                let childName = child ? (child.name_ja || child.name_en) : '';
                if (!childName) childName = '未登録馬';
                
                if (this.isDummyHorseName(childName)) {
                    childName = this.formatDummyName(childName).replace(/[（）()]/g, '');
                }
                
                const suffix = (id.endsWith('s')) ? 'の父' : 'の母';
                const predictedName = `（${childName}${suffix}）`;
                
                notifArea.innerHTML = `⚠️ 未命名／名称不明の馬 <strong>${predictedName}</strong> として登録されます。`;
                notifArea.classList.add('visible');
            }
        });
    },

    // ★追加: 指定したIDより先の系統（父母、祖父母...）にデータが存在するかチェック
    hasAncestorData: function(id, formData) {
        // 5代より先はチェックしない
        if (id.length >= 5) return false;

        const sireId = id + 's';
        const damId = id + 'd';
        
        // 1. 直下の親がいるか？
        const sire = formData.get(sireId);
        const dam = formData.get(damId);
        const hasSire = sire && (sire.name_ja || sire.name_en);
        const hasDam = dam && (dam.name_ja || dam.name_en);
        
        if (hasSire || hasDam) return true;

        // 2. いなければ、さらにその先を再帰チェック
        return this.hasAncestorData(sireId, formData) || this.hasAncestorData(damId, formData);
    },
    
    // --- 追加: ダミー馬判定用ユーティリティ ---
    isDummyHorseName: function(name) {
        return name && name.startsWith('(未登録:') && (name.endsWith(')') || name.endsWith('）'));
    },

    // --- 追加: ダミー馬名の整形表示 (未登録: (未登録: Xの母)の父) -> (Xの母父) ---
    formatDummyName: function(name) {
        if (!this.isDummyHorseName(name)) return name;
        
        let current = name;
        const suffixes = [];
        const layerRegex = /^\(未登録:\s*(.+)(の[父母])\)$/; // 入れ子を剥がす正規表現
        
        // 再帰的に剥がしていく
        while (true) {
            const match = current.match(layerRegex);
            if (match) {
                current = match[1]; // 中身 (例: (未登録: Xの母))
                suffixes.unshift(match[2]); // 接尾辞 (例: の父)
            } else {
                break;
            }
        }
        
        // 接尾辞を連結 (の母 + の父 -> の母父)
        let suffixStr = "";
        if (suffixes.length > 0) {
            suffixStr = suffixes[0]; // 最初だけ「の」を残す
            for (let i = 1; i < suffixes.length; i++) {
                suffixStr += suffixes[i].replace('の', '');
            }
        }
        
        // currentには最終的にベースとなる馬名(X)が残る
        // もしベース名自体がダミー形式で単純なパターンに合致しなかった場合でも、
        // 可能な限り見やすく整形して返す
        return `（${current}${suffixStr}）`;
    }
};