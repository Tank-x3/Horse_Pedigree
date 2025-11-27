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
        const { generateUUID } = App.Utils;

        // ★Step 0: メモリ内名寄せ
        const uniqueMap = new Map();
        ALL_IDS.forEach(id => {
            const horse = formData.get(id);
            if (!horse) return;
            const name = horse.name_ja || horse.name_en;
            if (!name) return;
            const key = `${name}_${horse.birth_year || ''}`;
            if (!uniqueMap.has(key)) {
                // 保存前のデータはIDがない場合があるので一時IDを発行
                const uuid = horse.id || `temp_${generateUUID()}`;
                uniqueMap.set(key, uuid);
            }
            horse.resolvedId = uniqueMap.get(key);
        });

        // 親ID解決
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

        // ★Step 1: 全祖先データの構築
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

        // ★Step 2: グループIDの付与 (Union-Find)
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

        // ★Step 3: クロス判定 (一次判定)
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
            const uniqueUUIDs = new Set(members.map(m => m.uuid));
            // const isSameHorseGroup = (uniqueUUIDs.size === 1); // 不要になったため削除

            members.forEach(member => {
                let foundDominantCrossId = null;
                // パスを遡り、既に有効とされたクロス（マスク要因）があるか探す
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
            // 条件1: マスクされていない独立したラインがある
            if (unmaskedCount >= 1) {
                isValidCross = true;
            } 
            // 条件2: 全てマスクされていても、2つ以上の異なるクロス経路を繋いでいる
            // (修正: 全きょうだい等でIDが違っても、グループとして繋いでいればOKとするため isSameHorseGroup を削除)
            else if (viaCrossIDs.size >= 2) {
                isValidCross = true;
            }

            if (isValidCross) tempValidCrossGroups.add(groupId);
        });

        // ★Step 4: 親子包含チェックによる冗長クロスの削除
        const finalValidCrossGroups = new Set(tempValidCrossGroups);

        tempValidCrossGroups.forEach(groupIdA => {
            const membersA = groups.get(groupIdA);
            
            let isRedundant = true;
            let coveringGroupId = null; // このクロスを「包含」している子孫側のクロスID

            for (const memberA of membersA) {
                // メンバー自身はパスに含まれないため、path配列には「ターゲット〜直前の子」までが入っている
                // これを後ろ（子に近い側）から順にチェックする
                
                let foundCoveringGroup = null;

                for (let i = memberA.path.length - 1; i >= 0; i--) {
                    const pathUuid = memberA.path[i];
                    const pathGroupId = find(pathUuid);

                    // 自分自身と同じグループIDは無視して、有効なクロスグループを探す
                    if (pathGroupId !== groupIdA && tempValidCrossGroups.has(pathGroupId)) {
                        foundCoveringGroup = pathGroupId;
                        break; // 最も近い有効なクロスが見つかったらそこでストップ
                    }
                }

                // もし子孫のライン上に有効なクロスが一つもなければ、この馬は独立して表示する必要がある
                if (!foundCoveringGroup) {
                    isRedundant = false;
                    break;
                }

                // 最初のループで基準となるカバーグループを記録
                if (coveringGroupId === null) {
                    coveringGroupId = foundCoveringGroup;
                } 
                // 異なるクロスグループ経由で成立している場合（例：父方はクロスA、母方はクロスB）は
                // 意味合いが異なるため残す
                else if (coveringGroupId !== foundCoveringGroup) {
                    isRedundant = false;
                    break;
                }
            }

            // 全ての経路が「同一の子孫クロス」に包含されている場合のみ削除
            if (isRedundant) {
                finalValidCrossGroups.delete(groupIdA);
            }
        });

        // ★Step 5: 結果整形
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

        return crossResults;
    }
};