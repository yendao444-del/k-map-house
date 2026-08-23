import { useEffect, useMemo, useState } from 'react'

type ListingThumbnailProps = {
  imageUrl?: string | null
  title: string
  href?: string
}

const supportedImageUrl = (value?: string | null) => {
  const url = value?.trim() || ''
  return /^(https?:|data:|blob:)/i.test(url) ? url : ''
}

export function ListingThumbnail({ imageUrl, title, href }: ListingThumbnailProps) {
  const source = useMemo(() => supportedImageUrl(imageUrl), [imageUrl])
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [source])

  const thumbnail = (
    <span className="flex h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
      {source && !failed ? (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center text-slate-300"
          title="Tin đăng chưa có hình ảnh"
        >
          <i className="fa-regular fa-image text-lg" />
        </span>
      )}
    </span>
  )

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Mở tin đăng: ${title}`}
      className="rounded-lg outline-none ring-emerald-500 focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {thumbnail}
    </a>
  ) : (
    thumbnail
  )
}
