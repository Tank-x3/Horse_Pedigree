window.App = window.App || {};

// --- API通信機能 (Debug版) ---
window.App.API = {
    /**
     * サーバーから全データを取得し、整形して返します
     * @returns {Promise<Array>} 馬データの配列
     */
    fetchAllHorses: async function() {
        const { GAS_API_URL } = App.Consts;
        
        App.Utils.Logger.add('API', 'fetchAllHorses: Start fetching data...');

        try {
            const response = await fetch(GAS_API_URL);
            if (!response.ok) {
                App.Utils.Logger.add('API', 'fetchAllHorses: Network Error', { status: response.status });
                throw new Error('Network response was not ok');
            }
            const rawData = await response.json();
            
            App.Utils.Logger.add('API', `fetchAllHorses: Success. Records: ${rawData.length}`);

            // データの正規化
            return rawData.map(row => {
                const normalized = { ...row };
                if (normalized.uuid) {
                    normalized.id = normalized.uuid;
                    normalized.is_fictional = (normalized.is_fictional === 'true' || normalized.is_fictional === true);
                }
                return normalized;
            });
        } catch (e) {
            App.Utils.Logger.add('API', 'fetchAllHorses: Exception', { message: e.message });
            throw e;
        }
    },

    /**
     * 馬データをサーバーに送信して保存します
     * @param {Array} horsesArray - 保存する馬データの配列
     * @returns {Promise<Object>} サーバーからのレスポンス
     */
    saveHorses: async function(horsesArray) {
        const { GAS_API_URL } = App.Consts;

        // 送信データのIDリストをログ記録（多重送信確認用）
        const ids = horsesArray.map(h => h.id);
        const names = horsesArray.map(h => h.name_ja || h.name_en);
        App.Utils.Logger.add('API', 'saveHorses: Start saving...', { count: horsesArray.length, ids: ids, names: names });

        // 送信ペイロードの作成
        const payload = horsesArray.map(h => {
            return { ...h, uuid: h.id };
        });

        try {
            const response = await fetch(GAS_API_URL, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            App.Utils.Logger.add('API', 'saveHorses: Response received', result);
            
            if (result.status !== 'success') {
                App.Utils.Logger.add('API', 'saveHorses: Logic Error from Server', result);
                throw new Error(result.message || 'Unknown Error');
            }
            
            return result;
        } catch (e) {
            App.Utils.Logger.add('API', 'saveHorses: Exception', { message: e.message });
            throw e;
        }
    }
};