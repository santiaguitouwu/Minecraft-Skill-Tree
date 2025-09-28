// src/Components/SkillTree/SkillTree.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const NODE_SIZE = 52;
const H_GAP = 80;
const V_GAP = 64;
const PADDING = 32;

interface PlacedNode {
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
}

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
    const isPanningRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const stageRef = useRef<HTMLDivElement>(null); // para portal
    const [hostSize, setHostSize] = useState({ w: 0, h: 0 });


    useEffect(() => {
        if (!sourceUrl) return;
        dispatch(fetchSkillTree(sourceUrl));
    }, [dispatch, sourceUrl]);

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

        // --- BFS: niveles (depth) y padres ---
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

        // X por columna
        const xAtDepth: Record<number, number> = {};
        for (let d = 0; d <= maxDepth; d++) xAtDepth[d] = PADDING + d * H_GAP;

        // --- DFS estilo "tidy": filas según altura del subárbol ---
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

            // primero posiciona hijos (postorden)
            kids.forEach(assignRow);
            const sorted = kids.slice().sort((a, b) => row[a] - row[b]);

            if (sorted.length % 2 === 1) {
                // impar: usa el hijo del medio
                const mid = (sorted.length - 1) / 2;
                row[id] = row[sorted[mid]];
            } else {
                // par: promedio de los del medio
                const sum = sorted.reduce((acc, cid) => acc + row[cid], 0);
                row[id] = sum / sorted.length;
            }
            return row[id];
        }
        assignRow(rootId);

        const allRows = Object.values(row);
        const minRow = Math.min(...allRows);
        const maxRow = Math.max(...allRows);
        const rowSpan = Math.max(0, maxRow - minRow);

        // Y por fila normalizada
        const yMap: Record<string, number> = {};
        Object.keys(row).forEach((id) => (yMap[id] = PADDING + (row[id] - minRow) * V_GAP));

        const naturalH = PADDING * 2 + rowSpan * V_GAP + NODE_SIZE;
        const naturalW = PADDING * 2 + Math.max(0, ...Object.keys(levels).map(Number)) * H_GAP + NODE_SIZE;

        // Construir placed[]
        const placed: PlacedNode[] = Object.keys(entities).map((id) => {
            // depth del nodo: buscar en levels
            let d = 0;
            while (levels[d] && !levels[d].includes(id)) d++;
            return {
                id,
                x: xAtDepth[d] ?? PADDING,
                y: yMap[id] ?? PADDING,
                depth: d,
                name: entities[id].name,
                description: entities[id].description,
                image: entities[id].image,
                parentId: parentOf[id] ?? null,
                isCompleted: !!completed[id],
                isUnlocked: parentOf[id] ? !!completed[parentOf[id]!] : true,
            };
        });
        placed.sort((a, b) => a.depth - b.depth || a.y - b.y);

        // Edges (padre, hijo)
        const edges: [string, string][] = [];
        Object.values(entities).forEach((n) => n.childrenIds.forEach((cid) => edges.push([n.id, cid])));

        return { placed, edges, naturalW, naturalH };
    }, [entities, rootId, completed]);

    // Escalado para ocupar el contenedor padre (se calcula SIEMPRE antes de cualquier return)
    const canFit = naturalW > 0 && naturalH > 0 && hostSize.w > 0 && hostSize.h > 0;
    const scaleX = canFit ? hostSize.w / naturalW : 1;
    const scaleY = canFit ? hostSize.h / naturalH : 1;

    const hovered = hoverId ? placed.find((p) => p.id === hoverId) : null;

    // Posición del tooltip en pantalla (portal) — este hook también se evalúa SIEMPRE
    const tooltipScreenPos = useMemo(() => {
        if (!hovered || !stageRef.current) return null;

        const r = stageRef.current.getBoundingClientRect();

        // Tamaño del nodo en pantalla (con escala)
        const nodeX = r.left + hovered.x * scaleX;
        const nodeY = r.top  + hovered.y * scaleY;
        const nodeW = NODE_SIZE * scaleX;
        const nodeH = NODE_SIZE * scaleY;

        // Tamaño aprox. del tooltip (cabecera + cuerpo)
        const TT_W = 240;
        const TT_H = 120; // si te queda corto/largo, ajusta este número

        const GAP = 12;      // separación mínima respecto al nodo
        const PAD = 8;       // margen a los bordes de la ventana

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Preferencia 1: DERECHA del nodo
        let left = nodeX + nodeW + GAP;
        let top  = nodeY; // alineado al top del nodo

        const fitsRight = left + TT_W <= vw - PAD;
        if (!fitsRight) {
            // Preferencia 2: IZQUIERDA del nodo
            left = nodeX - GAP - TT_W;
            if (left < PAD) {
                // Preferencia 3: ABAJO del nodo (centrado horizontal al nodo)
                left = nodeX + nodeW / 2 - TT_W / 2;
                top  = nodeY + nodeH + GAP;

                const fitsBottom = top + TT_H <= vh - PAD;
                if (!fitsBottom) {
                    // Preferencia 4: ARRIBA del nodo
                    top = nodeY - GAP - TT_H;
                }
            }
        }

        // Clamps suaves a los bordes
        left = Math.min(Math.max(left, PAD), vw - PAD - TT_W);
        top  = Math.min(Math.max(top,  PAD), vh - PAD - TT_H);

        return { left, top, width: TT_W, height: TT_H };
    }, [hovered, scaleX, scaleY]);

    // --- Ahora sí, returns tempranos (después de todos los hooks) ---
    if (status === 'loading') return <p style={{ color: '#ccc' }}>Cargando árbol…</p>;
    if (status === 'failed') return <p style={{ color: 'tomato' }}>Error: {error}</p>;
    if (!rootId) return null;

    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!hostRef.current) return;

        // evita iniciar pan si haces click directo sobre un nodo (botón)
        if ((e.target as HTMLElement).closest('button')) return;

        isPanningRef.current = true;
        lastRef.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        hostRef.current.classList.add(styles.panning);
        e.preventDefault();
    };

    const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!isPanningRef.current || !hostRef.current || !lastRef.current) return;
        const dx = e.clientX - lastRef.current.x;
        const dy = e.clientY - lastRef.current.y;
        hostRef.current.scrollLeft -= dx;
        hostRef.current.scrollTop  -= dy;
        lastRef.current = { x: e.clientX, y: e.clientY };
    };

    const endPan: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!hostRef.current) return;
        isPanningRef.current = false;
        lastRef.current = null;
        hostRef.current.classList.remove(styles.panning);
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    };

    const canPan = naturalW > hostSize.w || naturalH > hostSize.h;

    return (
        <div ref={hostRef} className={`${styles.host} ${canPan ? styles.pannable : ''}`}>
            <div
                ref={stageRef}
                className={styles.stage}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPan}
                onPointerLeave={endPan}
                onPointerCancel={endPan}
                style={{
                    width: `${naturalW}px`,
                    height: `${naturalH}px`,
                    transform: `scale(${scaleX}, ${scaleY})`,
                    transformOrigin: 'top left',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                }}
            >
                {/* Conexiones con rail por padre */}
                <svg width={naturalW} height={naturalH} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {(() => {
                        const map = new Map<string, PlacedNode>();
                        placed.forEach((p) => map.set(p.id, p));

                        const cy = new Map<string, number>();
                        placed.forEach((p) => cy.set(p.id, Math.round(p.y + NODE_SIZE / 2)));

                        const childrenByParent = new Map<string, PlacedNode[]>();
                        Object.values(entities).forEach((n) => {
                            const arr = n.childrenIds.map((id) => map.get(id)!).filter(Boolean) as PlacedNode[];
                            if (arr.length) childrenByParent.set(n.id, arr);
                        });

                        const lines: JSX.Element[] = [];
                        let k = 0;
                        const EPS = 2;

                        childrenByParent.forEach((kids, pid) => {
                            const A = map.get(pid)!;
                            const parentRightX = A.x + NODE_SIZE;
                            const parentCY = cy.get(pid)!;

                            // Un solo hijo → línea directa
                            if (kids.length === 1) {
                                const B = kids[0];
                                const childCY = cy.get(B.id)!;
                                const y = Math.abs(childCY - parentCY) <= EPS ? parentCY : childCY;
                                lines.push(
                                    <polyline
                                        key={`direct-${pid}-${B.id}-${k++}`}
                                        points={`${parentRightX},${y} ${B.x},${y}`}
                                        fill="none"
                                        stroke="white"
                                        strokeOpacity={0.9}
                                        strokeWidth={3}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                );
                                return;
                            }

                            // Rail
                            const nearestChildLeft = Math.min(...kids.map((c) => c.x));
                            const centerGapX = A.x + NODE_SIZE + (H_GAP - NODE_SIZE) / 2;
                            const railMin = A.x + NODE_SIZE + 8;
                            const railMax = nearestChildLeft - 12;
                            const railX = Math.max(railMin, Math.min(centerGapX, railMax));

                            const childCYs = kids.map((c) => cy.get(c.id)!);
                            const topY = Math.min(...childCYs);
                            const botY = Math.max(...childCYs);

                            const alignedY = childCYs.find((y) => Math.abs(y - parentCY) <= EPS);
                            const yParentToRail = alignedY ?? parentCY;

                            lines.push(
                                <polyline
                                    key={`pr-${pid}-${k++}`}
                                    points={`${parentRightX},${yParentToRail} ${railX},${yParentToRail}`}
                                    fill="none"
                                    stroke="white"
                                    strokeOpacity={0.9}
                                    strokeWidth={3}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            );

                            lines.push(
                                <polyline
                                    key={`rv-${pid}-${k++}`}
                                    points={`${railX},${topY} ${railX},${botY}`}
                                    fill="none"
                                    stroke="white"
                                    strokeOpacity={0.9}
                                    strokeWidth={3}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                            );

                            kids.forEach((B) => {
                                const cY = cy.get(B.id)!;
                                const y = Math.abs(cY - parentCY) <= EPS ? yParentToRail : cY;
                                lines.push(
                                    <polyline
                                        key={`rh-${pid}-${B.id}-${k++}`}
                                        points={`${railX},${y} ${B.x},${y}`}
                                        fill="none"
                                        stroke="white"
                                        strokeOpacity={0.9}
                                        strokeWidth={3}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                );
                            });
                        });

                        return lines;
                    })()}
                </svg>

                {/* Nodos */}
                {placed.map((n) => {
                    const done = n.isCompleted;
                    return (
                        <button
                            key={n.id}
                            onClick={() => {
                                // Solo permite marcar si NO está completado y está desbloqueado
                                if (n.isCompleted) return;
                                if (!n.isUnlocked) return;
                                dispatch(tryToggleNode(n.id));
                            }}
                            onMouseEnter={() => setHoverId(n.id)}
                            onMouseLeave={() => setHoverId(null)}
                            style={{
                                position: 'absolute',
                                left: n.x,
                                top: n.y,
                                width: NODE_SIZE,
                                height: NODE_SIZE,
                                border: '3px solid',
                                borderColor: '#000000',
                                boxShadow: '1px 2px 1px 1px #000000',
                                background: done ? 'rgba(172, 124, 12)' : 'rgba(196, 196, 196)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <img
                                src={n.image}
                                alt={n.name}
                                style={{
                                    width: NODE_SIZE - 20,
                                    height: NODE_SIZE - 20,
                                    objectFit: 'contain',
                                    imageRendering: 'pixelated',
                                    pointerEvents: 'none',
                                }}
                            />
                        </button>
                    );
                })}

                {/* Tooltip en portal (no se recorta por overflow) */}
                {hovered && tooltipScreenPos && createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            left: tooltipScreenPos.left,
                            top: tooltipScreenPos.top,
                            width: 240,
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: '2px solid rgba(0,0,0,0.65)',
                            boxShadow: '3px 3px 0 rgba(0,0,0,0.9)',
                            background: '#0f0f0f',
                            pointerEvents: 'none',
                            zIndex: 9999,
                        }}
                    >
                        <div
                            style={{
                                background: 'linear-gradient(180deg, #078bb5 0%, #045a7a 100%)',
                                color: '#ffffff',
                                fontWeight: 800,
                                padding: '8px 10px',
                                borderBottom: '2px solid rgba(0,0,0,0.45)',
                                letterSpacing: '0.2px',
                                textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                            }}
                        >
                            {hovered.name}
                        </div>
                        <div
                            style={{
                                padding: '10px',
                                background: '#101010',
                                color: '#39ff4a',
                                fontSize: 14,
                                lineHeight: 1.25,
                                textShadow: '0 1px 0 rgba(0,0,0,0.6)',
                            }}
                        >
                            {hovered.description}
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}