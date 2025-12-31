document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 0. 定数・状態管理 (Constants & State)
    // ==========================================
    const { GAS_API_URL, ALL_IDS, ANCESTOR_IDS } = App.Consts;
    const { generateUUID, downloadFile } = App.Utils;

    // グローバルステート
    window.App.State = {
        db: new Map(),
        isDirty: false,
        pendingSaveData: null,
        isLoading: false
    };
    const state = window.App.State;

    // ログ出力ヘルパー
    const log = (cat, msg, data = null) => {
        if (window.App.Logger) window.App.Logger.add(cat, msg, data);
    };

    // ==========================================
    // 1. 初期化プロセス (Initialization)
    // ==========================================

    initialize();

    async function initialize() {
        try {
            log('SYSTEM', 'App Initializing...');

            initButtons();
            initModal();
            App.UI.initDOM();
            App.UI.initGenerationSelector();
            App.UI.initUI();

            initPageLeaveWarning();
            initFormDirtyStateTracking();
        } catch (e) { console.error('Initialization Error:', e); }

        // クラウドDBへの接続
        if (typeof GAS_API_URL !== 'undefined' && GAS_API_URL) {
            App.UI.setGlobalLoading(true, '読み込み中...', '共通データベースから最新情報を取得しています。');
            try {
                await fetchDB(true);
                App.UI.setGlobalLoading(false);
                App.UI.showToast(`クラウドDBに接続しました（${state.db.size}件）`);
            } catch (e) {
                // fetchDB内でエラー表示済み
            }
        } else {
            console.warn('GAS_API_URL is not set.');
            document.getElementById('global-loading-overlay').classList.add('hidden');
            App.UI.showToast('オフラインモードで起動しました');
        }
    }

    function initButtons() {
        const loadBtn = document.getElementById('load-db');
        const saveLocalBtn = document.getElementById('save-local');
        const saveBtn = document.getElementById('save-db');
        const imgBtn = document.getElementById('save-image');
        const cancelSaveBtn = document.getElementById('cancel-save-btn');
        const execSaveBtn = document.getElementById('execute-save-btn');
        const logBtn = document.getElementById('download-debug-log');
        const resetBtn = document.getElementById('reset-form-btn');

        if (loadBtn) loadBtn.onclick = handleLoadDB;
        if (saveLocalBtn) saveLocalBtn.onclick = handleSaveLocal;
        if (saveBtn) saveBtn.onclick = handleSaveDBRequest;
        if (imgBtn) imgBtn.onclick = App.UI.handleSaveImage.bind(App.UI);
        if (resetBtn) resetBtn.onclick = App.UI.resetForm.bind(App.UI);

        // デバッグボタンの表示制御
        if (logBtn) {
            if (App.Logger && App.Logger.isEnabled) {
                logBtn.style.display = 'inline-block';
                logBtn.onclick = () => App.Logger.downloadLogs();
            } else {
                logBtn.style.display = 'none';
            }
        }

        if (cancelSaveBtn) cancelSaveBtn.onclick = () => {
            document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
            state.pendingSaveData = null;
        };
        if (execSaveBtn) execSaveBtn.onclick = executeSaveDB;
    }

    function initModal() {
        const migrationModal = document.getElementById('migration-modal-overlay');
        const closeMigrationBtn = document.getElementById('close-migration-wizard');
        if (closeMigrationBtn) closeMigrationBtn.onclick = () => migrationModal.classList.add('hidden');
    }

    function initPageLeaveWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (state.isDirty) { e.preventDefault(); e.returnValue = ''; }
        });
    }

    function initFormDirtyStateTracking() {
        const form = document.querySelector('.form-container');
        if (form) form.addEventListener('input', () => state.isDirty = true);
    }

    // ==========================================
    // 2. サーバー通信・同期 (API Communication)
    // ==========================================

    async function fetchDB(isInitial = false) {
        log('DB', 'Fetching DB start');
        try {
            const data = await App.API.fetchAllHorses();
            data.forEach(horse => {
                if (horse.id) state.db.set(horse.id, horse);
            });
            console.log(`DB Loaded: ${state.db.size} records`);
            log('DB', 'Fetch DB success', { count: state.db.size });
        } catch (error) {
            console.error('Fetch Error:', error);
            log('ERROR', 'Fetch DB failed', { error: error.message });
            if (isInitial) {
                const msgEl = document.getElementById('loading-message');
                if (msgEl) {
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
        if (state.isLoading) return;
        state.isLoading = true;

        App.UI.setSaveButtonLoading(true, '通信中...');
        App.UI.setGlobalLoading(true, '保存中...', 'サーバーにデータを送信しています...');
        log('DB', 'Post DB start', { count: dataToSave.size });

        try {
            const horsesArray = Array.from(dataToSave.values());
            await App.API.saveHorses(horsesArray);

            App.UI.setGlobalLoading(false);
            App.UI.setSaveButtonLoading(true, '同期中...');
            App.UI.showToast('保存が完了しました');
            state.isDirty = false;

            await fetchDB(); // データ再同期
        } catch (error) {
            console.error('Post Error:', error);
            log('ERROR', 'Post DB failed', { error: error.message });
            App.UI.setGlobalLoading(false);
            alert(`保存に失敗しました。\n${error.message}`);
        } finally {
            state.isLoading = false;
            App.UI.setSaveButtonLoading(false, 'サーバーに保存');
        }
    }

    // ==========================================
    // 3. データ保存フロー (Save Process)
    // ==========================================

    // 保存リクエストのハンドリング（競合チェック）
    async function handleSaveDBRequest() {
        log('LOGIC', 'handleSaveDBRequest started');

        // バリデーション
        const hasInput = ALL_IDS.some(id => {
            const ja = document.getElementById(`${id}-name-ja`);
            const en = document.getElementById(`${id}-name-en`);
            const year = document.getElementById(`${id}-birth-year`);
            return (ja && ja.value.trim()) || (en && en.value.trim()) || (year && year.value.trim());
        });
        if (hasInput && !App.UI.checkRequiredFields()) return;

        if (state.isLoading) return;
        state.isLoading = true;
        App.UI.setSaveButtonLoading(true, '処理中...');

        try {
            // ==================================================
            // Phase 1: クライアントサイドでの入力矛盾解決 (Loop)
            // ==================================================
            while (true) {
                // 1. 最新のフォームデータを取得
                const formData = App.UI.getFormDataAsMap();
                fillMissingAncestors(formData); // ダミー馬補完

                // 2. 名寄せと矛盾検知の準備
                const groupMap = new Map(); // Key -> List< {pos, horse} >
                for (const [pos, horse] of formData.entries()) {
                    const name = horse.name_ja || horse.name_en;
                    if (!name) continue;
                    const key = `${name}_${horse.birth_year || ''}`;
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key).push({ pos, horse });
                }

                const inputConflicts = []; // ユーザー解決が必要な矛盾リスト

                // 3. グループごとの矛盾チェック
                for (const [key, list] of groupMap.entries()) {
                    if (list.length <= 1) continue;

                    // コンテンツによるバリアント分類
                    const variants = [];
                    list.forEach(item => {
                        const h = item.horse;
                        // 既存のバリアントと同じ内容かチェック
                        let match = variants.find(v => isContentSame(v.horse, h));
                        if (match) {
                            match.formIds.push(item.pos);
                            // IDがあれば統合（IDがあるデータを正とする）
                            if (h.id && !match.horse.id) match.horse.id = h.id;
                        } else {
                            variants.push({ formIds: [item.pos], horse: { ...h } });
                        }
                    });

                    // 複数バリアントがある場合、矛盾として扱う
                    if (variants.length > 1) {
                        inputConflicts.push({
                            key: key,
                            name: list[0].horse.name_ja || list[0].horse.name_en, // 表示名
                            variants: variants
                        });
                    }
                }

                // 4. 矛盾があればモーダル表示 -> DOM反映 -> ループ先頭へ
                if (inputConflicts.length > 0) {
                    App.UI.setGlobalLoading(false); // モーダル操作のためローディング解除
                    await new Promise(resolve => {
                        App.UI.showInputConflictModal(inputConflicts, (resolvedMap) => {
                            App.UI.reflectResolvedDataToDom(resolvedMap);
                            resolve(); // 解決後、Promise解決してループ継続
                        });
                    });
                    // DOMが更新されたので、次のループで再度getFormDataAsMapして確認する
                    continue;
                }

                // 矛盾がなければループを抜ける
                break;
            } // End While

            App.UI.setGlobalLoading(true, '同期中...', 'データの競合を確認しています...');

            // ==================================================
            // Phase 2: 全体整合性の確保と親子リンク再構築
            // ==================================================

            // 矛盾解決後のクリーンなデータを取得
            const finalFormData = App.UI.getFormDataAsMap();
            fillMissingAncestors(finalFormData);

            const nameToId = new Map();
            // 1. UUIDの統一 (名寄せ)
            for (const horse of finalFormData.values()) {
                const name = horse.name_ja || horse.name_en;
                if (!name) continue;
                const key = `${name}_${horse.birth_year || ''}`;

                if (nameToId.has(key)) {
                    horse.id = nameToId.get(key); // 既知のIDを適用
                } else {
                    if (!horse.id) horse.id = generateUUID(); // IDが無ければ発行
                    nameToId.set(key, horse.id);
                }
            }

            // 2. 親子リンクの再構築
            ALL_IDS.forEach(id => {
                const horse = finalFormData.get(id);
                if (!horse) return;

                const sId = (id === 'target') ? 's' : id + 's';
                const dId = (id === 'target') ? 'd' : id + 'd';

                if (finalFormData.has(sId)) horse.sire_id = finalFormData.get(sId).id;
                if (finalFormData.has(dId)) horse.dam_id = finalFormData.get(dId).id;
            });

            // DOMにも確定UUIDを書き戻しておく（これ重要）
            ALL_IDS.forEach(id => {
                const horse = finalFormData.get(id);
                if (horse && horse.id) {
                    const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                    if (group) group.dataset.uuid = horse.id;
                }
            });

            // ==================================================
            // Phase 3: DBとの競合チェック
            // ==================================================
            try {
                await fetchDB();
            } catch (e) {
                // 失敗しても強制続行するか？ ここでは中断する
                state.isLoading = false;
                App.UI.setGlobalLoading(false);
                App.UI.setSaveButtonLoading(false, 'サーバーに保存');
                return;
            }

            const dbConflicts = [];
            // finalFormData は今やユニークな馬データの集合と同じIDを持つはずだが
            // posごとのMapなので、values()でユニークな馬リストを作る必要がある

            // 馬単位でまとめる
            const horsesToSave = new Map(); // UUID -> Horse
            for (const h of finalFormData.values()) {
                if (h.id) horsesToSave.set(h.id, h);
            }

            for (const [uuid, newHorse] of horsesToSave.entries()) {
                if (state.db.has(uuid)) {
                    const dbHorse = state.db.get(uuid);
                    const diffs = [];
                    // 比較フィールド
                    const fields = ['name_ja', 'name_en', 'birth_year', 'country', 'color', 'family_no', 'lineage'];
                    fields.forEach(field => {
                        const dbVal = String(dbHorse[field] || '').trim();
                        const newVal = String(newHorse[field] || '').trim();
                        if (dbVal !== '' && dbVal !== newVal) {
                            diffs.push({ field, old: dbVal, new: newVal });
                        }
                    });

                    // 架空馬フラグの同期
                    if (newHorse.is_fictional) dbHorse.is_fictional = true;

                    if (diffs.length > 0) {
                        // ダミー馬昇格判定
                        const isDbDummy = App.UI.isDummyHorseName(dbHorse.name_ja);
                        const isNewDummy = App.UI.isDummyHorseName(newHorse.name_ja);

                        if (isDbDummy && !isNewDummy) {
                            // 自動マージ
                            Object.assign(dbHorse, newHorse);
                            horsesToSave.set(uuid, dbHorse); // 更新されたDB馬を使う
                            log('ACTION', 'Auto-Promoted', { uuid });
                        } else {
                            // 競合
                            dbConflicts.push({ horse: newHorse, dbHorse, diffs });
                        }
                    } else {
                        // 差分なし（単純更新）
                        Object.assign(dbHorse, newHorse);
                    }
                } else {
                    // 新規
                    // そのまま
                }
            }

            if (dbConflicts.length > 0) {
                state.isLoading = false; // モーダルへ
                App.UI.setGlobalLoading(false);
                App.UI.setSaveButtonLoading(false, 'サーバーに保存');

                // pendingSaveDataには horsesToSave (Map<UUID, Horse>) を渡したいが、
                // showSaveConfirmModalの既存実装に合わせて渡す
                state.pendingSaveData = horsesToSave;
                App.UI.showSaveConfirmModal(dbConflicts, horsesToSave);
            } else {
                state.isLoading = false;
                saveDataDirectly(horsesToSave);
            }

        } catch (err) {
            console.error(err);
            state.isLoading = false;
            App.UI.setGlobalLoading(false);
            App.UI.setSaveButtonLoading(false, 'サーバーに保存');
            alert('保存処理中に予期せぬエラーが発生しました: ' + err.message);
        }
    }

    // 競合解決後の保存実行
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
                        formHorse.id = null; // 新規発行
                        // Mapのキーは維持でもValueのIDがnullなら新規扱い
                        log('ACTION', 'Conflict Resolution: New', { tempId });
                    }
                } else if (actionInput.value === 'skip') {
                    state.pendingSaveData.delete(tempId);
                    log('ACTION', 'Conflict Resolution: Skip', { tempId });
                } else {
                    const formHorse = state.pendingSaveData.get(tempId);
                    // ここではDBのインスタンスを更新せず、送信データ(pendingSaveData)を正とする
                    // DBインスタンスへの反映はpostDB完了後のfetchDBで行われるため
                    log('ACTION', 'Conflict Resolution: Update', { tempId, uuid: formHorse.id });
                }
            }
        });

        saveDataDirectly(state.pendingSaveData);
        document.getElementById('save-confirm-modal-overlay').classList.add('hidden');
        state.pendingSaveData = null;
    }

    // 馬データの同一性チェック（詳細フィールド）
    function isContentSame(h1, h2) {
        if (!h1 || !h2) return false;
        const keys = ['country', 'color', 'family_no', 'lineage', 'is_fictional'];
        return keys.every(k => String(h1[k] || '').trim() === String(h2[k] || '').trim());
    }

    // 確定したデータの保存
    function saveDataDirectly(horsesMap) {
        log('LOGIC', 'saveDataDirectly start', { count: horsesMap.size });

        // 最終安全装置
        for (const h of horsesMap.values()) {
            if (!h.id) h.id = generateUUID();
            // null / undefined を空文字へ
            ['sire_id', 'dam_id', 'sire_name', 'dam_name'].forEach(k => {
                if (h[k] === undefined || h[k] === null) h[k] = '';
            });
        }

        postDB(horsesMap);
    }

    // ==========================================
    // 4. ロジック: ダミー馬生成 (Dummy Horse Logic)
    // ==========================================

    function fillMissingAncestors(formData) {
        // 既存ダミー馬の検索マップ（再利用・重複防止）
        const existingDummyMap = new Map();
        state.db.forEach(horse => {
            if (horse.is_fictional && App.UI.isDummyHorseName(horse.name_ja)) {
                existingDummyMap.set(horse.name_ja, horse.id);
            }
        });

        // 浅い順（s -> ss -> sss）で走査し、先読み判定で補完
        ANCESTOR_IDS.forEach(id => {
            const horse = formData.get(id);
            // 既に名前がある場合はスキップ
            if (horse && (horse.name_ja || horse.name_en)) return;

            // 1. 対象馬(Target)が架空馬であること
            const target = formData.get('target');
            if (!target || !target.is_fictional) return;

            // 2. 「自分より先の系統」にデータが存在するかチェック
            const hasDeepAncestor = Array.from(formData.keys()).some(key => {
                if (!key.startsWith(id) || key === id) return false;
                const h = formData.get(key);
                return h && (h.name_ja || h.name_en);
            });

            if (hasDeepAncestor) {
                // 補完対象確定：ダミー馬を生成
                let childId = (id.length === 1) ? 'target' : id.substring(0, id.length - 1);
                const child = formData.get(childId);

                let childName = child ? (child.name_ja || child.name_en) : '';
                if (!childName) childName = '未登録馬';

                // 子がダミーなら、整形名を利用（例: (Xの母)）
                if (App.UI.isDummyHorseName(childName)) {
                    childName = App.UI.formatDummyName(childName).replace(/[（）()]/g, '');
                }

                const suffix = (id.endsWith('s')) ? 'の父' : 'の母';
                const dummyName = `(未登録: ${childName}${suffix})`;

                // UUIDの決定（再利用 or 新規）
                let uuid = null;
                if (existingDummyMap.has(dummyName)) {
                    uuid = existingDummyMap.get(dummyName);
                    log('LOGIC', 'Reusing Dummy UUID', { name: dummyName, uuid });
                } else {
                    if (horse && horse.id) {
                        uuid = horse.id;
                    } else {
                        uuid = generateUUID();
                    }
                    existingDummyMap.set(dummyName, uuid);
                    log('LOGIC', 'Creating New Dummy', { name: dummyName, uuid });
                }

                // フォームデータに注入
                const dummyHorse = {
                    id: uuid,
                    name_ja: dummyName,
                    name_en: '',
                    birth_year: '',
                    is_fictional: true,
                    country: '', color: '', family_no: '', lineage: '',
                    sire_name: '', dam_name: ''
                };
                formData.set(id, dummyHorse);
            }
        });
    }

    // ==========================================
    // 5. ローカルファイル操作 (CSV/Local)
    // ==========================================

    function handleSaveLocal() {
        log('ACTION', 'handleSaveLocal');
        if (!confirm('現在のデータベースの内容をCSVファイルとしてダウンロードします。\n続行しますか？')) return;

        const formData = App.UI.getFormDataAsMap();
        const nameMap = new Map();

        // メモリ内データのマップ化
        for (const horse of state.db.values()) {
            const name = horse.name_ja || horse.name_en;
            if (name) {
                const key = `${name}_${horse.birth_year || ''}`;
                nameMap.set(key, horse.id);
            }
        }

        // 入力データのマージ準備
        for (const horse of formData.values()) {
            const name = horse.name_ja || horse.name_en;
            if (name) {
                const key = `${name}_${horse.birth_year || ''}`;
                if (nameMap.has(key)) {
                    horse.id = nameMap.get(key);
                } else {
                    if (!horse.id) horse.id = generateUUID();
                    nameMap.set(key, horse.id);
                }
            } else {
                if (!horse.id) horse.id = generateUUID();
            }
        }

        // 親子関係の解決
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;
            let sId = (id === 'target') ? 's' : id + 's';
            let dId = (id === 'target') ? 'd' : id + 'd';

            if (formData.has(sId)) horse.sire_id = formData.get(sId).id;
            if (formData.has(dId)) horse.dam_id = formData.get(dId).id;
        });

        // データの統合
        for (const horse of formData.values()) {
            if (state.db.has(horse.id)) {
                Object.assign(state.db.get(horse.id), horse);
            } else {
                state.db.set(horse.id, horse);
            }
        }

        // 画面へのID反映
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (horse && horse.id) {
                const group = document.querySelector(`.horse-input-group[data-horse-id="${id}"]`);
                if (group) group.dataset.uuid = horse.id;
            }
        });

        // CSV出力
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
        log('ACTION', 'parseCSV');
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
                // CSVデータの正規化
                horse = {
                    id: uuid,
                    name_ja: nameJa,
                    name_en: nameEn,
                    birth_year: birthYear,
                    is_fictional: (row.is_fictional === 'true' || row.is_fictional === true),
                    country: row.country || '',
                    color: row.color || '',
                    family_no: row.family_no || '',
                    lineage: row.lineage || '',
                    sire_id: row.sire_id || null,
                    dam_id: row.dam_id || null,
                    sire_name: row.sire_name || '',
                    dam_name: row.dam_name || ''
                };
                state.db.set(uuid, horse);
            }
        });

        if (isOldFormat) {
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
});