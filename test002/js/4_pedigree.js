window.App = window.App || {};

// --- 血統計算ロジック ---
window.App.Pedigree = {
    /**
     * 馬データのMapを受け取り、5代内クロスのリストを計算して返します
     * @param {Map} formData - 入力フォームのデータ (Key: ID, Value: HorseObject)
     * @returns {Array} クロス情報の配列
     */
    calculateCrosses: function(formData) {
        // 定数・Utilityの準備
        const { ALL_IDS } = App.Consts;

        // =================================================================
        // Step 0: 強力な名寄せ (Force Unification)
        // =================================================================
        // IDの有無に関わらず、「名前+生年」が一致する馬はすべて同一IDに統合する
        // これにより、データ上の微細な差異による判定漏れを完全に防ぐ
        const nameKeyToUUID = new Map();

        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;
            const name = (horse.name_ja || horse.name_en || '').trim();
            if (!name) return;

            // 名寄せキー: 生年があれば「名前_生年」、なければ「名前」
            const key = horse.birth_year ? `${name}_${horse.birth_year}` : name;

            if (nameKeyToUUID.has(key)) {
                // 既に同名の馬がいる場合、そのUUIDで上書き（統合）
                horse.resolvedId = nameKeyToUUID.get(key);
            } else {
                // 初出の場合、自身のIDか、なければ一時IDを発行
                const uuid = horse.id || `temp_${Math.random().toString(36).substr(2, 9)}`;
                horse.resolvedId = uuid;
                nameKeyToUUID.set(key, uuid);
            }
        });

        // 親ID解決 (統合された resolvedId をベースに再構築)
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse || !horse.resolvedId) return;
            let sId, dId;
            if (id === 'target') { sId = 's'; dId = 'd'; }
            else { sId = id + 's'; dId = id + 'd'; }
            const sire = formData.get(sId);
            const dam = formData.get(dId);
            horse.resolvedSireId = sire ? sire.resolvedId : null;
            horse.resolvedDamId = dam ? dam.resolvedId : null;
        });

        // =================================================================
        // Step 1: 全祖先データの構築 & パス収集
        // =================================================================
        const ancestors = []; 
        const traverse = (currentId, currentPath, gen) => {
            if (gen > 5) return;
            const horse = formData.get(currentId);
            if (!horse || !horse.resolvedId) return;
            if (gen > 0) {
                ancestors.push({
                    uuid: horse.resolvedId,
                    name: horse.name_ja || horse.name_en,
                    path: [...currentPath], // ここまでの経路 (ターゲットは含まず、直前の子が末尾)
                    gen: gen,
                    sireId: horse.resolvedSireId,
                    damId: horse.resolvedDamId,
                    htmlId: currentId
                });
            }
            const nextPath = [...currentPath, horse.resolvedId];
            let sKey, dKey;
            if (currentId === 'target') { sKey='s'; dKey='d'; }
            else { sKey=currentId+'s'; dKey=currentId+'d'; }
            traverse(sKey, nextPath, gen + 1);
            traverse(dKey, nextPath, gen + 1);
        };
        traverse('target', [], 0);

        // =================================================================
        // Step 2: グループ化 (全きょうだい判定)
        // =================================================================
        const uf = new Map();
        const find = (id) => {
            if (!uf.has(id)) uf.set(id, id);
            if (uf.get(id) === id) return id;
            const root = find(uf.get(id));
            uf.set(id, root);
            return root;
        };
        const union = (id1, id2) => {
            const root1 = find(id1);
            const root2 = find(id2);
            if (root1 !== root2) uf.set(root2, root1);
        };

        const siblingsMap = new Map(); 
        ancestors.forEach(anc => {
            find(anc.uuid);
            // 両親が特定できている場合のみ兄弟判定
            if (anc.sireId && anc.damId) {
                const pairKey = `${anc.sireId}_${anc.damId}`;
                if (!siblingsMap.has(pairKey)) siblingsMap.set(pairKey, new Set());
                siblingsMap.get(pairKey).add(anc.uuid);
            }
        });
        siblingsMap.forEach((uuidSet) => {
            const uuids = Array.from(uuidSet);
            if (uuids.length > 1) {
                const first = uuids[0];
                for (let i = 1; i < uuids.length; i++) {
                    union(first, uuids[i]);
                }
            }
        });
        ancestors.forEach(anc => {
            anc.groupId = find(anc.uuid);
        });

        // =================================================================
        // Step 3: クロス候補の抽出 (通行料の発生判定)
        // =================================================================
        const groups = new Map();
        ancestors.forEach(anc => {
            if (!groups.has(anc.groupId)) groups.set(anc.groupId, []);
            groups.get(anc.groupId).push(anc);
        });

        const validCrossGroupIds = new Set();
        groups.forEach((members, groupId) => {
            if (members.length >= 2) {
                validCrossGroupIds.add(groupId);
            }
        });

        // =================================================================
        // Step 4: 親子包含チェック (セット割引の判定)
        // =================================================================
        const finalValidCrossGroups = new Set();

        // 候補となっているすべてのグループ（親候補）について判定
        validCrossGroupIds.forEach(parentGroupId => {
            const parentMembers = groups.get(parentGroupId);
            
            // この親を表示するかどうか？ (初期値は false = 割引適用で非表示)
            // ただし、一つでも「独立したルート」が見つかれば true になる。
            let isIndependent = false;

            for (const member of parentMembers) {
                // ルートの確認
                if (member.path.length === 0) {
                    // Gen 1 (父母) の場合、ターゲット馬自身が子。
                    // ターゲットはクロスしないので、この親は常に「ターゲット経由」以外のルートを持たない
                    // -> しかし父母自体がクロスしている場合（全きょうだいクロス等）は表示が必要
                    isIndependent = true; 
                    break;
                }

                // 直前の子（C）を取得
                const childUuid = member.path[member.path.length - 1];
                if (!childUuid) {
                    isIndependent = true;
                    break;
                }
                const childGroupId = find(childUuid);

                // 【判定ロジック：セット割引の適用可否】
                // 子も「有効なクロス（validCrossGroupIdsに含まれる）」である場合、
                // 親のこのルートでの登場は、子のセット料金に含まれる。
                // 逆に、子がクロスしていない（ただの通過点）なら、親はこのルートで単独で評価される。

                if (!validCrossGroupIds.has(childGroupId)) {
                    // 子がクロスしていない -> 独立ルート発見！ -> セット割引崩壊
                    isIndependent = true;
                    break; 
                }
                
                // 子がクロスしている場合、このルートは「子の付属品」なのでカウントしない。
                // すべてのルートがこれに該当する場合のみ、親は表示されない。
            }

            if (isIndependent) {
                finalValidCrossGroups.add(parentGroupId);
            }
        });

        // =================================================================
        // Step 5: 結果整形
        // =================================================================
        const crossResults = [];
        groups.forEach((members, groupId) => {
            // 最終的に有効と判定されたグループのみ出力
            if (finalValidCrossGroups.has(groupId)) {
                const names = [...new Set(members.map(m => m.name))].join(', ');
                
                let totalPct = 0;
                members.forEach(m => {
                    totalPct += 100 / Math.pow(2, m.gen);
                });
                
                const gens = members.map(m => m.gen).sort((a, b) => a - b).join(' x ');
                
                crossResults.push({
                    name: names,
                    pct: totalPct,
                    gens: gens,
                    ids: members.map(m => m.htmlId)
                });
            }
        });

        crossResults.sort((a, b) => {
            if (b.pct !== a.pct) return b.pct - a.pct;
            return a.name.localeCompare(b.name);
        });

        return crossResults;
    }
};