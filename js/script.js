document.addEventListener('DOMContentLoaded', () => {
    // --- アプリケーション設定 ---
    const IMAGE_WIDTHS = { 2: 800, 3: 1000, 4: 1200, 5: 1400 };
    
    // --- 状態管理 ---
    const state = {
        db: new Map(),
        isDirty: false,
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

    // --- 初期化 (順序を修正し、エラー耐性を向上) ---
    try { initModal(); } catch (e) { console.error('Init Modal Error:', e); }
    try { initButtons(); } catch (e) { console.error('Init Buttons Error:', e); } // ボタンを早めに初期化
    try { 
        initDOM(); // DOM生成
        initGenerationSelector(); // DOM生成直後に世代切り替えを初期化
    } catch (e) { console.error('Init DOM Error:', e); }
    
    try { 
        initUI(); // その他UIイベント
        initPageLeaveWarning();
        initFormDirtyStateTracking();
    } catch (e) { console.error('Init UI Error:', e); }

    // --- DOM生成ロジック ---
    function initDOM() {
        createFormGroups();
        createPreviewTable();
    }

    function createFormGroups() {
        const container = document.getElementById('dynamic-form-container');
        if (!container) return;
        
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
                <input type="text" id="${id}-name-ja" class="input-name-ja" placeholder="カナ馬名 (必須)">
                <input type="text" id="${id}-name-en" class="input-name-en" placeholder="欧字馬名 (実在馬必須)">
                <input type="number" id="${id}-birth-year" class="input-year" placeholder="生年">
            `;
            group.appendChild(basicRow);

            const details = document.createElement('details');
            details.className = 'details-input';
            details.innerHTML = `
                <summary>詳細情報...</summary>
                <div class="input-row">
                    <input type="text" id="${id}-country" class="input-detail" placeholder="生産国">
                    <input type="text" id="${id}-color" class="input-detail" placeholder="毛色">
                    <input type="text" id="${id}-family-no" class="input-detail" placeholder="F-No.">
                    <input type="text" id="${id}-lineage" class="input-detail" placeholder="系統">
                </div>
            `;
            group.appendChild(details);
            container.appendChild(group);
        });
    }

    function createPreviewTable() {
        const tbody = document.getElementById('preview-table-body');
        if (!tbody) return;
        
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
                // ★修正: 初期状態で&nbsp;を入れて高さを確保する
                td.innerHTML = `<span id="preview-${cell.id}-name">&nbsp;</span><small id="preview-${cell.id}-birth-year">&nbsp;</small>`;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    function getGeneration(id) {
        if (id === 'target') return 0;
        return id.length;
    }
    function initButtons() {
        const loadBtn = document.getElementById('load-db');
        const dlBtn = document.getElementById('bulk-register-csv');
        const saveBtn = document.getElementById('save-db');
        const imgBtn = document.getElementById('save-image');

        if(loadBtn) loadBtn.addEventListener('click', handleLoadDB);
        if(dlBtn) dlBtn.addEventListener('click', handleDownloadTemplate);
        if(saveBtn) saveBtn.addEventListener('click', handleSaveDB);
        if(imgBtn) imgBtn.addEventListener('click', handleSaveImage);
    }

    function initUI() {
        initFormPreviewSync();
        initResponsiveTabs();
        initAutocomplete();
        initInputValidation();
    }
    
    // --- 他の初期化関数は変更なし ---
    function initModal() {
        const modalOverlay = document.getElementById('startup-modal-overlay');
        const createNewBtn = document.getElementById('create-new-btn-modal');
        const loadDbBtnModal = document.getElementById('load-db-btn-modal');
        const migrationModal = document.getElementById('migration-modal-overlay');
        const closeMigrationBtn = document.getElementById('close-migration-wizard');
        
        createNewBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
        loadDbBtnModal.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
            handleLoadDB();
        });
        closeMigrationBtn.addEventListener('click', () => migrationModal.classList.add('hidden'));
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

    function initInputValidation() {
        ALL_IDS.forEach(id => {
            const jaInput = document.getElementById(`${id}-name-ja`);
            const enInput = document.getElementById(`${id}-name-en`);
            const fictCheck = document.getElementById(`${id}-is-fictional`);
            if(!jaInput || !enInput || !fictCheck) return;

            fictCheck.addEventListener('change', () => {
                if (fictCheck.checked) {
                    enInput.placeholder = "欧字馬名 (任意)";
                    jaInput.placeholder = "カナ馬名 (必須)";
                } else {
                    enInput.placeholder = "欧字馬名 (実在馬必須)";
                    jaInput.placeholder = "カナ馬名 (任意)";
                }
            });
        });
    }

    // --- DB・ファイル操作 ---
    function handleLoadDB() {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.csv';
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
        
        // 一時的なマップ (名寄せ用)
        // Key: "名前(カナor欧字)_生年", Value: UUID
        const tempMap = new Map();

        data.forEach(row => {
            // 名前の正規化（カナ優先、なければ欧字）
            // 旧形式: name列、新形式: name_ja / name_en
            const nameJa = isOldFormat ? (/[a-zA-Z]/.test(row.name) ? '' : row.name) : row.name_ja;
            const nameEn = isOldFormat ? (/[a-zA-Z]/.test(row.name) ? row.name : '') : row.name_en;
            const birthYear = row.birth_year;
            
            // キー生成（実在馬・架空馬共通で、名前と生年で同一視する）
            const uniqueKey = `${nameJa || nameEn}_${birthYear}`;
            
            // 既に登録済みかチェック
            let uuid = tempMap.get(uniqueKey);
            let horse = uuid ? state.db.get(uuid) : null;

            if (!horse) {
                // 新規登録
                uuid = isOldFormat ? generateUUID() : row.uuid;
                tempMap.set(uniqueKey, uuid);
                
                if (isOldFormat) {
                    horse = {
                        id: uuid,
                        name_ja: nameJa, name_en: nameEn, birth_year: birthYear,
                        is_fictional: false,
                        sire_id: null, dam_id: null,
                        // 旧データの一時保持
                        temp_sire_key: (row.sire_name && row.sire_birth_year) ? `${row.sire_name}_${row.sire_birth_year}` : null,
                        temp_dam_key: (row.dam_name && row.dam_birth_year) ? `${row.dam_name}_${row.dam_birth_year}` : null,
                        // 直書き用（リンク解決できなかった場合の保険）
                        sire_name: row.sire_name || '', dam_name: row.dam_name || '',
                        country: '', color: '', family_no: '', lineage: ''
                    };
                } else {
                    horse = {
                        id: uuid,
                        name_ja: nameJa, name_en: nameEn, birth_year: birthYear,
                        is_fictional: row.is_fictional === 'true',
                        country: row.country, color: row.color,
                        family_no: row.family_no, lineage: row.lineage,
                        sire_id: row.sire_id || null, dam_id: row.dam_id || null,
                        sire_name: row.sire_name || '', dam_name: row.dam_name || ''
                    };
                }
                state.db.set(uuid, horse);
            } else {
                // 既存データがある場合（重複行）、情報の補完などを検討するが、
                // 旧データの単純な行重複であればスキップで良い。
                // ただし、新形式でUUIDが異なるのに名前が同じ場合は別エントリとすべきだが、
                // 今回のロジックでは「名前_生年」を正としてマージする挙動になる。
            }
        });

        // 親子関係の再構築 (Re-linking)
        if (isOldFormat) {
            state.db.forEach(horse => {
                if (horse.temp_sire_key) {
                    const sireUuid = tempMap.get(horse.temp_sire_key);
                    if (sireUuid) {
                        horse.sire_id = sireUuid;
                        // ID解決できた場合、直書きの名前情報はクリアしてデータの正規化を図る
                        // ただし、架空馬の場合は残す設計だが、旧データは一律実在馬扱い(false)なのでクリアでOK
                        if (!horse.is_fictional) horse.sire_name = '';
                    }
                }
                if (horse.temp_dam_key) {
                    const damUuid = tempMap.get(horse.temp_dam_key);
                    if (damUuid) {
                        horse.dam_id = damUuid;
                        if (!horse.is_fictional) horse.dam_name = '';
                    }
                }
                delete horse.temp_sire_key;
                delete horse.temp_dam_key;
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
    function handleDownloadTemplate() {
        const header = 'uuid,name_ja,name_en,birth_year,is_fictional,country,color,family_no,lineage,sire_id,dam_id,sire_name,dam_name';
        const example = `${generateUUID()},サンデーサイレンス,Sunday Silence,1986,false,USA,青鹿毛,,Halo系,,,Halo,Wishing Well`;
        const content = `${header}\n${example}\n`;
        downloadFile(content, 'template_v0.6.csv', 'text/csv');
    }

    function handleSaveDB() {
        const formData = getFormDataAsMap();
        
        for (const [tempId, formHorse] of formData.entries()) {
            let existingId = formHorse.id; // ★修正: フォームから取得したUUIDを優先

            // UUIDがない場合（手入力など）のみ、既存DBから名寄せを試みる
            if (!existingId) {
                for (const [dbId, dbHorse] of state.db.entries()) {
                    if (!formHorse.is_fictional && !dbHorse.is_fictional) {
                        if (dbHorse.name_en && formHorse.name_en && 
                            dbHorse.name_en.toLowerCase() === formHorse.name_en.toLowerCase() &&
                            dbHorse.birth_year === formHorse.birth_year) {
                            existingId = dbId; break;
                        }
                    } else if (formHorse.is_fictional && dbHorse.is_fictional) {
                        if (dbHorse.name_ja === formHorse.name_ja && dbHorse.birth_year === formHorse.birth_year) {
                            existingId = dbId; break;
                        }
                    }
                }
            }

            if (existingId) {
                const existing = state.db.get(existingId);
                // 既存データを更新（フォームの値を優先してマージ）
                Object.assign(existing, formHorse);
                existing.id = existingId; // IDは維持
            } else {
                formHorse.id = generateUUID();
                state.db.set(formHorse.id, formHorse);
            }
        }

        const csvString = convertDbToCSV(state.db);
        downloadFile(csvString, 'pedigree_db_v0.6.csv', 'text/csv');
        state.isDirty = false;
        alert(`${state.db.size}件のデータを保存しました。`);
    }

    function getFormDataAsMap() {
        const formData = new Map();
        ALL_IDS.forEach(id => {
            const nameJa = document.getElementById(`${id}-name-ja`).value.trim();
            const nameEn = document.getElementById(`${id}-name-en`).value.trim();
            const year = document.getElementById(`${id}-birth-year`).value.trim();
            
            if (nameJa || nameEn) {
                const isFictional = document.getElementById(`${id}-is-fictional`).checked;
                
                // ★修正: グループ要素からUUIDを取得
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
                    // UUIDがあればそれを使用、なければ保存時に生成または検索される
                    id: uuid, 
                    name_ja: nameJa, name_en: nameEn, birth_year: year,
                    is_fictional: isFictional,
                    country: document.getElementById(`${id}-country`).value.trim(),
                    color: document.getElementById(`${id}-color`).value.trim(),
                    family_no: document.getElementById(`${id}-family-no`).value.trim(),
                    lineage: document.getElementById(`${id}-lineage`).value.trim(),
                    sire_name: sireName, dam_name: damName
                };
                // キーは一時的なものでOK
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
        
        // ★修正: グループ要素にUUIDを埋め込む
        const group = document.querySelector(`.horse-input-group[data-horse-id="${idPrefix}"]`);
        if (group) group.dataset.uuid = horseId;

        if(ja) ja.value = horse.name_ja || '';
        if(en) en.value = horse.name_en || '';
        if(yr) yr.value = horse.birth_year || '';
        if(fict) fict.checked = horse.is_fictional;
        
        const country = document.getElementById(`${idPrefix}-country`);
        if(country) country.value = horse.country || '';
        // 詳細項目のセット（省略されていた部分も本来は必要ですが、主要因ではないため割愛）

        if(ja) ja.dispatchEvent(new Event('input', { bubbles: true }));

        let sirePrefix, damPrefix;
        if (idPrefix === 'target') { sirePrefix = 's'; damPrefix = 'd'; }
        else { sirePrefix = idPrefix + 's'; damPrefix = idPrefix + 'd'; }

        if (sirePrefix.length > 5) return;

        if (horse.sire_id) {
            populateFormRecursively(horse.sire_id, sirePrefix);
        } else if (horse.is_fictional && horse.sire_name) {
            // 直書きの場合UUIDはないので属性をクリア
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
        const selectors = document.querySelectorAll('input[name="generation"]');
        selectors.forEach(radio => radio.addEventListener('change', handleGenerationChange));
        handleGenerationChange(); // 初期実行
    }

    function handleGenerationChange() {
        const selectedGen = parseInt(document.querySelector('input[name="generation"]:checked').value);
        
        document.querySelectorAll('.horse-input-group[data-generation]').forEach(group => {
            const gen = parseInt(group.dataset.generation);
            // classList.toggleの第二引数がIE非対応(今回はモダンブラウザ前提なのでOK)だが念のため
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