window.App = window.App || {};

// --- 血統計算ロジック (完全版) ---
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
        // Step 0: 強力な名寄せ (Force Unification) - From test002
        // =================================================================
        // 「名前+生年」が一致する馬はすべて同一IDに統合する
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
        // Step 1: 全祖先データの構築
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
                    path: [...currentPath], 
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
        // Step 2: グループIDの付与 (全きょうだい判定)
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
        // Step 3: クロス判定 (一次判定・修正版)
        // =================================================================
        ancestors.sort((a, b) => a.gen - b.gen);
        const tempValidCrossGroups = new Set();
        const groups = new Map();
        ancestors.forEach(anc => {
            if (!groups.has(anc.groupId)) groups.set(anc.groupId, []);
            groups.get(anc.groupId).push(anc);
        });

        groups.forEach((members, groupId) => {
            if (members.length < 2) return; 

            const viaCrossIDs = new Set();
            let unmaskedCount = 0;

            members.forEach(member => {
                let foundDominantCrossId = null;
                // パスを遡り、既に有効なクロスグループに含まれているか確認
                for (let i = member.path.length - 1; i >= 0; i--) {
                    const pathUuid = member.path[i];
                    const pathGroupId = find(pathUuid);
                    if (tempValidCrossGroups.has(pathGroupId)) {
                        foundDominantCrossId = pathGroupId;
                        break;
                    }
                }
                if (foundDominantCrossId) {
                    viaCrossIDs.add(foundDominantCrossId);
                } else {
                    unmaskedCount++;
                }
            });

            // 修正: IDが異なっても(全きょうだい)、複数のクロス経路を繋いでいればOK
            let isValidCross = false;
            if (unmaskedCount >= 1) {
                isValidCross = true;
            } else if (viaCrossIDs.size >= 2) {
                isValidCross = true;
            }

            if (isValidCross) tempValidCrossGroups.add(groupId);
        });

        // =================================================================
        // Step 4: 親子包含チェック (修正版v2)
        // =================================================================
        const finalValidCrossGroups = new Set(tempValidCrossGroups);

        tempValidCrossGroups.forEach(groupIdA => {
            const membersA = groups.get(groupIdA);
            
            let isRedundant = true;
            let coveringGroupId = null; 

            for (const memberA of membersA) {
                let foundCoveringGroup = null;

                // パス上の子孫（左側）をチェック
                for (let i = memberA.path.length - 1; i >= 0; i--) {
                    const pathUuid = memberA.path[i];
                    const pathGroupId = find(pathUuid);

                    if (pathGroupId !== groupIdA && tempValidCrossGroups.has(pathGroupId)) {
                        foundCoveringGroup = pathGroupId;
                        break; 
                    }
                }

                // 「誰にもカバーされていないルート」が1本でもあれば削除しない (Hurry On救済)
                if (!foundCoveringGroup) {
                    isRedundant = false;
                    break;
                }

                // 最初のルートのカバー元を記録
                if (coveringGroupId === null) {
                    coveringGroupId = foundCoveringGroup;
                } 
                // 「異なる親クロス」によってカバーされている場合 (SS救済)
                else if (coveringGroupId !== foundCoveringGroup) {
                    isRedundant = false;
                    break;
                }
            }

            if (isRedundant) {
                finalValidCrossGroups.delete(groupIdA);
            }
        });

        // =================================================================
        // Step 5: 結果整形 (血量計算修正)
        // =================================================================
        const crossResults = [];
        groups.forEach((members, groupId) => {
            if (finalValidCrossGroups.has(groupId)) {
                // 名前を列挙 (例: "ロザリンド, エピファネイア")
                const names = [...new Set(members.map(m => m.name))].join(', ');
                
                let totalPct = 0;
                members.forEach(m => {
                    // 血量計算: 画像の表記に合わせて gen をそのまま利用
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
        
        // 血量が多い順 > 名前順でソート
        crossResults.sort((a, b) => {
            if (b.pct !== a.pct) return b.pct - a.pct;
            return a.name.localeCompare(b.name);
        });

        return crossResults;
    }
};