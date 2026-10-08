import { useEffect, useRef, useState } from 'react';

type IdentityPhotos = { front?: string; back?: string; error?: boolean };

// Existing profiles keep both photos in one image. Only infer a split when the
// image is clearly a two-card strip or has a strong seam near its midpoint.
function isJoinedImage(image: HTMLImageElement): boolean {
  const ratio = image.naturalWidth / image.naturalHeight;
  if (ratio >= 2.4) return true;
  if (ratio < 1.1 || ratio > 2) return false;
  const sample = document.createElement('canvas');
  sample.width = 160;
  sample.height = 100;
  const context = sample.getContext('2d');
  if (!context) return false;
  context.drawImage(image, 0, 0, 160, 100);
  const pixels = context.getImageData(0, 0, 160, 100).data;
  const differences = Array.from({ length: 159 }, (_, x) => {
    let difference = 0;
    for (let y = 5; y < 95; y++) {
      const index = (y * 160 + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        difference += Math.abs(pixels[index + channel] - pixels[index + 4 + channel]);
      }
    }
    return difference / 270;
  });
  const average = differences.reduce((sum, value) => sum + value, 0) / differences.length;
  return Math.max(...differences.slice(77, 82)) > Math.max(18, average * 3);
}

export function TenantIdentityPreview({ source }: { source?: string }) {
  const [splitOverride, setSplitOverride] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<IdentityPhotos>({});
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState<'front' | 'back' | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { setSplitOverride(null); setZoom(null); }, [source]);

  useEffect(() => {
    setPhotos({});
    if (!source) return;
    let cancelled = false;
    setLoading(true);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        if (splitOverride ?? isJoinedImage(image)) {
          const half = Math.floor(image.naturalWidth / 2);
          const crop = (start: number, width: number) => {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas unavailable');
            context.drawImage(image, start, 0, width, image.naturalHeight, 0, 0, width, image.naturalHeight);
            return canvas.toDataURL('image/png');
          };
          setPhotos({ front: crop(0, half), back: crop(half, image.naturalWidth - half) });
        } else setPhotos({ front: source });
      } catch {
        // Remote/CORS-restricted images remain viewable without canvas cropping.
        setPhotos({ front: source });
      }
      setLoading(false);
    };
    image.onerror = () => { if (!cancelled) { setPhotos({ error: true }); setLoading(false); } };
    image.src = source;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [source, splitOverride]);

  useEffect(() => {
    if (!zoom) return;
    const previousFocus = triggerRef.current;
    viewerRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previousFocus?.focus();
  }, [zoom]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {(['front', 'back'] as const).map(side => (
          <div key={side}>
            <div className="mb-2 flex items-center justify-between gap-1">
              <span className="text-sm font-medium text-slate-500">{side === 'front' ? 'Mặt trước' : 'Mặt sau'}</span>
              <button type="button" disabled={!photos[side]} aria-label={`Phóng to ${side === 'front' ? 'mặt trước' : 'mặt sau'}`} onClick={event => { triggerRef.current = event.currentTarget; setZoom(side); }} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#dce9e8] bg-white text-xs text-slate-500 transition hover:border-emerald-400 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-30">
                <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true" />
              </button>
            </div>
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-[#dce9e8] bg-slate-100/60 p-1.5">
              {photos[side] ? <img src={photos[side]} alt={`Giấy tờ định danh — ${side === 'front' ? 'mặt trước' : 'mặt sau'}`} className="h-full w-full object-contain" /> : <div className="px-2 text-center text-xs text-slate-400"><i className="fa-regular fa-image mb-2 block text-xl" aria-hidden="true" /><span>{loading ? 'Đang tải ảnh…' : photos.error ? 'Không tải được ảnh' : 'Chưa có ảnh'}</span></div>}
            </div>
          </div>
        ))}
      </div>
      {source && !loading && !photos.error && <button type="button" onClick={() => setSplitOverride(!photos.back)} className="mt-2 text-[11px] text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">{photos.back ? 'Xem ảnh gốc' : 'Tách ảnh ghép hai mặt'}</button>}
      {zoom && photos[zoom] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={event => { event.stopPropagation(); setZoom(null); }}>
          <div ref={viewerRef} role="dialog" aria-modal="true" aria-label={`Ảnh ${zoom === 'front' ? 'mặt trước' : 'mặt sau'}`} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setZoom(null); } if (event.key === 'Tab') { event.stopPropagation(); event.preventDefault(); viewerRef.current?.querySelector('button')?.focus(); } }} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3"><h3 className="font-semibold text-slate-800">Giấy tờ định danh · {zoom === 'front' ? 'Mặt trước' : 'Mặt sau'}</h3><button type="button" aria-label="Đóng ảnh phóng to" onClick={() => setZoom(null)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>
            <div className="min-h-0 overflow-auto bg-slate-50 p-3"><img src={photos[zoom]} alt={`Giấy tờ định danh — ${zoom === 'front' ? 'mặt trước' : 'mặt sau'}`} className="mx-auto max-h-[78vh] max-w-full object-contain" /></div>
          </div>
        </div>
      )}
    </>
  );
}
