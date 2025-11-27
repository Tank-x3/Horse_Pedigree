document.addEventListener('DOMContentLoaded', () => {
    // --- モジュールからの読み込み ---
    const { GAS_API_URL, ALL_IDS } = App.Consts;
    const { generateUUID, downloadFile } = App.Utils;

    // --- 状態変数をGlobalスコープへ公開 ---
    window.App.State = {
        db: new Map(),
        isDirty: false,
        pendingSaveData: null,
        isLoading: false
    };
    // ローカル短縮形 (既存コードとの互換性のため)
    const state = window.App.State;

    // --- 初期化シーケンス ---
    initialize();

    async function initialize() {
        try {
            initButtons(); initModal(); 
            // DOM生成などはUIモジュールへ委譲
            App.UI.initDOM(); 
            App.UI.initGenerationSelector(); 
            App.UI.initUI();
            
            initPageLeaveWarning(); initFormDirtyStateTracking();
        } catch (e) { console.error('Initialization Error:', e); }

        if (typeof GAS_API_URL !== 'undefined' && GAS_API_URL) {
            App.UI.updateLoadingState(true, '読み込み中...', '共通データベースから最新情報を取得しています。');
            try {
                await fetchDB(true);
                App.UI.updateLoadingState(false);
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

    // --- ボタン・モーダル初期化 (イベント配線) ---
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
        if(imgBtn) imgBtn.onclick = App.UI.handleSaveImage.bind(App.UI);
        
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

    // --- DB操作ロジック ---
    async function fetchDB(isInitial = false) {
        try {
            const data = await App.API.fetchAllHorses();
            data.forEach(horse => {
                if(horse.id) state.db.set(horse.id, horse);
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
                throw error;
            } else {
                alert('データの読み込みに失敗しました。');
                throw error;
            }
        }
    }

    async function postDB(dataToSave) {
        if(state.isLoading) return;
        state.isLoading = true;
        App.UI.updateLoadingState(true, '保存中...', 'サーバーにデータを送信しています...');

        try {
            const horsesArray = Array.from(dataToSave.values());
            await App.API.saveHorses(horsesArray);
            
            alert('保存が完了しました。');
            state.isDirty = false;
            await fetchDB(); 
        } catch (error) {
            console.error('Post Error:', error);
            alert(`保存に失敗しました。\n${error.message}`);
        } finally {
            state.isLoading = false;
            App.UI.updateLoadingState(false);
        }
    }

    async function handleSaveDBRequest() {
        const hasInput = ALL_IDS.some(id => {
            const ja = document.getElementById(`${id}-name-ja`);
            const en = document.getElementById(`${id}-name-en`);
            return (ja && ja.value.trim()) || (en && en.value.trim());
        });
        if (hasInput && !App.UI.checkRequiredFields()) return;

        if(state.isLoading) return;
        state.isLoading = true;
        App.UI.updateLoadingState(true, '同期中...', 'データの競合を確認しています...');

        try {
            await fetchDB();
        } catch (e) {
            state.isLoading = false;
            App.UI.updateLoadingState(false);
            return;
        }
        
        const formData = App.UI.getFormDataAsMap();
        const conflicts = [];

        for (const [tempId, formHorse] of formData.entries()) {
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

        if (conflicts.length > 0) {
            state.isLoading = false;
            App.UI.updateLoadingState(false);
            
            state.pendingSaveData = formData;
            App.UI.showSaveConfirmModal(conflicts, formData);
        } else {
            state.isLoading = false;
            saveDataDirectly(formData);
        }
    }

    function executeSaveDB() {
        const listContainer = document.getElementById('save-confirm-list');
        const cards = listContainer.querySelectorAll('.confirm-card');
        cards.forEach((card, index) => {
            const actionInput = card.querySelector(`input[name="action_${index}"]:checked`);
            const tempId = card.dataset.tempId;

            if (actionInput) {
                if (actionInput.value === 'new') {
                    const formHorse = state.pendingSaveData.get(tempId);
                    if (formHorse) {
                        formHorse.id = null; 
                        state.pendingSaveData.set(tempId, formHorse);
                    }
                } else if (actionInput.value === 'skip') {
                    state.pendingSaveData.delete(tempId);
                } else {
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
        const nameMap = new Map();

        for (const horse of formData.values()) {
            const name = horse.name_ja || horse.name_en;
            if (!name) continue;
            const key = `${name}_${horse.birth_year || ''}`;

            if (nameMap.has(key)) {
                horse.id = nameMap.get(key);
            } 
            else {
                if (!horse.id) horse.id = generateUUID();
                nameMap.set(key, horse.id);
            }
        }

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

        const newDb = new Map(state.db);
        for (const horse of formData.values()) {
            if (newDb.has(horse.id)) {
                Object.assign(newDb.get(horse.id), horse);
            } else {
                newDb.set(horse.id, horse);
            }
        }

        if (newDb.size > 0) {
            postDB(newDb);
        } else {
            alert('保存するデータがありません。');
        }
    }

    function handleSaveLocal() {
        if (!confirm('現在のデータベースの内容をCSVファイルとしてダウンロードします。\nこの操作では、クラウド上の共有データベースには保存されません。\n\n続行しますか？')) return;

        const formData = App.UI.getFormDataAsMap();
        const nameMap = new Map();
        
        for (const horse of state.db.values()) {
            const name = horse.name_ja || horse.name_en;
            if (name) {
                const key = `${name}_${horse.birth_year || ''}`;
                nameMap.set(key, horse.id);
            }
        }

        for (const horse of formData.values()) {
            const name = horse.name_ja || horse.name_en;
            if (!name) continue;
            const key = `${name}_${horse.birth_year || ''}`;

            if (nameMap.has(key)) {
                horse.id = nameMap.get(key);
            } else {
                if (!horse.id) horse.id = generateUUID();
                nameMap.set(key, horse.id);
            }
        }

        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;

            let sId, dId;
            if (id === 'target') { sId = 's'; dId = 'd'; }
            else { sId = id + 's'; dId = id + 'd'; }
            
            if (formData.has(sId)) horse.sire_id = formData.get(sId).id;
            if (formData.has(dId)) horse.dam_id = formData.get(dId).id;
        });

        for (const horse of formData.values()) {
            if (state.db.has(horse.id)) {
                Object.assign(state.db.get(horse.id), horse);
            } else {
                state.db.set(horse.id, horse);
            }
        }
        
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (horse && horse.id) {
                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                if (group) group.dataset.uuid = horse.id;
            }
        });

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
                if (horse.temp_sire_key) delete horse.temp_sire_key;
                if (horse.temp_dam_key) delete horse.temp_dam_key;
            });
            document.getElementById('migration-modal-overlay').classList.remove('hidden');
        }
        alert(`${data.length}件のデータを読み込みました。\n現在の全データ数: ${state.db.size}件`);
        state.isDirty = false;
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

    function initPageLeaveWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }
    function initFormDirtyStateTracking() {
        const form = document.querySelector('.form-container');
        if(form) form.addEventListener('input', () => state.isDirty = true);
    }
});