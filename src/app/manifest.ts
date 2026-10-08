import type { MetadataRoute } from 'next';

/** Deixa o sistema virar um atalho na tela inicial do celular, com nome e cor próprios. Não há
 * modo offline: as telas precisam do servidor. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Obra 360 · ATR',
    short_name: 'Obra 360',
    description: 'Gestão de projetos e obras da ATR Incorporadora.',
    start_url: '/obras',
    display: 'standalone',
    background_color: '#f4f7f9',
    theme_color: '#0a364d',
    lang: 'pt-BR',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
