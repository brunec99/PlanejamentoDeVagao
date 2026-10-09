import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Ícone para a tela inicial do iPhone, gerado no build a partir do mesmo desenho do icon.svg. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        background: 'linear-gradient(135deg, #135a82 0%, #0a364d 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="150" height="150" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.5 19.5a11.5 4.5 0 0 1 23 0" stroke="#8cc6e4" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="11" y="6" width="10" height="17" rx="1" fill="#fff" />
        <path d="M13 9h2v2h-2zM17 9h2v2h-2zM13 13h2v2h-2zM17 13h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2z" fill="#0e4666" />
        <path d="M27.5 19.5a11.5 4.5 0 0 1-21.2 2.4" stroke="#fbbf24" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M4.3 19.6l2.6 3.9 1.6-3.6z" fill="#fbbf24" />
      </svg>
    </div>,
    size,
  );
}
