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
    },

    // ★追加: デバッグログ機能
    Logger: {
        logs: [],
        
        // ログ追加
        add: function(category, message, data = null) {
            const now = new Date();
            const timeStr = now.toISOString(); // 正確な時刻
            
            // コンソールにも出す（開発者ツール確認用）
            if (data) {
                console.log(`[${category}] ${message}`, data);
            } else {
                console.log(`[${category}] ${message}`);
            }

            // メモリに保存
            this.logs.push({
                time: timeStr,
                category: category,
                message: message,
                data: data
            });
        },

        // ログのダウンロード
        download: function() {
            if (this.logs.length === 0) {
                alert('ログがありません');
                return;
            }

            const lines = this.logs.map(log => {
                let line = `[${log.time}] [${log.category}] ${log.message}`;
                if (log.data) {
                    try {
                        // オブジェクトの内容もJSON化して記録
                        const json = JSON.stringify(log.data, null, 2);
                        line += `\n${json}`;
                    } catch (e) {
                        line += `\n(Data serialization error: ${e})`;
                    }
                }
                return line;
            });

            const content = lines.join('\n----------------------------------------\n');
            const fileName = `debug_log_${new Date().getTime()}.txt`;
            
            window.App.Utils.downloadFile(content, fileName, 'text/plain');
        }
    }
};