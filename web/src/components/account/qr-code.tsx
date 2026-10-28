import qrcode from "qrcode-generator";

/**
 * Code QR en SVG, dessiné par React (aucun HTML injecté). Généré dans le navigateur : l'URI de configuration, qui
 * contient le secret, ne quitte jamais la page.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const quiet = 4;
  const size = count + quiet * 2;
  const cells: string[] = [];
  for (let row = 0; row < count; row++) {
    let run = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && run < 0) run = col;
      if (!dark && run >= 0) {
        cells.push(
          `M${run + quiet} ${row + quiet}h${col - run}v1h-${col - run}z`,
        );
        run = -1;
      }
    }
  }
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      className="h-56 w-56 rounded-md border border-line-strong"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}
