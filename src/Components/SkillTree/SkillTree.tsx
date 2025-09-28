// src/Components/SkillTree/SkillTree.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
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
import useSkillLayout, { NODE_SIZE } from './useSkillLayout';
import EdgesLayer from './EdgesLayer';
import NodeButton from './NodeButton';
import TooltipPortal from './TooltipPortal';
import styles from './SkillTree.module.css';

export default function SkillTree() {
    const dispatch   = useAppDispatch();
    const status     = useAppSelector(selectStatus);
    const error      = useAppSelector(selectError);
    const sourceUrl  = useAppSelector(selectSourceUrl);
    const entities   = useAppSelector(selectEntities);
    const rootId     = useAppSelector(selectRootId);
    const completed  = useAppSelector(selectCompleted);

    // Cargar árbol desde la URL guardada en Redux
    useEffect(() => {
        if (sourceUrl) dispatch(fetchSkillTree(sourceUrl));
    }, [dispatch, sourceUrl]);

    const { placed, edges, naturalW, naturalH } =
        useSkillLayout(entities, rootId, completed);

    // refs/estado de UI
    const hostRef  = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [hoverId, setHoverId] = useState<string | null>(null);
    const hovered = hoverId ? placed.find(p => p.id === hoverId) : null;

    // medir contenedor para decidir si se puede hacer pan y para el cursor
    const [hostSize, setHostSize] = useState({ w: 0, h: 0 });
    useEffect(() => {
        if (!hostRef.current) return;
        const obs = new ResizeObserver((es) => {
            const r = es[0].contentRect;
            setHostSize({ w: r.width, h: r.height });
        });
        obs.observe(hostRef.current);
        return () => obs.disconnect();
    }, []);
    const canPan = naturalW > hostSize.w || naturalH > hostSize.h;

    // posicionar tooltip en viewport (usa portal -> no se recorta)
    const tooltipPos = useMemo(() => {
        if (!hovered || !stageRef.current) return null;
        const r = stageRef.current.getBoundingClientRect();

        const nodeX = r.left + hovered.x;
        const nodeY = r.top  + hovered.y;
        const nodeW = NODE_SIZE;
        const nodeH = NODE_SIZE;

        const TT_W = 240, TT_H = 120, GAP = 12, PAD = 8;
        const vw = window.innerWidth, vh = window.innerHeight;

        // preferencia derecha → izquierda → abajo → arriba
        let left = nodeX + nodeW + GAP;
        let top  = nodeY;

        if (left + TT_W > vw - PAD) {
            left = nodeX - GAP - TT_W;
            if (left < PAD) {
                left = nodeX + nodeW/2 - TT_W/2;
                top  = nodeY + nodeH + GAP;
                if (top + TT_H > vh - PAD) {
                    top = nodeY - GAP - TT_H;
                }
            }
        }

        left = Math.min(Math.max(left, PAD), vw - PAD - TT_W);
        top  = Math.min(Math.max(top,  PAD), vh - PAD - TT_H);
        return { left, top };
    }, [hovered]);

    // pan con pointer events (solo si canPan)
    const isPanningRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);

    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        if (!canPan || !hostRef.current) return;
        if ((e.target as HTMLElement).closest('button')) return; // no pan si click en nodo
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

    // estados de carga/errores
    if (status === 'loading') return <p style={{ color: '#ccc' }}>Cargando árbol…</p>;
    if (status === 'failed')   return <p style={{ color: 'tomato' }}>Error: {error}</p>;
    if (!rootId)               return null;

    return (
        <div
            ref={hostRef}
            className={`${styles.host} ${canPan ? styles.pannable : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPan}
            onPointerLeave={endPan}
            onPointerCancel={endPan}
        >
            <div
                ref={stageRef}
                className={styles.stage}
                style={{ width: naturalW, height: naturalH }}
            >
                <EdgesLayer
                    placed={placed}
                    edges={[]}                // no lo usamos dentro (agrupa por padre directo desde entities)
                    entities={entities}
                    width={naturalW}
                    height={naturalH}
                />

                {placed.map(n => (
                    <NodeButton
                        key={n.id}
                        x={n.x}
                        y={n.y}
                        image={n.image}
                        name={n.name}
                        isCompleted={n.isCompleted}
                        isUnlocked={n.isUnlocked}
                        onEnter={() => setHoverId(n.id)}
                        onLeave={() => setHoverId(null)}
                        onClick={() => {
                            // bloquear des-selección; solo marcar si está desbloqueado
                            if (n.isCompleted) return;
                            if (!n.isUnlocked) return;
                            dispatch(tryToggleNode(n.id));
                        }}
                    />
                ))}
            </div>

            {hovered && tooltipPos && (
                <TooltipPortal
                    left={tooltipPos.left}
                    top={tooltipPos.top}
                    title={hovered.name}
                    description={hovered.description}
                />
            )}
        </div>
    );
}