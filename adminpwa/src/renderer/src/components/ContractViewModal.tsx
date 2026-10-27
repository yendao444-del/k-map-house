import React, { useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import type { Contract, Room, AppSettings } from '../lib/db'
import { ContractPrintTemplate } from './ContractPrintTemplate'

interface ContractViewModalProps {
    contract: Contract
    room: Room
    settings: AppSettings
    onClose: () => void
}

export const ContractViewModal: React.FC<ContractViewModalProps> = ({
    contract,
    room,
    settings,
    onClose
}) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadMsg, setDownloadMsg] = useState('')

    const handlePrint = useReactToPrint({
        contentRef,
        documentTitle: `HopDong_${room.name}_${contract.tenant_name}`.replace(/\s+/g, '_')
    })

    const handleDownloadPDF = async () => {
        setDownloading(true)
        setDownloadMsg('')
        try {
            const html = contentRef.current?.innerHTML || ''
            const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hợp đồng thuê phòng</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; color: #111; background: white; }
    @page { size: A4; margin: 20mm; }
  </style>
</head>
<body>${html}</body>
</html>`

            const result = await (window as any).api?.contract?.savePDF({
                html: fullHtml,
                fileName: `HopDong_${room.name}_${contract.tenant_name}.pdf`.replace(/\s+/g, '_')
            })

            if (result?.ok) {
                setDownloadMsg('✅ Đã lưu PDF thành công!')
            } else if (result?.canceled) {
                setDownloadMsg('')
            } else {
                setDownloadMsg(`❌ ${result?.error || 'Lỗi không xác định'}`)
            }
        } catch {
            setDownloadMsg('❌ Không thể tải PDF, vui lòng dùng chức năng In.')
        } finally {
            setDownloading(false)
            setTimeout(() => setDownloadMsg(''), 4000)
        }
    }

    return (
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm flex flex-col z-[200] pt-10">
            {/* Header bar */}
            <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0 shadow-lg relative">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <i className="fa-solid fa-file-contract text-primary"></i>
                    </div>
                    <div>
                        <div className="text-white font-bold text-sm">Hợp đồng — {room.name}</div>
                        <div className="text-gray-400 text-xs">{contract.tenant_name}</div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {downloadMsg && (
                        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${downloadMsg.startsWith('✅') ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/60 text-red-300'}`}>
                            {downloadMsg}
                        </span>
                    )}

                    {/* Tải PDF */}
                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:opacity-60 shadow-lg shadow-blue-500/20"
                    >
                        {downloading
                            ? <><i className="fa-solid fa-spinner animate-spin text-xs"></i> Đang tạo...</>
                            : <><i className="fa-solid fa-file-pdf"></i> Tải PDF</>
                        }
                    </button>

                    {/* In */}
                    <button
                        onClick={() => handlePrint()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shadow-lg shadow-emerald-500/20"
                    >
                        <i className="fa-solid fa-print"></i> In máy
                    </button>

                    {/* Đóng */}
                    <div className="w-px h-6 bg-gray-700 mx-1"></div>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 hover:text-white text-gray-300 text-sm font-bold transition-colors"
                    >
                        <i className="fa-solid fa-xmark"></i> Đóng lại
                    </button>
                </div>
            </div>

            {/* A4 Scroll area */}
            <div className="flex-1 overflow-y-auto bg-gray-800/50 py-10 px-4 text-black">
                <div
                    ref={contentRef}
                    className="bg-white shadow-[0_0_40px_rgba(0,0,0,0.3)] mx-auto shrink-0 relative"
                    style={{
                        width: '794px',
                        minHeight: '1123px',
                        padding: '60px 80px',
                        boxSizing: 'border-box',
                        fontFamily: "'Times New Roman', Times, serif"
                    }}
                >
                    <ContractPrintTemplate
                        contract={contract}
                        room={room}
                        settings={settings}
                    />
                </div>
            </div>
        </div>
    )
}
