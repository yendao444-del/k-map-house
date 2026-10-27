type Props = { phone?: string; email?: string };

export function TenantContactCell({ phone, email }: Props) {
  const contactPhone = phone?.trim();
  const contactEmail = email?.trim();
  return <div className="tenant-contact-cell flex min-w-0 flex-col gap-2 text-sm">
    {contactPhone ? <div className="flex items-center gap-2">
      <a href={`tel:${contactPhone.replace(/[^0-9+]/g, '')}`} onClick={event => event.stopPropagation()} className="flex min-w-0 items-center gap-2 font-medium tabular-nums text-slate-700 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" title="Gọi điện">
        <i className="fa-solid fa-phone shrink-0 text-[12px] text-emerald-600" aria-hidden="true" /><span>{contactPhone}</span>
      </a>
      <a href={`https://zalo.me/${contactPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" title="Nhắn Zalo" aria-label={`Nhắn Zalo ${contactPhone}`} onClick={event => event.stopPropagation()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50">Zalo</a>
    </div> : <div className="flex items-center gap-2 font-medium text-amber-700"><i className="fa-solid fa-phone shrink-0 text-[12px]" aria-hidden="true" />Chưa có SĐT</div>}
    {contactEmail ? <a href={`mailto:${contactEmail}`} onClick={event => event.stopPropagation()} className="flex min-w-0 items-start gap-2 text-slate-500 hover:text-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
      <i className="fa-regular fa-envelope mt-1 shrink-0 text-[12px] text-slate-400" aria-hidden="true" /><span className="min-w-0 break-all leading-5">{contactEmail}</span>
    </a> : <div className="flex items-center gap-2 font-medium text-amber-700"><i className="fa-regular fa-envelope shrink-0 text-[12px]" aria-hidden="true" />Chưa có email</div>}
  </div>;
}
