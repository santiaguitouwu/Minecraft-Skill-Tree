// src/Components/SkillTree/SkillTree.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    fetchSkillTree,
    selectCompleted,
    selectEntities,
    selectError,
    selectRootId,
    selectSourceUrl,
    selectStatus,
    tryToggleNode,
} from '../../slice';
import { useAppDispatch, useAppSelector } from '../../store';
import styles from './SkillTree.module.css';

const DEFAULT_URL = 'https://minecraft.capta.co/BaseSkillTree.json';

const NODE_SIZE = 44;
const H_GAP = 84;
const V_GAP = 84;
const PADDING = 32;

type PlacedNode = {
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

export default function SkillTree() {
    const dispatch = useAppDispatch();
    const status = useAppSelector(selectStatus);
    const error = useAppSelector(selectError);
    const sourceUrl = useAppSelector(selectSourceUrl);
    const entities = useAppSelector(selectEntities);
    const rootId = useAppSelector(selectRootId);
    const completed = useAppSelector(selectCompleted);

    const [hoverId, setHoverId] = useState<string | null>(null);

    const hostRef = useRef<HTMLDivElement>(null);
    const [hostSize, setHostSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const url = sourceUrl || DEFAULT_URL;
        dispatch(fetchSkillTree(url));
    }, [dispatch]);

    useEffect(() => {
        if (!hostRef.current) return;
        const obs = new ResizeObserver((entries) => {
            const cr = entries[0].contentRect;
            setHostSize({ w: cr.width, h: cr.height });
        });
        obs.observe(hostRef.current);
        return () => obs.disconnect();
    }, []);

    const { placed, edges, naturalW, naturalH } = useMemo(() => {
        if (!rootId) return { placed: [], edges: [], naturalW: 400, naturalH: 300 };

        const q: Array<{ id: string; depth: number; parentId: string | null }> = [
            { id: rootId, depth: 0, parentId: null },
        ];
        const levels: Record<number, string[]> = {};
        const parent: Record<string, string | null> = { [rootId]: null };

        while (q.length) {
            const cur = q.shift()!;
            levels[cur.depth] ??= [];
            levels[cur.depth].push(cur.id);
            const node = entities[cur.id];
            node.childrenIds.forEach((cid) => {
                parent[cid] = cur.id;
                q.push({ id: cid, depth: cur.depth + 1, parentId: cur.id });
            });
        }

        const depthCount = Object.keys(levels).length;
        const maxPerColumn = Math.max(...Object.values(levels).map((arr) => arr.length));

        const naturalW = PADDING * 2 + (depthCount - 1) * H_GAP + NODE_SIZE;
        const naturalH = PADDING * 2 + (maxPerColumn - 1) * V_GAP + NODE_SIZE;

        const coordMap: Record<string, { x: number; y: number; depth: number }> = {};
        Object.entries(levels).forEach(([dStr, ids]) => {
            const d = Number(dStr);
            const x = PADDING + d * H_GAP;

            const columnHeight = ids.length * NODE_SIZE + (ids.length - 1) * (V_GAP - NODE_SIZE);
            const offsetY = (naturalH - columnHeight) / 2;

            ids.forEach((id, i) => {
                const y = offsetY + i * V_GAP;
                coordMap[id] = { x, y, depth: d };
            });
        });

        const placed: PlacedNode[] = Object.keys(coordMap).map((id) => {
            const n = entities[id];
            const p = parent[id];
            const parentCompleted = p ? completed[p] : true;
            return {
                id,
                x: coordMap[id].x,
                y: coordMap[id].y,
                depth: coordMap[id].depth,
                name: n.name,
                description: n.description,
                image: n.image,
                parentId: p ?? null,
                isCompleted: completed[id],
                isUnlocked: parentCompleted,
            };
        });

        const edges: [string, string][] = [];
        Object.values(entities).forEach((n) => n.childrenIds.forEach((cid) => edges.push([n.id, cid])));

        return { placed, edges, naturalW, naturalH };
    }, [entities, rootId, completed]);

    if (status === 'loading') return <p style={{ color: '#ccc' }}>Cargando árbol…</p>;
    if (status === 'failed') return <p style={{ color: 'tomato' }}>Error: {error}</p>;
    if (!rootId) return null;

    const hovered = hoverId ? placed.find((p) => p.id === hoverId) : null;

    return (
        <div ref={hostRef} className={styles.host}>
            <div
                className={styles.stage}
                style={{
                    width: `${naturalW}px`,
                    height: `${naturalH}px`,
                }}
            >
                <svg width={naturalW} height={naturalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {(() => {
                        // Mapa rápido id->PlacedNode
                        const byId = new Map<string, PlacedNode>();
                        placed.forEach(p => byId.set(p.id, p));

                        // Agrupar hijos por padre
                        const childrenByParent = new Map<string, PlacedNode[]>();
                        Object.values(entities).forEach(n => {
                            const parent = byId.get(n.id)!;
                            const kids = n.childrenIds.map(cid => byId.get(cid)!).filter(Boolean) as PlacedNode[];
                            if (kids.length) childrenByParent.set(n.id, kids);
                        });

                        // Dibujo por grupo (padre -> hijos)
                        const polylines: JSX.Element[] = [];
                        let i = 0;

                        childrenByParent.forEach((kids, parentId) => {
                            const A = byId.get(parentId)!;

                            const parentRightX  = A.x + NODE_SIZE;
                            const parentCenterY = A.y + NODE_SIZE / 2;

                            // rail X: a ~55% del gap hacia la columna hija (pegadito al hijo, pero constante por columna)
                            const railX = A.x + H_GAP * 0.55;

                            // ordenar hijos por Y y calcular junction en el punto medio entre el top y bottom
                            const centersY = kids.map(k => k.y + NODE_SIZE / 2).sort((a,b)=>a-b);
                            const topY = centersY[0];
                            const botY = centersY[centersY.length - 1];
                            const junctionY = (topY + botY) / 2;

                            // Para cada hijo, ruta: padre → rail (Y padre) → junction → Y hijo → hijo
                            kids.forEach(B => {
                                const childLeftX   = B.x;
                                const childCenterY = B.y + NODE_SIZE / 2;

                                const points = [
                                    `${parentRightX},${parentCenterY}`,
                                    `${railX},${parentCenterY}`,
                                    `${railX},${junctionY}`,
                                    `${railX},${childCenterY}`,
                                    `${childLeftX},${childCenterY}`,
                                ].join(' ');

                                polylines.push(
                                    <polyline
                                        key={`e-${parentId}-${B.id}-${i++}`}
                                        points={points}
                                        fill="none"
                                        stroke="white"
                                        strokeOpacity={0.85}
                                        strokeWidth={3}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                );
                            });
                        });

                        return polylines;
                    })()}
                </svg>

                {placed.map((n) => {
                    const locked = !n.isUnlocked;
                    const done = n.isCompleted;
                    return (
                        <button
                            key={n.id}
                            onClick={() => dispatch(tryToggleNode(n.id))}
                            onMouseEnter={() => setHoverId(n.id)}
                            onMouseLeave={() => setHoverId(null)}
                            title={n.name}
                            disabled={locked}
                            style={{
                                position: 'absolute',
                                left: n.x,
                                top: n.y,
                                width: NODE_SIZE,
                                height: NODE_SIZE,
                                borderRadius: 6,
                                border: '3px solid',
                                borderColor: done ? '#c78a00' : locked ? '#777' : '#fff',
                                background: done ? 'rgba(199,138,0)' : 'rgba(255,255,255)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                /*cursor: locked ? 'not-allowed' : 'pointer',*/
                            }}
                        >
                            <img
                                src={n.image}
                                alt={n.name}
                                style={{
                                    width: NODE_SIZE - 10,
                                    height: NODE_SIZE - 10,
                                    objectFit: 'contain',
                                    imageRendering: 'pixelated',
                                    pointerEvents: 'none',
                                }}
                            />
                        </button>
                    );
                })}

                {hovered && (
                    <div
                        style={{
                            position: 'absolute',
                            left: Math.min(hovered.x + NODE_SIZE + 12, naturalW - 240),
                            top: Math.max(hovered.y - 8, 8),
                            width: 220,
                            background: 'linear-gradient(180deg, #08a 0%, #016 100%)',
                            color: '#fff',
                            borderRadius: 6,
                            padding: '10px 12px',
                            boxShadow: '0 10px 24px rgba(0,0,0,0.4)',
                            border: '2px solid rgba(0,0,0,0.6)',
                            pointerEvents: 'none',
                            zIndex: 10,
                        }}
                    >
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>{hovered.name}</div>
                        <div style={{ fontSize: 13, color: '#90ff90' }}>{hovered.description}</div>
                    </div>
                )}
            </div>
        </div>
    );
}