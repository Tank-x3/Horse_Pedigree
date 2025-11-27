// 名前空間の初期化
window.App = window.App || {};

// --- ユーティリティ関数定義 ---
window.App.Utils = {
    // UUID生成
    generateUUID: function() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // 世代数判定 (target=0, s=1, ss=2...)
    getGeneration: function(id) {
        if (id === 'target') return 0;
        return id.length;
    },

    // ファイルダウンロード機能
    downloadFile: function(content, fileName, mimeType) {
        const a = document.createElement('a');
        let url;
        if (content.startsWith('data:')) {
            a.href = content;
        } else {
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
};