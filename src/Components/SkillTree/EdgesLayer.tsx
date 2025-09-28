import type { PlacedNode } from './useSkillLayout';
import { NODE_SIZE, H_GAP } from './useSkillLayout';

type Props = {
    placed: PlacedNode[];
    edges: [string,string][];
    entities: Record<string, { childrenIds: string[] }>;
    width: number;
    height: number;
};

export default function EdgesLayer({ placed, entities, width, height }: Props) {
    const byId = new Map(placed.map(p => [p.id, p]));
    const cy = new Map(placed.map(p => [p.id, Math.round(p.y + NODE_SIZE/2)]));

    const groups = new Map<string, PlacedNode[]>();
    Object.keys(entities).forEach(pid => {
        const kids = entities[pid]?.childrenIds?.map(id => byId.get(id)!).filter(Boolean) as PlacedNode[];
        if (kids?.length) groups.set(pid, kids);
    });

    const EPS = 2;
    const lines: JSX.Element[] = [];
    let k=0;

    groups.forEach((kids, pid) => {
        const A = byId.get(pid)!;
        const parentRightX = A.x + NODE_SIZE;
        const parentCY = cy.get(pid)!;

        if (kids.length === 1) {
            const B = kids[0];
            const cY = cy.get(B.id)!;
            const y = Math.abs(cY - parentCY) <= EPS ? parentCY : cY;
            lines.push(
                <polyline key={`d-${pid}-${B.id}-${k++}`}
                          points={`${parentRightX},${y} ${B.x},${y}`}
                          fill="none" stroke="white" strokeOpacity={0.9}
                          strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            );
            return;
        }

        const nearestChildLeft = Math.min(...kids.map(c=>c.x));
        const centerGapX = A.x + NODE_SIZE + (H_GAP - NODE_SIZE)/2;
        const railMin = A.x + NODE_SIZE + 8;
        const railMax = nearestChildLeft - 12;
        const railX = Math.max(railMin, Math.min(centerGapX, railMax));

        const childCYs = kids.map(c=>cy.get(c.id)!);
        const topY = Math.min(...childCYs);
        const botY = Math.max(...childCYs);

        const alignedY = childCYs.find(y => Math.abs(y - parentCY) <= EPS);
        const yParentToRail = alignedY ?? parentCY;

        lines.push(
            <polyline key={`pr-${pid}-${k++}`}
                      points={`${parentRightX},${yParentToRail} ${railX},${yParentToRail}`}
                      fill="none" stroke="white" strokeOpacity={0.9}
                      strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        );
        lines.push(
            <polyline key={`rv-${pid}-${k++}`}
                      points={`${railX},${topY} ${railX},${botY}`}
                      fill="none" stroke="white" strokeOpacity={0.9}
                      strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        );

        kids.forEach(B => {
            const cY = cy.get(B.id)!;
            const y = Math.abs(cY - parentCY) <= EPS ? yParentToRail : cY;
            lines.push(
                <polyline key={`rh-${pid}-${B.id}-${k++}`}
                          points={`${railX},${y} ${B.x},${y}`}
                          fill="none" stroke="white" strokeOpacity={0.9}
                          strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            );
        });
    });

    return (
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {lines}
        </svg>
    );
}
