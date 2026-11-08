import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Ícone para a tela inicial do iPhone, gerado no build a partir do mesmo desenho do icon.svg: o "T" da
 * logo da Takt em branco sobre o azul da marca. O iOS arredonda os cantos sozinho, então o fundo é cheio. */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: 180,
        height: 180,
        background: '#0a364d',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="150" height="150" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
        <path
          fill="#fff"
          d="M325.5 100L345.3 100L345.3 900L325.5 900ZM112.2 176.2L887.8 176.2L887.8 196L112.2 196ZM250.1 218.2L883 218.2L883 230.5L250.1 230.5ZM113.8 254.3L472.5 254.3L345.3 399L345.3 422.7L113.8 422.7ZM569.6 254.3L884.7 254.3L736.7 422.7L589.4 422.7L589.4 646.6L414 843.1L414 431.3ZM589.4 754.1L589.4 900L461.3 900Z"
        />
      </svg>
    </div>,
    size,
  );
}
