import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[13px] font-medium text-amber-400 whitespace-nowrap"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Offline Mode — Local library active</span>
    </div>
  );
};
