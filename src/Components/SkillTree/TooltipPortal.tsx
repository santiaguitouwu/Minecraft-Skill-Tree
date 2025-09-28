import { createPortal } from 'react-dom';

type Props = {
    left: number; top: number; title: string; description: string;
    width?: number;
};

export default function TooltipPortal({ left, top, title, description, width = 240 }: Props) {
    return createPortal(
        <div
            style={{
                position: 'fixed', left, top, width,
                borderRadius: 6, overflow: 'hidden',
                border: '2px solid rgba(0,0,0,0.65)', boxShadow: '3px 3px 0 rgba(0,0,0,0.9)',
                background: '#0f0f0f', pointerEvents: 'none', zIndex: 9999,
            }}
        >
            <div
                style={{
                    background: 'linear-gradient(180deg, #078bb5 0%, #045a7a 100%)',
                    color: '#fff', fontWeight: 800, padding: '8px 10px',
                    borderBottom: '2px solid rgba(0,0,0,0.45)', letterSpacing: '0.2px',
                    textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                }}
            >
                {title}
            </div>
            <div style={{ padding: 10, background: '#101010', color: '#39ff4a', fontSize: 14, lineHeight: 1.25, textShadow: '0 1px 0 rgba(0,0,0,0.6)' }}>
                {description}
            </div>
        </div>,
        document.body
    );
}
