window.App = window.App || {};

// --- デバッグログ管理モジュール ---
window.App.Logger = {
    logs: [],
    maxLogs: 5000,
    isEnabled: false, // デフォルトは無効

    init: function() {
        // URLパラメータ "debug=true" がある場合のみ有効化
        const params = new URLSearchParams(window.location.search);
        this.isEnabled = params.get('debug') === 'true';

        if (this.isEnabled) {
            this.add('SYSTEM', 'Logger initialized. Mode: DEBUG');
            
            // エラー捕捉の設定
            window.onerror = (msg, url, lineNo, columnNo, error) => {
                this.add('CRITICAL', 'Global Error Detected', { 
                    msg, url, lineNo, columnNo, stack: error ? error.stack : 'no stack' 
                });
            };
            window.onunhandledrejection = (event) => {
                this.add('CRITICAL', 'Unhandled Promise Rejection', { reason: event.reason });
            };
            
            console.log('🔧 Debug Mode Enabled');
        }
    },

    // ログ追加
    add: function(category, message, data = null) {
        // 無効時は何もしない（メモリも食わない）
        if (!this.isEnabled) return;

        const timestamp = new Date().toISOString();
        const logEntry = {
            ts: timestamp,
            cat: category,
            msg: message,
            data: this.safeDeepClone(data)
        };
        
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        console.log(`[${timestamp}] [${category}] ${message}`, data || '');
    },

    // ログファイルのダウンロード
    downloadLogs: function() {
        if (!this.isEnabled || this.logs.length === 0) {
            alert('ログデータがありません。');
            return;
        }
        const logText = JSON.stringify(this.logs, null, 2);
        const fileName = `pedigree_debug_log_${new Date().getTime()}.json`;
        
        const blob = new Blob([logText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // 循環参照回避用の安全なクローン
    safeDeepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return '[Data Error]';
        }
    }
};

// 初期化実行
window.App.Logger.init();