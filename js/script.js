document.addEventListener('DOMContentLoaded', () => {
    // --- アプリケーション設定 ---
    const IMAGE_WIDTHS = { 2: 800, 3: 1000, 4: 1200, 5: 1400 };
    // ★GASのURL
    const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxT1WVuSeaxXIkvwJ2xJ56RrJjIgqPerVvHExbbAm8DYlfuy6599_-fFsfi7iCUKQST/exec'; 
    
    // --- 状態管理 ---
    const state = {
        db: new Map(),
        isDirty: false,
        pendingSaveData: null,
        isLoading: false
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

    async function initialize() {
        try {
            initButtons(); initModal(); initDOM(); 
            initGenerationSelector(); initUI();
            initPageLeaveWarning(); initFormDirtyStateTracking();
        } catch (e) { console.error('Initialization Error:', e); }

        if (typeof GAS_API_URL !== 'undefined' && GAS_API_URL) {
            // ★修正: メッセージ指定
            updateLoadingState(true, '読み込み中...', '共通データベースから最新情報を取得しています。');
            try {
                await fetchDB(true);
                updateLoadingState(false);
                document.getElementById('startup-modal-overlay').classList.remove('hidden');
            } catch (e) {
                // fetchDB内でエラー表示済み
            }
        } else {
            console.warn('GAS_API_URL is not set.');
            document.getElementById('global-loading-overlay').classList.add('hidden');
            document.getElementById('startup-modal-overlay').classList.remove('hidden');
        }
    }

    // --- ボタン・モーダル初期化 ---
    function initButtons() {
        const loadBtn = document.getElementById('load-db');
        const saveLocalBtn = document.getElementById('save-local');
        const saveBtn = document.getElementById('save-db');
        const imgBtn = document.getElementById('save-image');
        const cancelSaveBtn = document.getElementById('cancel-save-btn');
        const execSaveBtn = document.getElementById('execute-save-btn');

        if(loadBtn) loadBtn.onclick = handleLoadDB;
        if(saveLocalBtn) saveLocalBtn.onclick = handleSaveLocal;
        if(saveBtn) saveBtn.onclick = handleSaveDBRequest;
        if(imgBtn) imgBtn.onclick = handleSaveImage;
        
        if(cancelSaveBtn) cancelSaveBtn.onclick = () => {
            document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
            state.pendingSaveData = null;
        };
        if(execSaveBtn) execSaveBtn.onclick = executeSaveDB;
    }

    function initModal() {
        const modalOverlay = document.getElementById('startup-modal-overlay');
        const startCloudBtn = document.getElementById('start-cloud-btn-modal');
        const loadLocalLink = document.getElementById('load-local-link-modal');
        const migrationModal = document.getElementById('migration-modal-overlay');
        const closeMigrationBtn = document.getElementById('close-migration-wizard');
        
        if(startCloudBtn) startCloudBtn.onclick = () => modalOverlay.classList.add('hidden');
        
        if(loadLocalLink) loadLocalLink.onclick = (e) => {
            e.preventDefault();
            modalOverlay.classList.add('hidden');
            handleLoadDB();
        };
        
        if(closeMigrationBtn) closeMigrationBtn.onclick = () => migrationModal.classList.add('hidden');
    }

    // --- DOM生成ロジック ---
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
            const labelInfo = GENERATION_LABELS[id] || { label: id.toUpperCase(), tag: gen === 3 ? 'h4' : 'h5' };
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
                
                td.innerHTML = `
                    <div class="pedigree-cell-content">
                        <span class="horse-name" id="preview-${cell.id}-name">&nbsp;</span>
                        <span class="horse-name-en" id="preview-${cell.id}-name-en"></span>
                        <div class="horse-info-row">
                            <span class="horse-year" id="preview-${cell.id}-year"></span>
                            <span class="horse-color" id="preview-${cell.id}-color"></span>
                        </div>
                        <div class="horse-lineage" id="preview-${cell.id}-lineage"></div>
                        <div class="horse-country" id="preview-${cell.id}-country"></div>
                    </div>
                `;
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
        initInputValidation();
    }

    function initGenerationSelector() {
        const selectors = document.querySelectorAll('input[name="generation"]');
        if (selectors.length === 0) return;
        selectors.forEach(radio => {
            radio.onclick = handleGenerationChange;
        });
        handleGenerationChange();
    }

    function handleGenerationChange() {
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
    }
    function initFormPreviewSync() {
        ALL_IDS.forEach(id => {
            // 詳細項目も監視対象
            const inputs = [
                `${id}-name-ja`, `${id}-name-en`, `${id}-birth-year`, `${id}-is-fictional`,
                `${id}-country`, `${id}-color`, `${id}-family-no`, `${id}-lineage`
            ];
            inputs.forEach(inId => {
                const el = document.getElementById(inId);
                if(el) {
                    const eventType = el.type === 'checkbox' ? 'change' : 'input';
                    el.addEventListener(eventType, () => updatePreview(id));
                }
            });
            updatePreview(id);
        });
    }

    function updatePreview(id) {
        const ja = document.getElementById(`${id}-name-ja`)?.value.trim();
        const en = document.getElementById(`${id}-name-en`)?.value.trim();
        const year = document.getElementById(`${id}-birth-year`)?.value.trim();
        const isFict = document.getElementById(`${id}-is-fictional`)?.checked;
        
        const country = document.getElementById(`${id}-country`)?.value.trim();
        const color = document.getElementById(`${id}-color`)?.value.trim();
        const lineage = document.getElementById(`${id}-lineage`)?.value.trim();
        
        let dispName = ja || en || '&nbsp;';
        if ((ja || en) && isFict) dispName = `【${dispName}】`;

        if (id === 'target') {
            const title = document.getElementById('preview-title');
            const rawName = ja || en;
            const text = rawName ? `${rawName}${year ? ` (${year})` : ''} の血統` : '血統表プレビュー';
            title.textContent = text;
        } else {
            const cell = document.querySelector(`.pedigree-cell[data-horse-id="${id}"]`); // ※注意: HTML側でdata属性付与が必要だが、現状ないのでIDから逆算するか、updatePreview内ではID指定で要素を取る
            // 既存コード: preview-${id}-name を使用
            const pName = document.getElementById(`preview-${id}-name`);
            if(!pName) return;
            
            const cellEl = pName.closest('.pedigree-cell');
            const col = parseInt(cellEl?.dataset.col);
            
            if (col === 5) {
                let text = dispName;
                if ((ja || en) && year) text += ` (${year})`;
                else if (year) text = `(${year})`;
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
                if (pLineage) pLineage.textContent = lineage || '';
                if (pCountry) pCountry.textContent = country || '';
            }
        }
        
        // ★追加: クロス判定の更新 (入力のたびに再計算)
        // 遅延実行してパフォーマンスへの影響を抑える（debounce）のが理想だが、今回は直接呼ぶ
        updateCrossList();
    }

    // --- GAS通信関数 ---
    // ★修正: ローディング表示の責務を呼び出し元に移譲
    async function fetchDB(isInitial = false) {
        // 呼び出し元で updateLoadingState(true, ...) すること

        try {
            const response = await fetch(GAS_API_URL);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            
            data.forEach(row => {
                if(row.uuid) {
                    row.id = row.uuid;
                    row.is_fictional = (row.is_fictional === 'true' || row.is_fictional === true);
                    state.db.set(row.uuid, row);
                }
            });
            console.log(`DB Loaded: ${state.db.size} records`);
        } catch (error) {
            console.error('Fetch Error:', error);
            if (isInitial) {
                const msgEl = document.getElementById('loading-message');
                if(msgEl) {
                    msgEl.textContent = 'データの読み込みに失敗しました。リロードしてください。';
                    msgEl.style.color = 'red';
                }
                throw error; // 初期化失敗として上に投げる
            } else {
                alert('データの読み込みに失敗しました。');
                throw error;
            }
        }
        // finallyでの updateLoadingState(false) も削除し、呼び出し元で行う
    }

    async function postDB(dataToSave) {
        if(state.isLoading) return;
        state.isLoading = true;
        // ★修正: メッセージを「保存中」に
        updateLoadingState(true, '保存中...', 'サーバーにデータを送信しています...');

        try {
            const payload = Array.from(dataToSave.values()).map(h => {
                const item = { ...h, uuid: h.id };
                return item;
            });

            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                alert('保存が完了しました。');
                state.isDirty = false;
                // 保存後の再取得時はメッセージを変えたいが、一瞬なので省略可、
                // あるいはここで updateLoadingState(true, '同期中...', '最新情報を取得しています...'); としても良い
                await fetchDB(); 
            } else {
                throw new Error(result.message || 'Unknown Error');
            }

        } catch (error) {
            console.error('Post Error:', error);
            alert(`保存に失敗しました。\n${error.message}`);
        } finally {
            state.isLoading = false;
            updateLoadingState(false);
        }
    }

    function updateLoadingState(isLoading, title = '処理中...', message = '') {
        const saveBtn = document.getElementById('save-db');
        const overlay = document.getElementById('global-loading-overlay');
        const titleEl = document.getElementById('loading-title');
        const msgEl = document.getElementById('loading-message');

        // ボタン制御
        if(saveBtn) {
            saveBtn.disabled = isLoading;
            saveBtn.textContent = isLoading ? '通信中...' : 'サーバーに保存';
        }

        // オーバーレイ制御
        if (overlay && titleEl && msgEl) {
            if (isLoading) {
                titleEl.textContent = title;
                msgEl.textContent = message || title;
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }
    }
    // --- DB保存ロジック ---
    async function handleSaveDBRequest() {
        const hasInput = ALL_IDS.some(id => {
            const ja = document.getElementById(`${id}-name-ja`);
            const en = document.getElementById(`${id}-name-en`);
            return (ja && ja.value.trim()) || (en && en.value.trim());
        });
        if (hasInput && !checkRequiredFields()) return;

        // ★追加: 保存前の同期フェーズであることを表示
        if(state.isLoading) return;
        state.isLoading = true;
        updateLoadingState(true, '同期中...', 'データの競合を確認しています...');

        try {
            await fetchDB();
        } catch (e) {
            state.isLoading = false;
            updateLoadingState(false);
            return; // 読み込み失敗なら保存中断
        }
        
        // ここで一度ローディングを解除しない（シームレスに移行するか、あるいは解除するか）
        // 競合チェック処理は一瞬なので、解除せずに進めるのが自然
        // ただし、モーダルを出す場合は解除する必要がある

        const formData = getFormDataAsMap();
        const conflicts = [];

        // ... (中略: 競合チェックロジックは変更なし) ...
        for (const [tempId, formHorse] of formData.entries()) {
            // ... (省略: 変更なし) ...
            // v0.8.4のロジックそのまま
            let targetUUID = formHorse.id;
            let dbHorse = null;
            if (!targetUUID || !state.db.has(targetUUID)) {
                for (const [existingId, existingHorse] of state.db.entries()) {
                    if (!formHorse.is_fictional && !existingHorse.is_fictional) {
                        if (existingHorse.name_en && formHorse.name_en &&
                            existingHorse.name_en.toLowerCase().trim() === formHorse.name_en.toLowerCase().trim() &&
                            String(existingHorse.birth_year) === String(formHorse.birth_year)) {
                            targetUUID = existingId; dbHorse = existingHorse; break;
                        }
                    } else if (existingHorse.name_ja === formHorse.name_ja && String(existingHorse.birth_year) === String(formHorse.birth_year)) {
                        targetUUID = existingId; dbHorse = existingHorse; break;
                    }
                }
            } else { dbHorse = state.db.get(targetUUID); }

            if (dbHorse) {
                const diffs = [];
                const fields = ['name_ja', 'name_en', 'birth_year', 'country', 'color', 'family_no', 'lineage'];
                fields.forEach(field => {
                    const dbVal = String(dbHorse[field] || '').trim();
                    const formVal = String(formHorse[field] || '').trim();
                    if (dbVal !== '' && dbVal !== formVal) diffs.push({ field, old: dbVal, new: formVal });
                });
                if (dbHorse.is_fictional !== formHorse.is_fictional) {
                    if (formHorse.is_fictional) dbHorse.is_fictional = true; 
                }
                if (diffs.length > 0) {
                    formHorse.id = targetUUID; 
                    conflicts.push({ horse: formHorse, dbHorse, diffs });
                } else {
                    Object.assign(dbHorse, formHorse);
                    if (formHorse.id && formHorse.id !== targetUUID) {
                        state.db.delete(formHorse.id); state.db.set(targetUUID, dbHorse);
                    }
                }
            } else { formData.set(tempId, formHorse); }
        }
        // ... (中略終了) ...

        if (conflicts.length > 0) {
            // ★修正: モーダルを出す前にローディングを消す
            state.isLoading = false;
            updateLoadingState(false);
            
            state.pendingSaveData = formData;
            showSaveConfirmModal(conflicts);
        } else {
            // 競合なし -> そのまま送信へ (ローディング表示は継続したいが、postDBが再度呼ぶのでOK)
            // ただし state.isLoading = true のまま postDB を呼ぶと冒頭のガードで弾かれるため、
            // 一旦 false に戻す必要がある。
            state.isLoading = false;
            saveDataDirectly(formData);
        }
    }

    // ★修正: 競合解決オプションの追加
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
    }

    // ★修正: スキップ処理の実装
    function executeSaveDB() {
        const listContainer = document.getElementById('save-confirm-list');
        const cards = listContainer.querySelectorAll('.confirm-card');
        cards.forEach((card, index) => {
            const actionInput = card.querySelector(`input[name="action_${index}"]:checked`);
            const tempId = card.dataset.tempId;

            if (actionInput) {
                if (actionInput.value === 'new') {
                    // 新規登録: IDを消して新規発行させる
                    const formHorse = state.pendingSaveData.get(tempId);
                    if (formHorse) {
                        formHorse.id = null; 
                        state.pendingSaveData.set(tempId, formHorse);
                    }
                } else if (actionInput.value === 'skip') {
                    // ★追加: DB維持（スキップ）: 保存対象リストから削除する
                    // これにより、saveDataDirectlyでのマージ対象外となり、DBの値が維持される
                    state.pendingSaveData.delete(tempId);
                } else {
                    // 更新 (update): DBのオブジェクトをフォームの内容で更新
                    const formHorse = state.pendingSaveData.get(tempId);
                    const dbHorse = state.db.get(formHorse.id);
                    if(dbHorse) Object.assign(dbHorse, formHorse);
                }
            }
        });
        
        saveDataDirectly(state.pendingSaveData);
        document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
        state.pendingSaveData = null;
    }

    function saveDataDirectly(formData) {
        // ★修正: フォームデータ内での名寄せ (同一馬へのUUID共有)
        const nameMap = new Map(); // Key: "名前_生年", Value: UUID

        // 1. UUIDの割り当て (名寄せしながら)
        for (const horse of formData.values()) {
            const name = horse.name_ja || horse.name_en;
            if (!name) continue;
            const key = `${name}_${horse.birth_year || ''}`;

            // 既にこの名前でUUIDが決まっていればそれを使う
            if (nameMap.has(key)) {
                horse.id = nameMap.get(key);
            } 
            // まだなければ、既存IDがあればそれ、なければ新規発行
            else {
                if (!horse.id) horse.id = generateUUID();
                nameMap.set(key, horse.id);
            }
        }

        // 2. 親子リンクの解決
        // UUIDが統合されたので、リンク先も正しいUUIDになる
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;

            let sireIdPrefix, damIdPrefix;
            if (id === 'target') { sireIdPrefix = 's'; damIdPrefix = 'd'; }
            else { sireIdPrefix = id + 's'; damIdPrefix = id + 'd'; }

            if (formData.has(sireIdPrefix)) {
                horse.sire_id = formData.get(sireIdPrefix).id;
            }
            if (formData.has(damIdPrefix)) {
                horse.dam_id = formData.get(damIdPrefix).id;
            }
        });

        // 3. 既存DBへのマージ
        const newDb = new Map(state.db);
        for (const horse of formData.values()) {
            // 統合された結果、同じUUIDのデータが複数回setされることになるが、
            // 内容は同じ（はず）なので問題ない。
            if (newDb.has(horse.id)) {
                Object.assign(newDb.get(horse.id), horse);
            } else {
                newDb.set(horse.id, horse);
            }
        }

        // 4. 送信
        if (newDb.size > 0) {
            postDB(newDb);
        } else {
            alert('保存するデータがありません。');
        }
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
    function handleSaveLocal() {
        if (!confirm('現在のデータベースの内容をCSVファイルとしてダウンロードします。\nこの操作では、クラウド上の共有データベースには保存されません。\n\n続行しますか？')) return;

        // ★修正: 保存前にフォームの内容をDBに取り込む処理を追加
        const formData = getFormDataAsMap();
        
        // 1. 名寄せ用マップ作成 (既存DBの情報を優先)
        const nameMap = new Map();
        
        // 既存DBのUUIDをマップに登録
        for (const horse of state.db.values()) {
            const name = horse.name_ja || horse.name_en;
            if (name) {
                const key = `${name}_${horse.birth_year || ''}`;
                nameMap.set(key, horse.id);
            }
        }

        // 2. フォームデータのUUID解決
        for (const horse of formData.values()) {
            const name = horse.name_ja || horse.name_en;
            if (!name) continue;
            const key = `${name}_${horse.birth_year || ''}`;

            if (nameMap.has(key)) {
                // 既存またはフォーム内で先に登場した同名馬のUUIDを使用
                horse.id = nameMap.get(key);
            } else {
                // 完全新規ならUUID発行
                if (!horse.id) horse.id = generateUUID();
                nameMap.set(key, horse.id);
            }
        }

        // 3. 親子リンクの解決 (UUIDベース)
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;

            let sId, dId;
            if (id === 'target') { sId = 's'; dId = 'd'; }
            else { sId = id + 's'; dId = id + 'd'; }
            
            // フォーム内に親がいる場合はそのUUIDを使用
            if (formData.has(sId)) horse.sire_id = formData.get(sId).id;
            if (formData.has(dId)) horse.dam_id = formData.get(dId).id;
        });

        // 4. state.db へのマージ
        for (const horse of formData.values()) {
            if (state.db.has(horse.id)) {
                // 既存データがある場合は上書き更新
                Object.assign(state.db.get(horse.id), horse);
            } else {
                // 新規データなら追加
                state.db.set(horse.id, horse);
            }
        }
        
        // 5. DOM上のUUID属性も更新 (次回の保存のために連携しておく)
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (horse && horse.id) {
                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                if (group) group.dataset.uuid = horse.id;
            }
        });

        // 6. CSV出力
        const csvString = convertDbToCSV(state.db);
        downloadFile(csvString, 'pedigree_db_local.csv', 'text/csv');
        
        state.isDirty = false;
        alert('CSVファイルを保存しました。\n現在入力中のデータもリストに追加されました。');
    }

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
            let horse = uuid ? state.db.get(uuid) : (row.uuid ? state.db.get(row.uuid) : null);

            if (!horse) {
                uuid = isOldFormat ? generateUUID() : (row.uuid || generateUUID());
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
        alert(`${data.length}件のデータを読み込みました。\n現在の全データ数: ${state.db.size}件`);
        state.isDirty = false;
    }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // --- UI系ヘルパー ---
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
            jaInput.addEventListener('input', () => validateInput(jaInput, 'ja'));
            enInput.addEventListener('input', () => validateInput(enInput, 'en'));
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
            enInput.placeholder = "欧字馬名 (任意)"; jaInput.placeholder = "カナ馬名 (必須)";
        } else {
            enInput.placeholder = "欧字馬名 (必須)"; jaInput.placeholder = "カナ馬名 (任意)";
        }
    }
    // ★修正: 馬名入力制限の緩和
    function validateInput(input, type) {
        const val = input.value;
        if (!val) { input.classList.remove('input-error'); return; }
        let isValid = true;

        // 日本語名(ja): 制限を解除 (漢字、ローマ数字、記号などを許容)
        // 欧字名(en): 引き続き半角英数記号のみとする (必要に応じてここも緩和可能)
        if (type === 'en') isValid = /^[\x20-\x7E]+$/.test(val);
        
        if (isValid) input.classList.remove('input-error');
        else input.classList.add('input-error');
    }
    function checkRequiredFields() {
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
    // --- オートコンプリート ---
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
    // --- インブリード判定ロジック (v0.11.9: 完全包含クロスの自動消去ロジック強化) ---
    function updateCrossList() {
        const formData = getFormDataAsMap();
        
        // ★Step 0: メモリ内名寄せ
        const uniqueMap = new Map();
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;
            const name = horse.name_ja || horse.name_en;
            if (!name) return;
            const key = `${name}_${horse.birth_year || ''}`;
            if (!uniqueMap.has(key)) {
                const uuid = horse.id || `temp_${generateUUID()}`;
                uniqueMap.set(key, uuid);
            }
            horse.resolvedId = uniqueMap.get(key);
        });

        // 親ID解決
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse || !horse.resolvedId) return;
            let sId, dId;
            if (id === 'target') { sId = 's'; dId = 'd'; }
            else { sId = id + 's'; dId = id + 'd'; }
            const sire = formData.get(sId);
            const dam = formData.get(dId);
            horse.resolvedSireId = sire ? sire.resolvedId : null;
            horse.resolvedDamId = dam ? dam.resolvedId : null;
        });

        // ★Step 1: 全祖先データの構築
        const ancestors = []; 
        const traverse = (currentId, currentPath, gen) => {
            if (gen > 5) return;
            const horse = formData.get(currentId);
            if (!horse || !horse.resolvedId) return;
            if (gen > 0) {
                ancestors.push({
                    uuid: horse.resolvedId,
                    name: horse.name_ja || horse.name_en,
                    path: [...currentPath], 
                    gen: gen,
                    sireId: horse.resolvedSireId,
                    damId: horse.resolvedDamId,
                    htmlId: currentId
                });
            }
            const nextPath = [...currentPath, horse.resolvedId];
            let sKey, dKey;
            if (currentId === 'target') { sKey='s'; dKey='d'; }
            else { sKey=currentId+'s'; dKey=currentId+'d'; }
            traverse(sKey, nextPath, gen + 1);
            traverse(dKey, nextPath, gen + 1);
        };
        traverse('target', [], 0);

        // ★Step 2: グループIDの付与 (Union-Find)
        const uf = new Map();
        const find = (id) => {
            if (!uf.has(id)) uf.set(id, id);
            if (uf.get(id) === id) return id;
            const root = find(uf.get(id));
            uf.set(id, root);
            return root;
        };
        const union = (id1, id2) => {
            const root1 = find(id1);
            const root2 = find(id2);
            if (root1 !== root2) uf.set(root2, root1);
        };

        const siblingsMap = new Map(); 
        ancestors.forEach(anc => {
            find(anc.uuid);
            if (anc.sireId && anc.damId) {
                const pairKey = `${anc.sireId}_${anc.damId}`;
                if (!siblingsMap.has(pairKey)) siblingsMap.set(pairKey, new Set());
                siblingsMap.get(pairKey).add(anc.uuid);
            }
        });
        siblingsMap.forEach((uuidSet) => {
            const uuids = Array.from(uuidSet);
            if (uuids.length > 1) {
                const first = uuids[0];
                for (let i = 1; i < uuids.length; i++) {
                    union(first, uuids[i]);
                }
            }
        });
        ancestors.forEach(anc => {
            anc.groupId = find(anc.uuid);
        });

        // ★Step 3: クロス判定 (一次判定)
        ancestors.sort((a, b) => a.gen - b.gen);
        const tempValidCrossGroups = new Set();
        const groups = new Map();
        ancestors.forEach(anc => {
            if (!groups.has(anc.groupId)) groups.set(anc.groupId, []);
            groups.get(anc.groupId).push(anc);
        });

        // マスク処理用の一時セット (Step 3内でのみ有効な簡易マスク)
        // ※ここでの判定は「クロスとして成立しうるか」の最低ラインを決める
        groups.forEach((members, groupId) => {
            if (members.length < 2) return; 

            const viaCrossIDs = new Set();
            let unmaskedCount = 0;
            const uniqueUUIDs = new Set(members.map(m => m.uuid));
            const isSameHorseGroup = (uniqueUUIDs.size === 1);

            members.forEach(member => {
                let foundDominantCrossId = null;
                // パス走査: 既に「有効」と判定されたクロスを経由しているか
                for (let i = member.path.length - 1; i >= 0; i--) {
                    const pathUuid = member.path[i];
                    const pathGroupId = find(pathUuid);
                    if (tempValidCrossGroups.has(pathGroupId)) {
                        foundDominantCrossId = pathGroupId;
                        break;
                    }
                }
                if (foundDominantCrossId) {
                    viaCrossIDs.add(foundDominantCrossId);
                } else {
                    unmaskedCount++;
                }
            });

            // 条件: 独立ライン1本以上 OR (同一馬かつ複数クロス経由)
            let isValidCross = false;
            if (unmaskedCount >= 1) isValidCross = true;
            else if (isSameHorseGroup && viaCrossIDs.size >= 2) isValidCross = true;

            if (isValidCross) tempValidCrossGroups.add(groupId);
        });

        // ★Step 4: 親子包含チェックによる冗長クロスの削除 (修正版)
        const finalValidCrossGroups = new Set(tempValidCrossGroups);

        tempValidCrossGroups.forEach(groupIdA => {
            const membersA = groups.get(groupIdA);
            
            // 判定: 「このクロスのすべての登場箇所において、その子が『同一の血統グループ』に属しているか？」
            // もしそうなら、この親クロスの血量はすべてその子グループを通じて流れているため、
            // 子グループが表示されるか否かに関わらず、親は冗長情報として削除する。
            
            let isRedundant = true;
            let commonChildGroupId = null;
            let firstLoop = true;

            for (const memberA of membersA) {
                // path配列の末尾が「その馬の子」のUUID
                if (memberA.path.length === 0) {
                    // ターゲット自身の場合（Gen 0）、子はいないので判定不能（通常クロス判定対象外）
                    isRedundant = false;
                    break;
                }
                
                const childUuid = memberA.path[memberA.path.length - 1];
                const childGroupId = find(childUuid);

                if (firstLoop) {
                    commonChildGroupId = childGroupId;
                    firstLoop = false;
                } else {
                    if (commonChildGroupId !== childGroupId) {
                        // 子のグループが不一致 = 異なる系統に分岐している
                        // -> この親は分岐点となる共通祖先なので、消してはいけない
                        isRedundant = false;
                        break;
                    }
                }
            }

            if (isRedundant) {
                finalValidCrossGroups.delete(groupIdA);
            }
        });

        // ★Step 5: レンダリング
        const crossResults = [];
        groups.forEach((members, groupId) => {
            if (finalValidCrossGroups.has(groupId)) {
                const names = [...new Set(members.map(m => m.name))].join(', ');
                let totalPct = 0;
                members.forEach(m => {
                    totalPct += 100 / Math.pow(2, m.gen);
                });
                const gens = members.map(m => m.gen).sort((a, b) => a - b).join(' x ');
                
                crossResults.push({
                    name: names,
                    pct: totalPct,
                    gens: gens,
                    ids: members.map(m => m.htmlId)
                });
            }
        });

        renderCrossList(crossResults);
    }

    function renderCrossList(crosses) {
        const container = document.getElementById('cross-list-container');
        if(!container) return; // HTMLに追加が必要

        // ハイライトリセット
        document.querySelectorAll('.pedigree-cell .horse-name').forEach(el => {
            el.classList.remove('cross-highlight-text');
        });

        if (crosses.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        let html = '<span class="cross-list-title">5代内クロス:</span> ';
        
        // 血量順、世代順などでソートするとより良いが、今回は登場順
        crosses.forEach(cross => {
            const pctStr = parseFloat(cross.pct.toFixed(2)) + '%';
            html += `<span class="cross-item"><span class="cross-item-name">${cross.name}</span> ${pctStr} (${cross.gens})</span> `;

            // ハイライト適用
            cross.ids.forEach(htmlId => {
                const span = document.getElementById(`preview-${htmlId}-name`);
                if (span) span.classList.add('cross-highlight-text');
            });
        });

        container.innerHTML = html;
    }

    async function handleSaveImage() {
        const titleEl = document.getElementById('preview-title'); // span
        const tableWrapper = document.querySelector('.pedigree-table-wrapper'); // テーブルのラッパー
        const crossList = document.getElementById('cross-list-container'); // クロスリスト
        
        const ja = document.getElementById('target-name-ja').value.trim();
        const en = document.getElementById('target-name-en').value.trim();
        const year = document.getElementById('target-birth-year').value.trim();
        const name = ja || en;
        const selectedGen = document.querySelector('input[name="generation"]:checked').value;
        let fileName = `${selectedGen}代血統表.png`;
        if (name) fileName = `${name}${year ? `(${year})` : ''}_${fileName}`;

        const cloneContainer = document.createElement('div');
        cloneContainer.className = 'clone-container-for-image';
        
        // タイトル生成
        const h2 = document.createElement('h2');
        const clonedSpan = titleEl.cloneNode(true);
        h2.style.fontSize = '24px';
        h2.style.fontWeight = 'bold';
        h2.style.margin = '0 0 15px 0';
        h2.style.textAlign = 'left';
        h2.appendChild(clonedSpan);
        cloneContainer.appendChild(h2);
        
        // テーブル (WrapperごとではなくTableのみクローン)
        const table = document.querySelector('.pedigree-table');
        cloneContainer.appendChild(table.cloneNode(true));

        // ★追加: クロスリスト
        if (crossList && crossList.style.display !== 'none') {
            const clonedCross = crossList.cloneNode(true);
            // スタイル調整 (幅など)
            clonedCross.style.marginTop = '10px';
            clonedCross.style.borderTop = 'none'; // 画像内では線なしで見せる等の調整可
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
    }
});