'use client';
import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** O QR de um endereço, desenhado em SVG no navegador (nada sai para serviço de fora). Correção de erro M:
 * aguenta etiqueta suja ou arranhada no canteiro sem crescer demais. */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const { count, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { count: n, path: d };
  }, [value]);
  const margin = 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-margin} ${-margin} ${count + margin * 2} ${count + margin * 2}`}
      shapeRendering="crispEdges"
    >
      <rect x={-margin} y={-margin} width={count + margin * 2} height={count + margin * 2} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
