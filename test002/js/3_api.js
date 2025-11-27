window.App = window.App || {};

// --- API通信機能 ---
window.App.API = {
    /**
     * サーバーから全データを取得し、整形して返します
     * @returns {Promise<Array>} 馬データの配列
     */
    fetchAllHorses: async function() {
        // 定数の取得
        const { GAS_API_URL } = App.Consts;
        
        const response = await fetch(GAS_API_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const rawData = await response.json();
        
        // データの正規化 (UUIDをIDプロパティへ、文字列booleanを真偽値へ変換)
        return rawData.map(row => {
            const normalized = { ...row };
            if (normalized.uuid) {
                normalized.id = normalized.uuid;
                // "true" という文字列 または true という値を、JSの true に統一
                normalized.is_fictional = (normalized.is_fictional === 'true' || normalized.is_fictional === true);
            }
            return normalized;
        });
    },

    /**
     * 馬データをサーバーに送信して保存します
     * @param {Array} horsesArray - 保存する馬データの配列
     * @returns {Promise<Object>} サーバーからのレスポンス
     */
    saveHorses: async function(horsesArray) {
        // 定数の取得
        const { GAS_API_URL } = App.Consts;

        // 送信ペイロードの作成 (id を uuid として送信)
        const payload = horsesArray.map(h => {
            return { ...h, uuid: h.id };
        });

        const response = await fetch(GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        // 論理エラーのチェック
        if (result.status !== 'success') {
            throw new Error(result.message || 'Unknown Error');
        }
        
        return result;
    }
};