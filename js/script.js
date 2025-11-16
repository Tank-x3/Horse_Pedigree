document.addEventListener('DOMContentLoaded', () => {
    // --- アプリケーションの状態管理 ---
    const state = {
        db: new Map(),
        isDirty: false,
    };

    // --- 設定値 ---
    const IMAGE_WIDTHS = { // 世代ごとの画像幅 (ピクセル)
        2: 800,
        3: 1000,
        4: 1200,
        5: 1400
    };

    // --- 定数 ---
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

    // --- 初期化処理 ---
    initModal();
    initUI();
    initButtons();
    initPageLeaveWarning();
    initFormDirtyStateTracking();

    // --- 初期化関数群 ---
    function initModal() {
        const modalOverlay = document.getElementById('startup-modal-overlay');
        const createNewBtn = document.getElementById('create-new-btn-modal');
        const loadDbBtnModal = document.getElementById('load-db-btn-modal');
        
        createNewBtn.addEventListener('click', () => modalOverlay.classList.add('hidden'));
        loadDbBtnModal.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
            handleLoadDB();
        });
    }

    function initUI() {
        initFormPreviewSync();
        initGenerationSelector();
        initResponsiveTabs();
        initAutocomplete();
    }
    
    function initButtons() {
        document.getElementById('load-db').addEventListener('click', handleLoadDB);
        document.getElementById('bulk-register-csv').addEventListener('click', handleDownloadTemplate);
        document.getElementById('save-db').addEventListener('click', handleSaveDB);
        document.getElementById('save-image').addEventListener('click', handleSaveImage);
    }
    
    function initPageLeaveWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    function initFormDirtyStateTracking() {
        const form = document.querySelector('.form-container');
        form.addEventListener('input', () => {
            state.isDirty = true;
        });
    }

    // --- DB・ファイル操作 ---
    function handleLoadDB() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    parseCSV(event.target.result);
                    alert(`${state.db.size}件の馬データを読み込みました。`);
                    state.isDirty = false;
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }
    
    function parseCSV(csvText) {
        state.db.clear();
        const lines = csvText.trim().split(/\r?\n/);
        const header = lines.shift().split(',').map(h => h.trim());
        const requiredHeaders = ['name', 'birth_year'];
        if (!requiredHeaders.every(h => header.includes(h))) {
            alert('CSVのヘッダーが不正です。\n必要な列: ' + requiredHeaders.join(', '));
            return;
        }
        const data = lines.map(line => {
            const values = line.split(',');
            const obj = {};
            header.forEach((key, i) => {
                obj[key] = values[i] ? values[i].trim() : '';
            });
            return obj;
        });
        data.forEach(row => {
            if (row.name && row.birth_year) {
                const id = `${row.name}_${row.birth_year}`;
                const horse = {
                    id: id, name: row.name, birth_year: row.birth_year,
                    sire_name: row.sire_name || null, sire_birth_year: row.sire_birth_year || null,
                    dam_name: row.dam_name || null, dam_birth_year: row.dam_birth_year || null,
                    sire_id: (row.sire_name && row.sire_birth_year) ? `${row.sire_name}_${row.sire_birth_year}` : null,
                    dam_id: (row.dam_name && row.dam_birth_year) ? `${row.dam_name}_${row.dam_birth_year}` : null
                };
                state.db.set(id, horse);
            }
        });
    }
    function handleDownloadTemplate() {
        const header = 'name,birth_year,sire_name,sire_birth_year,dam_name,dam_birth_year';
        const example = 'サンデーサイレンス,1986,Halo,1969,Wishing Well,1975';
        const content = `${header}\n${example}\n`;
        downloadFile(content, 'template.csv', 'text/csv');
    }

    function handleSaveDB() {
        const formData = getFormDataAsMap();
        const newDb = new Map(state.db);
        for (const [id, horseData] of formData.entries()) {
            const existingData = newDb.get(id);
            if (existingData) {
                existingData.sire_id = horseData.sire_id || existingData.sire_id;
                existingData.dam_id = horseData.dam_id || existingData.dam_id;
                if (horseData.sire_id && !existingData.sire_name) {
                    const sire = formData.get(horseData.sire_id) || state.db.get(horseData.sire_id);
                    if(sire) { existingData.sire_name = sire.name; existingData.sire_birth_year = sire.birth_year; }
                }
                if (horseData.dam_id && !existingData.dam_name) {
                    const dam = formData.get(horseData.dam_id) || state.db.get(horseData.dam_id);
                    if(dam) { existingData.dam_name = dam.name; existingData.dam_birth_year = dam.birth_year; }
                }
            } else {
                newDb.set(id, horseData);
            }
        }
        const csvString = convertDbToCSV(newDb);
        downloadFile(csvString, 'pedigree_db.csv', 'text/csv');
        state.isDirty = false;
        alert(`${newDb.size}件のデータをCSVファイルとして保存しました。`);
    }

    function getFormDataAsMap() {
        const formData = new Map();
        const allHorseIds = ['target', ...ANCESTOR_IDS];
        allHorseIds.forEach(idPrefix => {
            const nameEl = document.getElementById(`${idPrefix}-name`);
            const yearEl = document.getElementById(`${idPrefix}-birth-year`);
            if (nameEl && yearEl && nameEl.value && yearEl.value) {
                const name = nameEl.value.trim();
                const year = yearEl.value.trim();
                const id = `${name}_${year}`;
                let sireNameEl, sireYearEl, damNameEl, damYearEl;
                if (idPrefix === 'target') {
                    sireNameEl = document.getElementById('s-name'); sireYearEl = document.getElementById('s-birth-year');
                    damNameEl = document.getElementById('d-name'); damYearEl = document.getElementById('d-birth-year');
                } else {
                    sireNameEl = document.getElementById(`${idPrefix}s-name`); sireYearEl = document.getElementById(`${idPrefix}s-birth-year`);
                    damNameEl = document.getElementById(`${idPrefix}d-name`); damYearEl = document.getElementById(`${idPrefix}d-birth-year`);
                }
                const sireName = sireNameEl ? sireNameEl.value.trim() : null;
                const sireYear = sireYearEl ? sireYearEl.value.trim() : null;
                const damName = damNameEl ? damNameEl.value.trim() : null;
                const damYear = damYearEl ? damYearEl.value.trim() : null;
                const horse = {
                    id, name, birth_year: year,
                    sire_name: sireName, sire_birth_year: sireYear,
                    dam_name: damName, dam_birth_year: damYear,
                    sire_id: (sireName && sireYear) ? `${sireName}_${sireYear}` : null,
                    dam_id: (damName && damYear) ? `${damName}_${damYear}` : null,
                };
                formData.set(id, horse);
            }
        });
        return formData;
    }

    function convertDbToCSV(dbMap) {
        const header = 'name,birth_year,sire_name,sire_birth_year,dam_name,dam_birth_year';
        const rows = [];
        for (const horse of dbMap.values()) {
            const sire = horse.sire_id ? dbMap.get(horse.sire_id) : null;
            const dam = horse.dam_id ? dbMap.get(horse.dam_id) : null;
            rows.push([
                horse.name, horse.birth_year,
                sire ? sire.name : horse.sire_name || '', sire ? sire.birth_year : horse.sire_birth_year || '',
                dam ? dam.name : horse.dam_name || '', dam ? dam.birth_year : horse.dam_birth_year || ''
            ].join(','));
        }
        return `${header}\n${rows.join('\n')}`;
    }

    function downloadFile(content, fileName, mimeType) {
        const a = document.createElement('a');
        let url;

        if (content.startsWith('data:')) {
            // データURLの場合 (画像)
            a.href = content;
        } else {
            // テキストデータの場合 (CSV)
            const blob = new Blob([content], { type: mimeType });
            url = URL.createObjectURL(blob);
            a.href = url;
        }

        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Blobから生成したURLの場合は、後片付けが必要
        if (url) {
            URL.revokeObjectURL(url);
        }
    }
    
    // --- 画像保存機能 ---
    async function handleSaveImage() {
        const previewContainer = document.querySelector('.preview-container');
        const titleEl = document.getElementById('preview-title');
        const tableEl = document.querySelector('.pedigree-table');

        // ファイル名生成
        const targetName = document.getElementById('target-name').value.trim();
        const targetYear = document.getElementById('target-birth-year').value.trim();
        const selectedGen = document.querySelector('input[name="generation"]:checked').value;
        let fileName = `${selectedGen}代血統表.png`;
        if (targetName) {
            fileName = `${targetName}${targetYear ? `(${targetYear})` : ''}_${fileName}`;
        }

        // 画像化用のクローンを作成
        const cloneContainer = document.createElement('div');
        cloneContainer.className = 'clone-container-for-image';
        const clonedTitle = titleEl.cloneNode(true);
        const clonedTable = tableEl.cloneNode(true);
        cloneContainer.appendChild(clonedTitle);
        cloneContainer.appendChild(clonedTable);

        // スタイル設定
        const imageWidth = IMAGE_WIDTHS[selectedGen];
        cloneContainer.style.width = `${imageWidth}px`;
        
        document.body.appendChild(cloneContainer);

        // 描画を待ってから画像化
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        try {
            // --- 修正点: scale: 1 オプションを追加してDPRを無視させる ---
            const canvas = await html2canvas(cloneContainer, { scale: 1 });
            const dataUrl = canvas.toDataURL('image/png');
            downloadFile(dataUrl, fileName, 'image/png');
        } catch (error) {
            console.error('画像生成に失敗しました:', error);
            alert('画像生成に失敗しました。');
        } finally {
            document.body.removeChild(cloneContainer);
        }
    }
    // --- UI関連 ---
    function initAutocomplete() {
        const allHorseIds = ['target', ...ANCESTOR_IDS];
        allHorseIds.forEach(id => {
            const nameInput = document.getElementById(`${id}-name`);
            if (nameInput) {
                const wrapper = nameInput.closest('.autocomplete-wrapper');
                if (!wrapper) return;
                const suggestionsContainer = document.createElement('div');
                suggestionsContainer.className = 'autocomplete-suggestions';
                wrapper.appendChild(suggestionsContainer);
                nameInput.addEventListener('input', () => showSuggestions(nameInput, suggestionsContainer, id));
                document.addEventListener('click', (e) => {
                    if (e.target !== nameInput) suggestionsContainer.innerHTML = '';
                });
            }
        });
    }

    function showSuggestions(input, container, idPrefix) {
        const value = input.value.toLowerCase();
        container.innerHTML = '';
        if (value.length === 0) return;
        const suggestions = [];
        for (const horse of state.db.values()) {
            if (horse.name.toLowerCase().startsWith(value)) {
                suggestions.push(horse);
            }
            if (suggestions.length >= 10) break;
        }
        suggestions.forEach(horse => {
            const item = document.createElement('div');
            item.className = 'autocomplete-suggestion';
            item.textContent = `${horse.name} (${horse.birth_year})`;
            item.addEventListener('click', () => {
                populateFormRecursively(horse.id, idPrefix);
                container.innerHTML = '';
            });
            container.appendChild(item);
        });
    }

    function populateFormRecursively(horseId, idPrefix) {
        const horse = state.db.get(horseId);
        if (!horse && horseId) { 
            const [name, year] = horseId.split('_');
            if(name && year) setInputValue(idPrefix, name, year);
            return;
        }
        if (!horse) return;
        setInputValue(idPrefix, horse.name, horse.birth_year);
        state.isDirty = true;
        let sirePrefix, damPrefix;
        if (idPrefix === 'target') {
            sirePrefix = 's'; damPrefix = 'd';
        } else {
            sirePrefix = idPrefix + 's'; damPrefix = idPrefix + 'd';
        }
        if (horse.sire_id) populateFormRecursively(horse.sire_id, sirePrefix);
        if (horse.dam_id) populateFormRecursively(horse.dam_id, damPrefix);
    }

    function setInputValue(idPrefix, name, year) {
        const nameInput = document.getElementById(`${idPrefix}-name`);
        const yearInput = document.getElementById(`${idPrefix}-birth-year`);
        if (nameInput) nameInput.value = name;
        if (yearInput) yearInput.value = year;
        if (nameInput) nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        if (yearInput) yearInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    function initFormPreviewSync() {
        const allHorseIds = ['target', ...ANCESTOR_IDS];
        allHorseIds.forEach(id => {
            const nameInput = document.getElementById(`${id}-name`);
            if (!nameInput) return;
            const updateFunction = id === 'target' ? updateTitlePreview : updateAncestorPreview;
            nameInput.addEventListener('input', () => updateFunction(id));
            document.getElementById(`${id}-birth-year`).addEventListener('input', () => updateFunction(id));
            if (id !== 'target') updateFunction(id);
        });
    }

    function updateTitlePreview(id) {
        const name = document.getElementById(`${id}-name`).value.trim();
        const year = document.getElementById(`${id}-birth-year`).value.trim();
        document.getElementById('preview-title').textContent = name ? `${name}${year ? ` (${year})` : ''} の血統` : '血統表プレビュー';
    }

    function updateAncestorPreview(id) {
        const previewName = document.getElementById(`preview-${id}-name`);
        if (!previewName) return;
        const name = document.getElementById(`${id}-name`).value.trim();
        const year = document.getElementById(`${id}-birth-year`).value.trim();
        const placeholder = previewName.dataset.default || '';
        const col = parseInt(previewName.closest('.pedigree-cell')?.dataset.col);
        if (col === 5) {
            let text = name || placeholder;
            if (name && year) text = `${name} (${year})`;
            else if (year) text = `(${year})`;
            previewName.innerHTML = text.trim() === '' ? '&nbsp;' : text;
        } else {
            previewName.textContent = name || placeholder;
            document.getElementById(`preview-${id}-birth-year`).innerHTML = year ? year : '&nbsp;';
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
            group.classList.toggle('hidden', gen > selectedGen && gen !== 0);
        });
        document.querySelectorAll('.pedigree-cell[data-col]').forEach(cell => {
            const col = parseInt(cell.dataset.col);
            cell.classList.toggle('hidden', col > selectedGen);
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
});