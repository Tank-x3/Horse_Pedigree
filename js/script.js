document.addEventListener('DOMContentLoaded', () => {

    const ANCESTOR_IDS = (() => {
        const ids = [];
        let currentGen = ['']; // 0代目 (対象馬) からスタート
        for (let i = 1; i <= 5; i++) {
            const nextGen = [];
            for (const parent of currentGen) {
                const sireId = parent + 's';
                const damId = parent + 'd';
                ids.push(sireId, damId);
                nextGen.push(sireId, damId);
            }
            currentGen = nextGen;
        }
        return ids;
    })();

    // --- 初期化処理 ---
    initModal();
    initFormPreviewSync();
    initGenerationSelector();
    initResponsiveTabs();

    // --- モーダル処理 ---
    function initModal() {
        const modalOverlay = document.getElementById('startup-modal-overlay');
        const createNewBtn = document.getElementById('create-new-btn-modal');
        createNewBtn.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
        });
    }
    
    // --- フォームとプレビューの同期 ---
    function initFormPreviewSync() {
        const allHorseIds = ['target', ...ANCESTOR_IDS];

        allHorseIds.forEach(id => {
            const nameInput = document.getElementById(`${id}-name`);
            const birthYearInput = document.getElementById(`${id}-birth-year`);

            if (!nameInput) return;

            if (id === 'target') {
                const previewTitle = document.getElementById('preview-title');
                const updateTitle = () => {
                    const name = nameInput.value.trim();
                    const year = birthYearInput.value.trim();
                    previewTitle.textContent = name ? `${name}${year ? ` (${year})` : ''} の血統` : '血統表プレビュー';
                };
                nameInput.addEventListener('input', updateTitle);
                birthYearInput.addEventListener('input', updateTitle);
            } else {
                const previewName = document.getElementById(`preview-${id}-name`);
                const previewBirthYear = document.getElementById(`preview-${id}-birth-year`);
                
                if (!previewName) return;

                const updatePreview = () => {
                    const name = nameInput.value.trim();
                    const year = birthYearInput.value.trim();
                    const placeholder = previewName.dataset.default || '';
                    const col = parseInt(previewName.closest('.pedigree-cell')?.dataset.col);

                    if (col === 5) {
                        let text = name || placeholder;
                        if (name && year) {
                            text = `${name} (${year})`;
                        } else if (year) {
                            text = `(${year})`;
                        }
                        
                        if (text.trim() === '') {
                            previewName.innerHTML = '&nbsp;'; // 高さ確保
                        } else {
                            previewName.textContent = text;
                        }
                    } else {
                        previewName.textContent = name || placeholder;
                        previewBirthYear.textContent = year;
                        if (!year) {
                            previewBirthYear.innerHTML = '&nbsp;'; // 高さ維持
                        }
                    }
                };

                nameInput.addEventListener('input', updatePreview);
                birthYearInput.addEventListener('input', updatePreview);
                updatePreview(); // 初期表示
            }
        });
    }

    // --- 表示世代数切り替え ---
    function initGenerationSelector() {
        const selectors = document.querySelectorAll('input[name="generation"]');
        selectors.forEach(radio => {
            radio.addEventListener('change', handleGenerationChange);
        });
        handleGenerationChange(); // 初期表示
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
    
    // --- スマホ用タブ切り替え ---
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