document.addEventListener('DOMContentLoaded', () => {
    // --- アプリケーション設定 ---
    const IMAGE_WIDTHS = { 2: 800, 3: 1000, 4: 1200, 5: 1400 };
    
    // --- 状態管理 ---
    const state = {
        db: new Map(),
        isDirty: false,
        pendingSaveData: null
    };

    // --- 定数・構成 ---
    const GENERATION_LABELS = {
        'target': { label: '対象馬', tag: 'h3' },
        's': { label: '父', tag: 'h3' }, 'd': { label: '母', tag: 'h3' },
        'ss': { label: '父の父 (SS)', tag: 'h3' }, 'sd': { label: '父の母 (SD)', tag: 'h3' },
        'ds': { label: '母の父 (DS)', tag: 'h3' }, 'dd': { label: '母の母 (DD)', tag: 'h3' }
    };

    const ANCESTOR_IDS = (() => {
        const ids = [];
        let currentGen = [''];
        for (let i = 1; i <= 5; i++) {
            const nextGen = [];
            for (const parent of currentGen) {
                const sireId = parent + 's';
                const damId = parent + 'd';
                ids.push(sireId, damId);
                if (i < 5) nextGen.push(sireId, damId);
            }
            currentGen = nextGen;
        }
        return ids;
    })();
    const ALL_IDS = ['target', ...ANCESTOR_IDS];

    // --- 初期化シーケンス ---
    initialize();

    function initialize() {
        try { initButtons(); } catch (e) { console.error('Buttons Init Error:', e); }
        try { initModal(); } catch (e) { console.error('Modal Init Error:', e); }
        
        try { 
            // DOM生成
            initDOM(); 
            
            // ★修正: DOM生成後に依存する機能を確実に初期化
            initGenerationSelector(); 
            initUI(); 
            initPageLeaveWarning(); 
            initFormDirtyStateTracking();
        } catch (e) { console.error('UI Init Error:', e); }
    }

    function initButtons() {
        const loadBtn = document.getElementById('load-db');
        const dlBtn = document.getElementById('bulk-register-csv');
        const saveBtn = document.getElementById('save-db');
        const imgBtn = document.getElementById('save-image');
        
        const cancelSaveBtn = document.getElementById('cancel-save-btn');
        const execSaveBtn = document.getElementById('execute-save-btn');

        if(loadBtn) loadBtn.onclick = handleLoadDB;
        if(dlBtn) dlBtn.onclick = handleDownloadTemplate;
        if(saveBtn) saveBtn.onclick = handleSaveDBRequest;
        if(imgBtn) imgBtn.onclick = handleSaveImage;
        
        if(cancelSaveBtn) cancelSaveBtn.onclick = () => {
            document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
            state.pendingSaveData = null;
        };
        if(execSaveBtn) execSaveBtn.onclick = executeSaveDB;
    }

    // --- DOM生成 ---
    function initDOM() {
        createFormGroups();
        createPreviewTable();
    }

    function createFormGroups() {
        const container = document.getElementById('dynamic-form-container');
        if (!container) return;
        container.innerHTML = '';

        ALL_IDS.forEach(id => {
            const gen = getGeneration(id);
            const labelInfo = GENERATION_LABELS[id] || { 
                label: id.toUpperCase(), 
                tag: gen === 3 ? 'h4' : 'h5' 
            };

            const group = document.createElement('div');
            group.className = 'horse-input-group';
            group.dataset.generation = gen;
            group.dataset.horseId = id;

            const header = document.createElement(labelInfo.tag);
            header.innerHTML = `<span>${labelInfo.label}</span> <label class="fictional-check-label"><input type="checkbox" id="${id}-is-fictional"> 架空馬</label>`;
            group.appendChild(header);

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
            `;
            group.appendChild(details);
            container.appendChild(group);
        });
    }

    function createPreviewTable() {
        const tbody = document.getElementById('preview-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

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
                td.innerHTML = `<span id="preview-${cell.id}-name">&nbsp;</span><small id="preview-${cell.id}-birth-year">&nbsp;</small>`;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    function getGeneration(id) { if (id === 'target') return 0; return id.length; }
    function initUI() {
        initFormPreviewSync();
        initResponsiveTabs();
        initAutocomplete();
        initInputValidation(); // ★追加: バリデーション機能の初期化をここに集約
    }
    
    function initModal() {
        const modalOverlay = document.getElementById('startup-modal-overlay');
        const createNewBtn = document.getElementById('create-new-btn-modal');
        const loadDbBtnModal = document.getElementById('load-db-btn-modal');
        const migrationModal = document.getElementById('migration-modal-overlay');
        const closeMigrationBtn = document.getElementById('close-migration-wizard');
        
        if(createNewBtn) createNewBtn.onclick = () => modalOverlay.classList.add('hidden');
        if(loadDbBtnModal) loadDbBtnModal.onclick = () => {
            modalOverlay.classList.add('hidden');
            handleLoadDB();
        };
        if(closeMigrationBtn) closeMigrationBtn.onclick = () => migrationModal.classList.add('hidden');
    }

    function initPageLeaveWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    function initFormDirtyStateTracking() {
        const form = document.querySelector('.form-container');
        if(form) form.addEventListener('input', () => state.isDirty = true);
    }

    // --- ★バリデーション・プレースホルダー制御 ---
    function initInputValidation() {
        ALL_IDS.forEach(id => {
            const jaInput = document.getElementById(`${id}-name-ja`);
            const enInput = document.getElementById(`${id}-name-en`);
            const fictCheck = document.getElementById(`${id}-is-fictional`);
            if(!jaInput || !enInput || !fictCheck) return;

            // 入力時のリアルタイムバリデーション
            jaInput.addEventListener('input', () => validateInput(jaInput, 'ja'));
            enInput.addEventListener('input', () => validateInput(enInput, 'en'));

            // 初期状態のプレースホルダー更新
            updatePlaceholder(fictCheck, jaInput, enInput);

            fictCheck.addEventListener('change', () => {
                updatePlaceholder(fictCheck, jaInput, enInput);
                jaInput.classList.remove('input-error');
                enInput.classList.remove('input-error');
            });
        });
    }

    function updatePlaceholder(checkbox, jaInput, enInput) {
        if (checkbox.checked) {
            enInput.placeholder = "欧字馬名 (任意)";
            jaInput.placeholder = "カナ馬名 (必須)";
        } else {
            enInput.placeholder = "欧字馬名 (必須)";
            jaInput.placeholder = "カナ馬名 (任意)";
        }
    }

    function validateInput(input, type) {
        const val = input.value;
        if (!val) {
            input.classList.remove('input-error');
            return;
        }
        let isValid = true;
        if (type === 'ja') {
            // 全角カタカナ、長音、中黒、全角スペース
            isValid = /^[\u30A0-\u30FF\u30FB\u3000]+$/.test(val);
        } else if (type === 'en') {
            // 半角英数字、記号、半角スペース
            isValid = /^[\x20-\x7E]+$/.test(val);
        }
        
        if (isValid) input.classList.remove('input-error');
        else input.classList.add('input-error');
    }

    // 保存前の必須チェック
    function checkRequiredFields() {
        let hasError = false;
        let firstErrorId = null;

        ALL_IDS.forEach(id => {
            const jaInput = document.getElementById(`${id}-name-ja`);
            const enInput = document.getElementById(`${id}-name-en`);
            const yearInput = document.getElementById(`${id}-birth-year`);
            const fictCheck = document.getElementById(`${id}-is-fictional`);
            
            // 入力がある馬だけチェック
            const hasInput = jaInput.value.trim() || enInput.value.trim();
            
            if (id === 'target' || hasInput) {
                const isFictional = fictCheck.checked;
                
                // 実在馬: 欧字名必須
                if (!isFictional && !enInput.value.trim()) {
                    enInput.classList.add('input-error');
                    hasError = true;
                    if(!firstErrorId) firstErrorId = enInput;
                }
                
                // 架空馬: カナ名必須
                if (isFictional && !jaInput.value.trim()) {
                    jaInput.classList.add('input-error');
                    hasError = true;
                    if(!firstErrorId) firstErrorId = jaInput;
                }

                // 実在馬: 生年必須
                if (!isFictional && !yearInput.value.trim()) {
                    yearInput.classList.add('input-error');
                    hasError = true;
                    if(!firstErrorId) firstErrorId = yearInput;
                }
                
                // 文字種エラーが残っている場合
                if (jaInput.classList.contains('input-error') || enInput.classList.contains('input-error')) {
                    hasError = true;
                    if(!firstErrorId) firstErrorId = jaInput.classList.contains('input-error') ? jaInput : enInput;
                }
            }
        });

        if (hasError && firstErrorId) {
            alert('入力内容にエラーがあります。赤枠の項目を確認してください。');
            firstErrorId.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return false;
        }
        return true;
    }

    function handleDownloadTemplate() {
        const header = 'uuid,name_ja,name_en,birth_year,is_fictional,country,color,family_no,lineage,sire_id,dam_id,sire_name,dam_name';
        const example = `${generateUUID()},サンデーサイレンス,Sunday Silence,1986,false,USA,青鹿毛,,Halo系,,,Halo,Wishing Well`;
        const content = `${header}\n${example}\n`;
        downloadFile(content, 'template_v0.6.csv', 'text/csv');
    }

    // --- DB保存 ---
    function handleSaveDBRequest() {
        if (!checkRequiredFields()) return; // バリデーション

        const formData = getFormDataAsMap();
        const conflicts = [];

        for (const [tempId, formHorse] of formData.entries()) {
            if (formHorse.id && state.db.has(formHorse.id)) {
                const dbHorse = state.db.get(formHorse.id);
                const diffs = [];
                const fields = ['name_ja', 'name_en', 'birth_year', 'country', 'color', 'family_no', 'lineage'];
                
                fields.forEach(field => {
                    const dbVal = String(dbHorse[field] || '').trim();
                    const formVal = String(formHorse[field] || '').trim();
                    if (dbVal !== '' && dbVal !== formVal) {
                        diffs.push({ field, old: dbVal, new: formVal });
                    }
                });

                if (diffs.length > 0) {
                    conflicts.push({ horse: formHorse, dbHorse, diffs });
                }
            }
        }

        if (conflicts.length > 0) {
            state.pendingSaveData = formData;
            showSaveConfirmModal(conflicts);
        } else {
            saveDataDirectly(formData);
        }
    }

    function showSaveConfirmModal(conflicts) {
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

            const tempKey = Array.from(state.pendingSaveData.entries()).find(([k, v]) => v === conflict.horse)[0];

            card.innerHTML = `
                <h4>${conflict.dbHorse.name_ja || conflict.dbHorse.name_en} <small>(ID: ...${conflict.dbHorse.id.slice(-4)})</small></h4>
                <table class="diff-table">
                    <thead><tr><th>項目</th><th>変更前</th><th>変更後</th></tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="confirm-options">
                    <label><input type="radio" name="action_${index}" value="update" checked> 情報を更新する <small>現在の登録内容を、入力された内容で書き換えます。</small></label>
                    <label><input type="radio" name="action_${index}" value="new"> 新しい馬として登録する <small>現在の登録内容はそのまま残し、別の馬として新しく追加します。</small></label>
                </div>
            `;
            card.dataset.tempId = tempKey;
            listContainer.appendChild(card);
        });

        document.getElementById('save-confirm-modal-overlay').classList.remove('hidden');
    }

    function executeSaveDB() {
        const listContainer = document.getElementById('save-confirm-list');
        const cards = listContainer.querySelectorAll('.confirm-card');
        
        cards.forEach((card, index) => {
            const actionInput = card.querySelector(`input[name="action_${index}"]:checked`);
            if (actionInput && actionInput.value === 'new') {
                const tempId = card.dataset.tempId;
                const horseData = state.pendingSaveData.get(tempId);
                if (horseData) {
                    horseData.id = null; 
                    state.pendingSaveData.set(tempId, horseData);
                }
            }
        });

        saveDataDirectly(state.pendingSaveData);
        document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
        state.pendingSaveData = null;
    }

    function saveDataDirectly(formData) {
        const newDb = new Map(state.db);
        
        for (const [tempId, formHorse] of formData.entries()) {
            if (formHorse.id && newDb.has(formHorse.id)) {
                const existing = newDb.get(formHorse.id);
                Object.assign(existing, formHorse);
            } else {
                const newId = generateUUID();
                formHorse.id = newId;
                newDb.set(newId, formHorse);
            }
        }

        const csvString = convertDbToCSV(newDb);
        downloadFile(csvString, 'pedigree_db_v0.6.csv', 'text/csv');
        state.isDirty = false;
        state.db = newDb;
        alert(`${state.db.size}件のデータを保存しました。`);
    }
    // --- データ取得・変換 ---
    function getFormDataAsMap() {
        const formData = new Map();
        ALL_IDS.forEach(id => {
            const nameJa = document.getElementById(`${id}-name-ja`).value.trim();
            const nameEn = document.getElementById(`${id}-name-en`).value.trim();
            const year = document.getElementById(`${id}-birth-year`).value.trim();
            
            if (nameJa || nameEn) {
                const isFictional = document.getElementById(`${id}-is-fictional`).checked;
                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                const uuid = group ? group.dataset.uuid : null;

                let sireName = '', damName = '';
                if (id === 'target') {
                    sireName = getInputValue('s'); damName = getInputValue('d');
                } else {
                    const sId = id + 's'; const dId = id + 'd';
                    if (ALL_IDS.includes(sId)) sireName = getInputValue(sId);
                    if (ALL_IDS.includes(dId)) damName = getInputValue(dId);
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
    }
    
    function getInputValue(id) {
        const ja = document.getElementById(`${id}-name-ja`);
        const en = document.getElementById(`${id}-name-en`);
        if (ja && ja.value) return ja.value.trim();
        if (en && en.value) return en.value.trim();
        return '';
    }

    function convertDbToCSV(dbMap) {
        const header = 'uuid,name_ja,name_en,birth_year,is_fictional,country,color,family_no,lineage,sire_id,dam_id,sire_name,dam_name';
        const rows = [];
        for (const h of dbMap.values()) {
            const row = [
                h.id, h.name_ja, h.name_en, h.birth_year, h.is_fictional,
                h.country, h.color, h.family_no, h.lineage,
                h.sire_id || '', h.dam_id || '',
                h.sire_name || '', h.dam_name || ''
            ];
            rows.push(row.join(','));
        }
        return `${header}\n${rows.join('\n')}`;
    }

    function downloadFile(content, fileName, mimeType) {
        const a = document.createElement('a');
        let url;
        if (content.startsWith('data:')) { a.href = content; }
        else {
            const blob = new Blob([content], { type: mimeType });
            url = URL.createObjectURL(blob);
            a.href = url;
        }
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (url) URL.revokeObjectURL(url);
    }

    // --- CSV読み込み & マイグレーション ---
    function handleLoadDB() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv,text/csv,text/plain';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => parseCSV(event.target.result);
                reader.readAsText(file);
            }
        };
        input.click();
    }
    
    function parseCSV(csvText) {
        state.db.clear();
        const lines = csvText.trim().split(/\r?\n/);
        const header = lines.shift().split(',').map(h => h.trim());
        const isOldFormat = !header.includes('uuid');
        
        const data = lines.map(line => {
            const values = line.split(',');
            const obj = {};
            header.forEach((key, i) => obj[key] = values[i] ? values[i].trim() : '');
            return obj;
        });
        
        const tempMap = new Map();

        data.forEach(row => {
            const nameJa = isOldFormat ? (/[a-zA-Z]/.test(row.name) ? '' : row.name) : row.name_ja;
            const nameEn = isOldFormat ? (/[a-zA-Z]/.test(row.name) ? row.name : '') : row.name_en;
            const birthYear = row.birth_year;
            const uniqueKey = `${nameJa || nameEn}_${birthYear}`;
            
            let uuid = tempMap.get(uniqueKey);
            let horse = uuid ? state.db.get(uuid) : null;

            if (!horse) {
                uuid = isOldFormat ? generateUUID() : row.uuid;
                tempMap.set(uniqueKey, uuid);
                if (isOldFormat) {
                    horse = {
                        id: uuid, name_ja: nameJa, name_en: nameEn, birth_year: birthYear,
                        is_fictional: false, sire_id: null, dam_id: null,
                        temp_sire_key: (row.sire_name && row.sire_birth_year) ? `${row.sire_name}_${row.sire_birth_year}` : null,
                        temp_dam_key: (row.dam_name && row.dam_birth_year) ? `${row.dam_name}_${row.dam_birth_year}` : null,
                        sire_name: row.sire_name || '', dam_name: row.dam_name || '',
                        country: '', color: '', family_no: '', lineage: ''
                    };
                } else {
                    horse = {
                        id: uuid, name_ja: nameJa, name_en: nameEn, birth_year: birthYear,
                        is_fictional: row.is_fictional === 'true',
                        country: row.country, color: row.color,
                        family_no: row.family_no, lineage: row.lineage,
                        sire_id: row.sire_id || null, dam_id: row.dam_id || null,
                        sire_name: row.sire_name || '', dam_name: row.dam_name || ''
                    };
                }
                state.db.set(uuid, horse);
            }
        });

        if (isOldFormat) {
            state.db.forEach(horse => {
                if (horse.temp_sire_key) {
                    const sireUuid = tempMap.get(horse.temp_sire_key);
                    if (sireUuid) { horse.sire_id = sireUuid; if (!horse.is_fictional) horse.sire_name = ''; }
                }
                if (horse.temp_dam_key) {
                    const damUuid = tempMap.get(horse.temp_dam_key);
                    if (damUuid) { horse.dam_id = damUuid; if (!horse.is_fictional) horse.dam_name = ''; }
                }
                delete horse.temp_sire_key; delete horse.temp_dam_key;
            });
            document.getElementById('migration-modal-overlay').classList.remove('hidden');
        }
        alert(`${state.db.size}件のデータを読み込みました。`);
        state.isDirty = false;
    }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    // --- UI関連 ---
    function initAutocomplete() {
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
                input.addEventListener('input', () => showSuggestions(input, suggestionsContainer, id));
                document.addEventListener('click', (e) => {
                    if (!wrapper.contains(e.target)) suggestionsContainer.innerHTML = '';
                });
            });
        });
    }

    function showSuggestions(input, container, idPrefix) {
        const value = input.value.toLowerCase();
        container.innerHTML = '';
        if (value.length === 0) return;
        const suggestions = [];
        for (const horse of state.db.values()) {
            const matchJa = horse.name_ja && horse.name_ja.includes(value);
            const matchEn = horse.name_en && horse.name_en.toLowerCase().includes(value);
            if (matchJa || matchEn) suggestions.push(horse);
            if (suggestions.length >= 10) break;
        }
        suggestions.forEach(horse => {
            const item = document.createElement('div');
            item.className = 'autocomplete-suggestion';
            let label = horse.name_ja || '';
            if (horse.name_en) label += ` (${horse.name_en})`;
            if (horse.birth_year) label += ` ${horse.birth_year}`;
            item.textContent = label;
            item.addEventListener('click', () => {
                populateFormRecursively(horse.id, idPrefix);
                container.innerHTML = '';
            });
            container.appendChild(item);
        });
    }

    function populateFormRecursively(horseId, idPrefix) {
        const horse = state.db.get(horseId);
        if (!horse) return;

        const ja = document.getElementById(`${idPrefix}-name-ja`);
        const en = document.getElementById(`${idPrefix}-name-en`);
        const yr = document.getElementById(`${idPrefix}-birth-year`);
        const fict = document.getElementById(`${idPrefix}-is-fictional`);
        
        const group = document.querySelector(`.horse-input-group[data-horse-id="${idPrefix}"]`);
        if (group) group.dataset.uuid = horseId;

        if(ja) ja.value = horse.name_ja || '';
        if(en) en.value = horse.name_en || '';
        if(yr) yr.value = horse.birth_year || '';
        if(fict) fict.checked = horse.is_fictional;
        
        const country = document.getElementById(`${idPrefix}-country`);
        if(country) country.value = horse.country || '';
        document.getElementById(`${idPrefix}-color`).value = horse.color || '';
        document.getElementById(`${idPrefix}-family-no`).value = horse.family_no || '';
        document.getElementById(`${idPrefix}-lineage`).value = horse.lineage || '';

        if(ja) ja.dispatchEvent(new Event('input', { bubbles: true }));

        let sirePrefix, damPrefix;
        if (idPrefix === 'target') { sirePrefix = 's'; damPrefix = 'd'; }
        else { sirePrefix = idPrefix + 's'; damPrefix = idPrefix + 'd'; }

        if (sirePrefix.length > 5) return;

        if (horse.sire_id) {
            populateFormRecursively(horse.sire_id, sirePrefix);
        } else if (horse.is_fictional && horse.sire_name) {
            const sGroup = document.querySelector(`.horse-input-group[data-horse-id="${sirePrefix}"]`);
            if(sGroup) delete sGroup.dataset.uuid;
            const sJa = document.getElementById(`${sirePrefix}-name-ja`);
            if(sJa) { sJa.value = horse.sire_name; sJa.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        
        if (horse.dam_id) {
            populateFormRecursively(horse.dam_id, damPrefix);
        } else if (horse.is_fictional && horse.dam_name) {
            const dGroup = document.querySelector(`.horse-input-group[data-horse-id="${damPrefix}"]`);
            if(dGroup) delete dGroup.dataset.uuid;
            const dJa = document.getElementById(`${damPrefix}-name-ja`);
            if(dJa) { dJa.value = horse.dam_name; dJa.dispatchEvent(new Event('input', { bubbles: true })); }
        }
    }

    function initFormPreviewSync() {
        ALL_IDS.forEach(id => {
            const inputs = [`${id}-name-ja`, `${id}-name-en`, `${id}-birth-year`];
            inputs.forEach(inId => {
                const el = document.getElementById(inId);
                if(el) el.addEventListener('input', () => updatePreview(id));
            });
        });
    }

    function updatePreview(id) {
        const ja = document.getElementById(`${id}-name-ja`).value.trim();
        const en = document.getElementById(`${id}-name-en`).value.trim();
        const year = document.getElementById(`${id}-birth-year`).value.trim();
        let dispName = ja || en || '&nbsp;';
        
        if (id === 'target') {
            const title = document.getElementById('preview-title');
            const text = (ja || en) ? `${ja || en}${year ? ` (${year})` : ''} の血統` : '血統表プレビュー';
            title.textContent = text;
        } else {
            const pName = document.getElementById(`preview-${id}-name`);
            const pYear = document.getElementById(`preview-${id}-birth-year`);
            if(!pName) return;
            const col = parseInt(pName.closest('.pedigree-cell')?.dataset.col);
            if (col === 5) {
                let text = (ja || en) ? (ja || en) : '&nbsp;';
                if ((ja || en) && year) text += ` (${year})`;
                else if (year) text = `(${year})`;
                pName.innerHTML = text;
            } else {
                pName.innerHTML = dispName;
                pYear.innerHTML = year || '&nbsp;';
            }
        }
    }

    function initGenerationSelector() {
        document.querySelectorAll('input[name="generation"]').forEach(radio => radio.addEventListener('change', handleGenerationChange));
        handleGenerationChange();
    }

    function handleGenerationChange() {
        const selectedGen = parseInt(document.querySelector('input[name="generation"]:checked').value);
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
    }
    
    function initResponsiveTabs() {
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
    }

    async function handleSaveImage() {
        const titleEl = document.getElementById('preview-title');
        const tableEl = document.querySelector('.pedigree-table');
        
        const ja = document.getElementById('target-name-ja').value.trim();
        const en = document.getElementById('target-name-en').value.trim();
        const year = document.getElementById('target-birth-year').value.trim();
        const name = ja || en;
        
        const selectedGen = document.querySelector('input[name="generation"]:checked').value;
        let fileName = `${selectedGen}代血統表.png`;
        if (name) fileName = `${name}${year ? `(${year})` : ''}_${fileName}`;

        const cloneContainer = document.createElement('div');
        cloneContainer.className = 'clone-container-for-image';
        cloneContainer.appendChild(titleEl.cloneNode(true));
        cloneContainer.appendChild(tableEl.cloneNode(true));
        
        cloneContainer.style.width = `${IMAGE_WIDTHS[selectedGen]}px`;
        document.body.appendChild(cloneContainer);
        
        await new Promise(resolve => requestAnimationFrame(resolve));
        try {
            const canvas = await html2canvas(cloneContainer, { scale: 1 });
            const dataUrl = canvas.toDataURL('image/png');
            downloadFile(dataUrl, fileName, 'image/png');
        } catch (e) { console.error(e); alert('保存失敗'); }
        finally { document.body.removeChild(cloneContainer); }
    }
});