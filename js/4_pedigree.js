window.App = window.App || {};

// --- 血統計算ロジック (Step 0強化版: 完全データスキャン) ---
window.App.Pedigree = {
    calculateCrosses: function(formData) {
        // Step 0: 強力な名寄せ (ALL_IDSに依存せず、全データをスキャンする)
        const nameKeyToUUID = new Map();
        
        // formData内の全ての馬エントリを走査
        for (const [id, horse] of formData) {
            if (!horse) continue;
            const name = (horse.name_ja || horse.name_en || '').trim();

            // ▼▼▼ 修正箇所1: 名前が空でも対象馬(target)なら通す ▼▼▼
            if (!name && id !== 'target') continue;

            // 生年も文字列化してトリム
            const year = (horse.birth_year || '').toString().trim();
            
            // 名前がない(対象馬の)場合は、名寄せキーを作らず常にユニーク扱いとする
            if (!name) {
                if (!horse.id) horse.id = `temp_${Math.random().toString(36).substr(2, 9)}`;
                horse.resolvedId = horse.id;
                continue; 
            }
            // ▲▲▲ 修正箇所1 ここまで ▲▲▲
            
            // 名寄せキー: 生年があれば「名前_生年」、なければ「名前」
            const key = year ? `${name}_${year}` : name;

            if (nameKeyToUUID.has(key)) {
                // 既に同名の馬がいる場合、そのUUIDで上書き（統合）
                horse.resolvedId = nameKeyToUUID.get(key);
            } else {
                // 初出の場合、自身のIDか、なければ一時IDを発行
                const uuid = horse.id || `temp_${Math.random().toString(36).substr(2, 9)}`;
                horse.resolvedId = uuid;
                nameKeyToUUID.set(key, uuid);
            }
        }

        // 親ID解決 (全データ対象)
        for (const [id, horse] of formData) {
            if (!horse || !horse.resolvedId) continue;
            
            let sId, dId;
            if (id === 'target') { sId = 's'; dId = 'd'; }
            else { sId = id + 's'; dId = id + 'd'; }
            
            const sire = formData.get(sId);
            const dam = formData.get(dId);
            horse.resolvedSireId = sire ? sire.resolvedId : null;
            horse.resolvedDamId = dam ? dam.resolvedId : null;
        }

        // Step 1: 全祖先データの構築 (再帰探索)
        const ancestors = []; 
        const traverse = (currentId, currentPath, gen) => {
            if (gen > 5) return; // 5代まで
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

        // Step 4: 親子包含チェック (v4: 馬ごとの共通項判定)
        const finalValidCrossGroups = new Set(tempValidCrossGroups);

        tempValidCrossGroups.forEach(groupIdA => {
            const allNodes = groups.get(groupIdA);
            const membersByUuid = new Map();
            allNodes.forEach(node => {
                if (!membersByUuid.has(node.uuid)) membersByUuid.set(node.uuid, []);
                membersByUuid.get(node.uuid).push(node);
            });

            let isGroupRedundant = true;

            for (const [uuid, nodes] of membersByUuid) {
                let personalIntersection = null;

                for (const node of nodes) {
                    const pathCovers = new Set();
                    for (const pathUuid of node.path) {
                        const pathGroupId = find(pathUuid);
                        if (pathGroupId !== groupIdA && tempValidCrossGroups.has(pathGroupId)) {
                            pathCovers.add(pathGroupId);
                        }
                    }
                    if (pathCovers.size === 0) {
                        personalIntersection = new Set();
                        break;
                    }
                    if (personalIntersection === null) {
                        personalIntersection = pathCovers;
                    } else {
                        const nextIntersection = new Set();
                        for (const g of personalIntersection) {
                            if (pathCovers.has(g)) nextIntersection.add(g);
                        }
                        personalIntersection = nextIntersection;
                    }
                    if (personalIntersection.size === 0) break;
                }

                if (personalIntersection === null || personalIntersection.size === 0) {
                    isGroupRedundant = false;
                    break;
                }
            }
            if (isGroupRedundant) {
                finalValidCrossGroups.delete(groupIdA);
            }
        });

        // Step 5: 結果整形
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

        // ▼▼▼ 修正: debugMap を削除 ▼▼▼
        return {
            list: crossResults
        };
    }
};