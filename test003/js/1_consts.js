// 名前空間の初期化
window.App = window.App || {};

// --- 定数・設定定義 ---
window.App.Consts = (function() {
    // 画像生成時の幅設定
    const IMAGE_WIDTHS = { 2: 800, 3: 1000, 4: 1200, 5: 1400 };
    
    // GASのURL
    const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxT1WVuSeaxXIkvwJ2xJ56RrJjIgqPerVvHExbbAm8DYlfuy6599_-fFsfi7iCUKQST/exec';

    // 世代ラベル定義
    const GENERATION_LABELS = {
        'target': { label: '対象馬', tag: 'h3' },
        's': { label: '父', tag: 'h3' }, 'd': { label: '母', tag: 'h3' },
        'ss': { label: '父の父 (SS)', tag: 'h3' }, 'sd': { label: '父の母 (SD)', tag: 'h3' },
        'ds': { label: '母の父 (DS)', tag: 'h3' }, 'dd': { label: '母の母 (DD)', tag: 'h3' }
    };

    // IDリストの生成ロジック
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

    // 外部に公開するオブジェクト
    return {
        IMAGE_WIDTHS,
        GAS_API_URL,
        GENERATION_LABELS,
        ANCESTOR_IDS,
        ALL_IDS
    };
})();