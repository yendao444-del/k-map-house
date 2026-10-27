import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTenantIdentityPhotos } from './TenantIdentityPreview';

type Props = { source?: string; identityNumber?: string; tenantName?: string; compact?: boolean; tenantId?: string; onStatus?: (id: string, source: string | undefined, incomplete: boolean) => void };

export function maskTenantIdentity(value?: string) {
  const number = value?.trim() || '';
  return number.length > 6 ? `${number.slice(0, 3)}•••••${number.slice(-3)}` : number;
}

function supportsDesktopHover() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: hover)').matches;
}

export function fitTenantIdentityImage(image: { width: number; height: number }, viewport: { width: number; height: number }) {
  if (!image.width || !image.height || !viewport.width || !viewport.height) return { width: 0, height: 0 };
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function wheelTenantIdentityScale(scale: number, deltaY: number) {
  return Math.min(3, Math.max(1, scale * Math.exp(-Math.max(-100, Math.min(100, deltaY)) / 250)));
}

export function getTenantHoverPreviewLayout(rect: { left: number; top: number; width: number; bottom: number }, viewportWidth: number, viewportHeight: number) {
  const gap = 14;
  const width = Math.min(520, Math.max(1, viewportWidth - 16), Math.max(1, viewportHeight - 70) * 1.58 + 26);
  const imageHeight = Math.max(1, Math.floor((width - 26) / 1.58));
  const height = imageHeight + 54;
  const maxLeft = Math.max(8, viewportWidth - width - 8);
  const maxTop = Math.max(8, viewportHeight - height - 8);
  let left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), maxLeft);
  let top = rect.top - height - gap;
  if (top < 8) {
    if (rect.bottom + gap + height <= viewportHeight - 8) top = rect.bottom + gap;
    else {
      if (rect.left + rect.width + gap + width <= viewportWidth - 8) left = rect.left + rect.width + gap;
      else if (rect.left - gap - width >= 8) left = rect.left - gap - width;
      top = (rect.top + rect.bottom - height) / 2;
    }
  }
  return { left, top: Math.min(Math.max(8, top), maxTop), width, imageHeight };
}

