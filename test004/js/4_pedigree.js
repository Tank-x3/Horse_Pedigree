window.App = window.App || {};

// --- 血統計算ロジック (Step 4 v4: 馬ごとの包含判定強化版) ---
window.App.Pedigree = {
    calculateCrosses: function(formData) {
        const { ALL_IDS } = App.Consts;

        // Step 0: 強力な名寄せ (test002準拠)
        const nameKeyToUUID = new Map();
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;
            const name = (horse.name_ja || horse.name_en || '').trim();
            if (!name) return;
            const key = horse.birth_year ? `${name}_${horse.birth_year}` : name;
            if (nameKeyToUUID.has(key)) {
                horse.resolvedId = nameKeyToUUID.get(key);
            } else {
                const uuid = horse.id || `temp_${Math.random().toString(36).substr(2, 9)}`;
                horse.resolvedId = uuid;
                nameKeyToUUID.set(key, uuid);
            }
        });

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

        // Step 1: 全祖先データの構築
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

        // Step 2: グループIDの付与 (全きょうだい判定)
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

        // Step 3: クロス判定 (一次判定)
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

            let isValidCross = false;
            if (unmaskedCount >= 1) {
                isValidCross = true;
            } else if (viaCrossIDs.size >= 2) {
                isValidCross = true;
            }

            if (isValidCross) tempValidCrossGroups.add(groupId);
        });

        // Step 4: 親子包含チェック (修正版 v4: 馬ごとの共通項判定)
        const finalValidCrossGroups = new Set(tempValidCrossGroups);

        tempValidCrossGroups.forEach(groupIdA => {
            // このグループに含まれる全祖先ノードを取得
            const allNodes = groups.get(groupIdA);
            
            // ノードを「馬(UUID)」ごとに分類する
            const membersByUuid = new Map();
            allNodes.forEach(node => {
                if (!membersByUuid.has(node.uuid)) membersByUuid.set(node.uuid, []);
                membersByUuid.get(node.uuid).push(node);
            });

            // グループ内の「全ての馬」が、それぞれ何らかのボトルネックに捕まっているか確認
            let isGroupRedundant = true;

            for (const [uuid, nodes] of membersByUuid) {
                // この馬(UUID)の「個人的な共通カバークロス」を探す
                // 初期値は null。最初のパスで見つけたカバー集合をセットし、以降は共通部分(積集合)をとる。
                let personalIntersection = null;

                for (const node of nodes) {
                    // このパス上にある有効なクロスを全てリストアップ
                    const pathCovers = new Set();
                    for (const pathUuid of node.path) {
                        const pathGroupId = find(pathUuid);
                        if (pathGroupId !== groupIdA && tempValidCrossGroups.has(pathGroupId)) {
                            pathCovers.add(pathGroupId);
                        }
                    }

                    // もし一本でも「カバーなし」のルートがあれば、その馬は独立している
                    if (pathCovers.size === 0) {
                        personalIntersection = new Set(); // 空集合 = 共通項なし
                        break;
                    }

                    if (personalIntersection === null) {
                        personalIntersection = pathCovers;
                    } else {
                        // 積集合をとる (共通して含まれるクロスだけ残す)
                        const nextIntersection = new Set();
                        for (const g of personalIntersection) {
                            if (pathCovers.has(g)) nextIntersection.add(g);
                        }
                        personalIntersection = nextIntersection;
                    }

                    // 共通項がなくなったら、その馬はブリッジ（多重クロス）確定
                    if (personalIntersection.size === 0) {
                        break;
                    }
                }

                // この馬に関するループ終了後、共通項が空であれば「捕まっていない(=表示すべき)」
                if (personalIntersection === null || personalIntersection.size === 0) {
                    isGroupRedundant = false;
                    break;
                }
            }

            // 全ての馬が捕まっている場合のみ削除
            if (isGroupRedundant) {
                finalValidCrossGroups.delete(groupIdA);
            }
        });

        // Step 5: 結果整形 (血量計算)
        const crossResults = [];
        groups.forEach((members, groupId) => {
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