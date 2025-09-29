import { NODE_SIZE } from './useSkillLayout';

type Props = {
    x: number; y: number; image: string; name: string;
    isCompleted: boolean; isUnlocked: boolean;
    onClick(): void;
    onEnter(): void;
    onLeave(): void;
};

export default function NodeButton({
                                       x, y, image, name, isCompleted, onClick, onEnter, onLeave,}: Props) {
    return (
        <button
            onClick={onClick}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            title={name}
            style={{
                position: 'absolute',
                left: x, top: y,
                width: NODE_SIZE, height: NODE_SIZE,
                border: '3px solid', borderColor: '#000',
                boxShadow: '1px 2px 1px 1px #000',
                background: isCompleted ? 'rgba(172,124,12)' : 'rgba(196,196,196)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <img
                src={image}
                alt={name}
                draggable={false}
                style={{ width: NODE_SIZE - 20, height: NODE_SIZE - 20, objectFit: 'contain', imageRendering: 'pixelated', pointerEvents: 'none' }}
            />
        </button>
    );
}