export function TenantIdentityListCell({ source, identityNumber, tenantName, compact = false, tenantId, onStatus }: Props) {
  const { photos, loading } = useTenantIdentityPhotos(source);
  const [zoom, setZoom] = useState<'front' | 'back' | null>(null);
  const [hoverPreview, setHoverPreview] = useState<({ side: 'front' | 'back' } & ReturnType<typeof getTenantHoverPreviewLayout>) | null>(null);
  const [scale, setScale] = useState(1);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const zoomAnchorRef = useRef<{ x: number; y: number; imageX: number; imageY: number } | null>(null);
  const fitted = fitTenantIdentityImage(imageSize, viewportSize);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const hasNumber = Boolean(identityNumber?.trim());
  const isElectronViewer = typeof window !== 'undefined' && 'electron' in window;
  const complete = Boolean(photos.front && photos.back && hasNumber);
  const status = photos.error ? 'Không tải được ảnh' : photos.front && photos.back ? hasNumber ? 'Đủ 2 ảnh' : 'Có 2 ảnh · thiếu số' : photos.front ? 'Thiếu mặt sau' : hasNumber ? 'Thiếu ảnh CCCD' : 'Chưa có CCCD';

  useEffect(() => { setZoom(null); setScale(1); setHoverPreview(null); }, [source]);
  useEffect(() => {
    if (!loading && tenantId) onStatus?.(tenantId, source, !complete);
  }, [loading, tenantId, source, complete, onStatus]);
  useEffect(() => {
    if (!hoverPreview) return;
    const dismiss = () => setHoverPreview(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, [hoverPreview]);
  useEffect(() => {
    if (!zoom) return;
    const previousFocus = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [zoom]);

  useEffect(() => {
    if (!zoom || !stageRef.current) return;
    const stage = stageRef.current;
    const measure = () => setViewportSize({ width: stage.clientWidth, height: stage.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [zoom]);

  const changeScale = (nextScale: number, x?: number, y?: number) => {
    const stage = stageRef.current;
    const previous = scaleRef.current;
    const next = Math.max(1, Math.min(3, nextScale));
    if (stage && fitted.width && fitted.height) {
      const pointerX = x ?? stage.clientWidth / 2;
      const pointerY = y ?? stage.clientHeight / 2;
      const oldWidth = fitted.width * previous;
      const oldHeight = fitted.height * previous;
      zoomAnchorRef.current = {
        x: pointerX, y: pointerY,
        imageX: (stage.scrollLeft + pointerX - Math.max(0, (stage.clientWidth - oldWidth) / 2)) / oldWidth,
        imageY: (stage.scrollTop + pointerY - Math.max(0, (stage.clientHeight - oldHeight) / 2)) / oldHeight,
      };
    }
    scaleRef.current = next;
    setScale(next);
  };

  useEffect(() => {
    if (!zoom || !stageRef.current) return;
    const stage = stageRef.current;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = stage.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      changeScale(wheelTenantIdentityScale(scaleRef.current, delta), event.clientX - rect.left, event.clientY - rect.top);
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage.removeEventListener('wheel', wheel);
  }, [zoom, fitted.width, fitted.height]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const anchor = zoomAnchorRef.current;
    if (!stage || !anchor) return;
    const width = fitted.width * scale;
    const height = fitted.height * scale;
    stage.scrollLeft = Math.max(0, (stage.clientWidth - width) / 2) + anchor.imageX * width - anchor.x;
    stage.scrollTop = Math.max(0, (stage.clientHeight - height) / 2) + anchor.imageY * height - anchor.y;
    zoomAnchorRef.current = null;
  }, [scale, fitted.width, fitted.height]);

  const open = (side: 'front' | 'back', button: HTMLButtonElement) => { triggerRef.current = button; scaleRef.current = 1; zoomAnchorRef.current = null; setScale(1); setImageSize({ width: 0, height: 0 }); setZoom(side); };
  const showHoverPreview = (side: 'front' | 'back', element: HTMLButtonElement) => {
    if (!photos[side] || !supportsDesktopHover()) return;
    const rect = element.getBoundingClientRect();
    setHoverPreview({ side, ...getTenantHoverPreviewLayout(rect, window.innerWidth, window.innerHeight) });
  };

  return (
    <div className="tenant-identity-cell flex min-w-0 flex-wrap items-center gap-2.5 md:flex-nowrap" data-identity-status={loading ? 'loading' : status}>
      {source && <div className="flex shrink-0 items-start gap-1.5">
        {(['front', 'back'] as const).map(side => <div key={side} className="shrink-0">
          <button type="button" disabled={!photos[side]} aria-label={`Phóng to ảnh CCCD ${side === 'front' ? 'mặt trước' : 'mặt sau'}${tenantName ? ` của ${tenantName}` : ''}`} onMouseEnter={event => showHoverPreview(side, event.currentTarget)} onMouseLeave={() => setHoverPreview(null)} onClick={event => { event.stopPropagation(); setHoverPreview(null); if (photos[side]) open(side, event.currentTarget); }} className={`${compact ? 'h-10 w-[62px]' : 'h-11 w-[68px]'} group/photo relative flex items-center justify-center overflow-hidden rounded-md border bg-slate-50 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${photos[side] ? 'cursor-zoom-in border-slate-200 hover:border-emerald-400' : 'border-dashed border-slate-200'} disabled:cursor-default`}>
            {photos[side] ? <img src={photos[side]} alt={`CCCD ${side === 'front' ? 'mặt trước' : 'mặt sau'}`} className="h-full w-full object-contain" /> : <i className="fa-regular fa-image text-base text-slate-300" aria-hidden="true" />}
            {photos[side] && <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/35 text-white opacity-0 transition group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"><i className="fa-solid fa-magnifying-glass-plus text-xs" aria-hidden="true" /></span>}
          </button>
          <div className="mt-1 text-center text-[10px] leading-tight text-slate-500">{side === 'front' ? 'Mặt trước' : 'Mặt sau'}</div>
        </div>)}
      </div>}
      {hoverPreview && photos[hoverPreview.side] && createPortal(
        <div aria-hidden="true" className="pointer-events-none fixed z-[290] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-emerald-100 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.28)] ring-1 ring-black/5" style={{ left: hoverPreview.left, top: hoverPreview.top, width: hoverPreview.width }}>
          <div className="flex items-center justify-between gap-2 px-1 pb-3 text-xs font-semibold text-slate-600"><span className="flex items-center gap-1.5 text-emerald-700"><i className="fa-solid fa-magnifying-glass-plus" aria-hidden="true" /> CCCD · {hoverPreview.side === 'front' ? 'Mặt trước' : 'Mặt sau'}</span><span className="font-normal text-slate-400">Xem nhanh</span></div>
          <div className="flex items-center justify-center overflow-hidden rounded-xl bg-slate-50" style={{ height: hoverPreview.imageHeight }}><img src={photos[hoverPreview.side]} alt="" className="max-h-full w-full object-contain" /></div>
        </div>, document.body
      )}
      <div className="min-w-0">
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${loading ? 'text-slate-500' : complete ? 'text-emerald-700' : 'text-amber-700'}`}>
        <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : complete ? 'fa-circle-check' : source || hasNumber ? 'fa-circle-exclamation' : 'fa-id-card'}`} aria-hidden="true" />
        <span>{loading ? 'Đang tải ảnh…' : status}</span>
      </div>
      {hasNumber && <div className="mt-1 text-[11px] tabular-nums text-slate-500">{maskTenantIdentity(identityNumber)}</div>}
      </div>
      {zoom && photos[zoom] && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-[300] bg-white" style={{ top: isElectronViewer ? '40px' : 0 }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Ảnh CCCD ${zoom === 'front' ? 'mặt trước' : 'mặt sau'}`} className="flex h-full w-full flex-col overflow-hidden bg-white" onClick={event => event.stopPropagation()} onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); setZoom(null); }
            if (event.key === 'Tab') {
              const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
              const first = controls[0]; const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            }
          }}>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0"><h3 className="text-sm font-semibold text-slate-800">CCCD · {zoom === 'front' ? 'Mặt trước' : 'Mặt sau'}</h3><p className="mt-0.5 truncate text-xs text-slate-500">{tenantName}{imageSize.width > 0 && `${tenantName ? ' · ' : ''}${imageSize.height > imageSize.width ? 'Ảnh dọc' : 'Ảnh ngang'}`}</p></div>
              <button type="button" aria-label="Đóng ảnh phóng to" onClick={() => setZoom(null)} className="app-no-drag flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"><i className="fa-solid fa-xmark" aria-hidden="true" /><span>Đóng</span></button>
            </div>
            <div ref={stageRef} className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-50" onClick={event => {
              if (event.target === event.currentTarget || event.target === event.currentTarget.firstElementChild) { event.stopPropagation(); setZoom(null); }
            }} data-identity-orientation={imageSize.width ? imageSize.height > imageSize.width ? 'portrait' : 'landscape' : 'loading'}>
              <div className="flex items-center justify-center" style={{ width: Math.max(viewportSize.width, fitted.width * scale), height: Math.max(viewportSize.height, fitted.height * scale) }}>
                <img src={photos[zoom]} alt={`CCCD ${zoom === 'front' ? 'mặt trước' : 'mặt sau'} phóng to`} onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} draggable={false} className="block shrink-0 object-contain" style={{ width: fitted.width * scale || undefined, height: fitted.height * scale || undefined, visibility: fitted.width ? 'visible' : 'hidden' }} />
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-100 px-3 py-2">
              <span className="hidden text-xs text-slate-400 sm:block">Lăn chuột để zoom</span>
              <button type="button" aria-label="Thu nhỏ ảnh" disabled={scale <= 1} onClick={() => changeScale(Math.max(1, scale - 0.5))} className="h-10 w-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"><i className="fa-solid fa-minus" aria-hidden="true" /></button>
              <button type="button" onClick={() => changeScale(1)} className="h-10 rounded-lg px-3 text-xs font-semibold tabular-nums text-slate-600 hover:bg-slate-50">{Math.round(scale * 100)}% · Vừa khung</button>
              <button type="button" aria-label="Phóng to thêm" disabled={scale >= 3} onClick={() => changeScale(Math.min(3, scale + 0.5))} className="h-10 w-10 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-35"><i className="fa-solid fa-plus" aria-hidden="true" /></button>
              <button type="button" aria-label="Đóng trình xem ảnh" onClick={() => setZoom(null)} className="app-no-drag h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">Đóng</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
