document.addEventListener('DOMContentLoaded', () => {
    // --- モーダル関連の処理 ---
    const modalOverlay = document.getElementById('startup-modal-overlay');
    const createNewBtn = document.getElementById('create-new-btn-modal');

    createNewBtn.addEventListener('click', () => {
        modalOverlay.classList.add('hidden');
    });

    // --- 対象馬の入力とプレビュータイトルの連動 ---
    const targetNameInput = document.getElementById('target-name');
    const targetBirthYearInput = document.getElementById('target-birth-year');
    const previewTitle = document.getElementById('preview-title');

    function updatePreviewTitle() {
        const name = targetNameInput.value.trim();
        const year = targetBirthYearInput.value.trim();
        if (name) {
            previewTitle.textContent = `${name}${year ? ` (${year})` : ''} の血統`;
        } else {
            previewTitle.textContent = '血統表プレビュー';
        }
    }

    targetNameInput.addEventListener('input', updatePreviewTitle);
    targetBirthYearInput.addEventListener('input', updatePreviewTitle);

    // --- 祖先の入力とプレビューの連動処理 ---
    const ancestorIds = [
        'sire', 'dam',
        'sire-sire', 'sire-dam', 'dam-sire', 'dam-dam'
    ];

    ancestorIds.forEach(id => {
        const nameInput = document.getElementById(`${id}-name`);
        const birthYearInput = document.getElementById(`${id}-birth-year`);

        const previewName = document.getElementById(`preview-${id}-name`);
        const previewBirthYear = document.getElementById(`preview-${id}-birth-year`);

        if (nameInput && previewName) {
            nameInput.addEventListener('input', () => {
                previewName.textContent = nameInput.value || previewName.dataset.default;
            });
            previewName.dataset.default = previewName.textContent;
        }

        if (birthYearInput && previewBirthYear) {
            birthYearInput.addEventListener('input', () => {
                previewBirthYear.textContent = birthYearInput.value;
            });
        }
    });
});