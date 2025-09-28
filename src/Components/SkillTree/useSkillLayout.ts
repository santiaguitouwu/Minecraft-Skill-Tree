// src/Components/SkillTree/useSkillLayout.ts
import { useMemo } from 'react';
import type { SkillNode } from '../../slice';

export type PlacedNode = {
    id: string;
    x: number;
    y: number;
    depth: number;
    name: string;
    description: string;
    image: string;
    parentId: string | null;
    isCompleted: boolean;
    isUnlocked: boolean;
};

export const NODE_SIZE = 52;
export const H_GAP = 80;
export const V_GAP = 64;
export const PADDING = 32;

export default function useSkillLayout(
    entities: Record<string, SkillNode>,
    rootId: string | null,
    completed: Record<string, boolean>,
) {
    return useMemo(() => {
        if (!rootId) return { placed: [] as PlacedNode[], edges: [] as [string,string][], naturalW: 400, naturalH: 300 };

        // --- BFS: levels y padres
        const q: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
        const levels: Record<number, string[]> = {};
        const parentOf: Record<string, string | null> = { [rootId]: null };
        let maxDepth = 0;

        while (q.length) {
            const { id, depth } = q.shift()!;
            maxDepth = Math.max(maxDepth, depth);
            (levels[depth] ??= []).push(id);
            const node = entities[id];
            node.childrenIds.forEach((cid) => {
                parentOf[cid] = id;
                q.push({ id: cid, depth: depth + 1 });
            });
        }

        const xAtDepth: Record<number, number> = {};
        for (let d = 0; d <= maxDepth; d++) xAtDepth[d] = PADDING + d * H_GAP;

        // --- DFS tidy: filas por altura del subárbol
        const childrenOf: Record<string, string[]> = {};
        Object.keys(entities).forEach((id) => (childrenOf[id] = entities[id].childrenIds.slice()));

        const row: Record<string, number> = {};
        let nextLeaf = 0;
        function assignRow(id: string) {
            const kids = childrenOf[id];
            if (!kids || kids.length === 0) {
                row[id] = nextLeaf++;
                return row[id];
            }
            kids.forEach(assignRow);
            const sorted = kids.slice().sort((a,b)=>row[a]-row[b]);
            if (sorted.length % 2 === 1) {
                const mid = (sorted.length - 1) / 2;
                row[id] = row[sorted[mid]];
            } else {
                const midA = sorted[sorted.length/2 - 1];
                const midB = sorted[sorted.length/2];
                row[id] = (row[midA] + row[midB]) / 2;
            }
            return row[id];
        }
        assignRow(rootId);

        const allRows = Object.values(row);
        const minRow = Math.min(...allRows);
        const maxRow = Math.max(...allRows);
        const rowSpan = Math.max(0, maxRow - minRow);

        const yMap: Record<string, number> = {};
        Object.keys(row).forEach((id) => (yMap[id] = PADDING + (row[id] - minRow) * V_GAP));

        const naturalH = PADDING * 2 + rowSpan * V_GAP + NODE_SIZE;
        const naturalW = PADDING * 2 + Math.max(0, ...Object.keys(levels).map(Number)) * H_GAP + NODE_SIZE;

        const placed: PlacedNode[] = Object.keys(entities).map((id) => {
            let d = 0;
            while (levels[d] && !levels[d].includes(id)) d++;
            const p = parentOf[id];
            return {
                id,
                x: xAtDepth[d] ?? PADDING,
                y: yMap[id] ?? PADDING,
                depth: d,
                name: entities[id].name,
                description: entities[id].description,
                image: entities[id].image,
                parentId: p ?? null,
                isCompleted: !!completed[id],
                isUnlocked: p ? !!completed[p] : true,
            };
        }).sort((a,b)=>a.depth-b.depth || a.y-b.y);

        const edges: [string,string][] = [];
        Object.values(entities).forEach(n => n.childrenIds.forEach(cid => edges.push([n.id, cid])));

        return { placed, edges, naturalW, naturalH };
    }, [entities, rootId, completed]);
}
