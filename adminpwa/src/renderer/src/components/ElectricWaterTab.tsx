import React, { useState } from 'react'
import { ElectricWaterOverview } from './ElectricWaterOverview'
import { ElectricWaterDetail } from './ElectricWaterDetail'

export const ElectricWaterTab: React.FC = () => {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {selectedRoomId ? (
        <ElectricWaterDetail 
          roomId={selectedRoomId} 
          onBack={() => setSelectedRoomId(null)} 
        />
      ) : (
        <ElectricWaterOverview 
          onSelectRoom={setSelectedRoomId} 
        />
      )}
    </div>
  )
}
