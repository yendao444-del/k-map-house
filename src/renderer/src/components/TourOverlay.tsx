import { useEffect, useState } from 'react'

type TourData = {
  type: string
  target: HTMLElement
  text: string
}

export const TourOverlay = () => {
  const [tourData, setTourData] = useState<TourData | null>(null)

  useEffect(() => {
    const startTour = (event: Event) => {
      const type = (event as CustomEvent).detail

      const checkAndSet = (retries = 0) => {
        const selector =
          type === 'create_tenant'
            ? '[data-tour="add-tenant-btn"]'
            : type === 'create_tenant_step2'
              ? '[data-tour="tenant-submit-btn"]'
              : type === 'add_asset'
                ? '[data-tour="add-asset-btn"]'
                : type === 'add_asset_step2'
                  ? '[data-tour="save-asset-btn"]'
                  : type === 'move_in_asset'
                    ? '[data-tour="move-in-btn"]'
                    : type === 'move_out_asset'
                      ? '[data-tour="move-out-btn"]'
                      : ''

        if (!selector) return

        const target = document.querySelector(selector) as HTMLElement | null
        if (!target) {
          if (retries < 10) {
            setTimeout(() => checkAndSet(retries + 1), 100)
          }
          return
        }

        setTourData({
          type,
          target,
          text:
            type === 'create_tenant'
              ? 'Bước 1/2: Bấm vào đây để mở Form tạo hồ sơ khách'
              : type === 'create_tenant_step2'
                ? 'Bước 2/2: Điền thông tin khách thuê và bấm Lưu lại'
                : type === 'add_asset'
                  ? 'Bước 1/2: Bấm vào đây để thêm tài sản mới vào kho'
                  : type === 'add_asset_step2'
                    ? 'Bước 2/2: Nhập tên tài sản và Lưu'
                    : type === 'move_in_asset'
                      ? 'Bấm vào đây để kiểm tra lại tài sản sẵn có và chốt nhận phòng'
                      : 'Bấm vào đây để mở Đối chiếu trả phòng cho phòng này',
        })
      }

      checkAndSet()
    }

    const clearTour = () => setTourData(null)

    window.addEventListener('start-tour', startTour)
    document.addEventListener('keydown', clearTour)

    return () => {
      window.removeEventListener('start-tour', startTour)
      document.removeEventListener('keydown', clearTour)
    }
  }, [])

  if (!tourData) return null

  const rect = tourData.target.getBoundingClientRect()

  const isNearRightMargin = window.innerWidth - rect.right < 150

  const popoverStyle: React.CSSProperties = isNearRightMargin
    ? { right: 0 }
    : { left: '50%', transform: 'translateX(-50%)' }

  const arrowStyle: React.CSSProperties = isNearRightMargin
    ? { right: (rect.width + 12) / 2 - 6 }
    : { left: '50%', transform: 'translateX(-50%)' }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-[2px] animate-[fadeIn_0.2s]" />

      <button
        type="button"
        className="absolute rounded-xl border-2 border-orange-500 bg-transparent shadow-[0_0_0_9999px_rgba(17,24,39,0.7),0_0_24px_rgba(249,115,22,0.75)] animate-pulse pointer-events-auto cursor-pointer"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
        }}
        onClick={() => {
          tourData.target.click()
          const currentType = tourData.type;
          setTourData(null)

          if (currentType === 'create_tenant') {
            window.dispatchEvent(new CustomEvent('start-tour', { detail: 'create_tenant_step2' }))
          } else if (currentType === 'add_asset') {
            window.dispatchEvent(new CustomEvent('start-tour', { detail: 'add_asset_step2' }))
          }
        }}
        aria-label={tourData.text}
      >
        <span
          className="absolute top-full mt-3 w-max max-w-[280px] rounded-xl border-2 border-orange-400 bg-white px-4 py-3 text-left text-[13px] font-bold leading-snug text-gray-800 shadow-2xl"
          style={popoverStyle}
        >
          <span
            className="absolute -top-2 h-3 w-3 rotate-45 border-l-2 border-t-2 border-orange-400 bg-white"
            style={arrowStyle}
          />
          <span className="relative z-10 flex items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100">
              <i className="fa-solid fa-hand-pointer text-xs text-orange-500"></i>
            </span>
            <span className="mt-0.5">{tourData.text}</span>
          </span>
        </span>
      </button>
    </div>
  )
}
