import React, { useState, useRef, useEffect } from 'react'

const formatNumberInput = (rawValue: string) => {
  const digits = rawValue.replace(/\D/g, '')
  if (!digits) return ''
  return new Intl.NumberFormat('vi-VN').format(Number(digits))
}

interface EditableCellProps {
  value: string | number
  displayValue?: string // Giá trị hiển thị (ví dụ: "2.700.000 đ")
  type?: 'text' | 'number' | 'select' | 'date'
  options?: { value: string; label: string }[] // Cho type=select
  suffix?: string
  prefix?: string
  className?: string
  onSave: (newValue: string | number) => void
}

export function EditableCell({
  value,
  displayValue,
  type = 'text',
  options,
  suffix = '',
  prefix = '',
  className = '',
  onSave
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value))
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  const normalizeValue = (rawValue: string) => {
    if (type === 'number' || type === 'select') {
      return Number(String(rawValue).replace(/\D/g, '')) || 0
    }
    return rawValue
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select()
      }
    }
  }, [isEditing])

  const handleSave = () => {
    setIsEditing(false)
    const newVal = normalizeValue(editValue)
    const originalVal = normalizeValue(String(value))
    if (newVal !== originalVal) {
      onSave(newVal)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setEditValue(type === 'number' ? formatNumberInput(String(value)) : String(value))
      setIsEditing(false)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(type === 'number' ? formatNumberInput(String(value)) : String(value))
    setIsEditing(true)
  }

  return (
    <div className="relative inline-block w-full">
      {/* Khung cố định giữ không gian gốc của table cell */}
      <div
        onClick={!isEditing ? handleClick : undefined}
        className={`rounded px-2 py-1 border border-transparent flex items-center min-h-[30px] w-full ${!isEditing ? 'cursor-pointer hover:border-primary/30 hover:bg-primary/5 transition duration-150 group/cell' : 'opacity-0 pointer-events-none'} ${className}`}
        title={!isEditing ? "Click để sửa" : ""}
      >
        <span className="truncate">{prefix}{prefix ? ' ' : ''}{displayValue || value}{suffix ? ' ' : ''}{suffix}</span>
        <i className="fa-solid fa-pen text-[8px] text-primary/0 group-hover/cell:text-primary/40 transition-all duration-150 ml-1 flex-shrink-0"></i>
      </div>

      {/* Khung ô nhập liệu phủ lên trên */}
      {isEditing && (
        <div className="absolute inset-0">
          {type === 'select' && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => {
                setEditValue(e.target.value)
                const newVal = normalizeValue(e.target.value)
                const originalVal = normalizeValue(String(value))
                setIsEditing(false)
                if (newVal !== originalVal) {
                  onSave(newVal)
                }
              }}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-full bg-white border border-primary rounded px-2 py-1 text-sm outline-none shadow-sm animate-[fadeIn_0.05s_ease-out]"
            >
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type === 'date' ? 'date' : 'text'}
              value={editValue}
              onChange={(e) => setEditValue(type === 'number' ? formatNumberInput(e.target.value) : e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-full bg-white border border-primary rounded px-2 py-1 text-sm outline-none shadow-sm animate-[fadeIn_0.05s_ease-out]"
            />
          )}
        </div>
      )}
    </div>
  )
}
