export type Room = {
  id: number;
  name: string;
  pricePerHour: number;
  startTime: Date | null;
  startTimeRecordedAt: Date | null;
  endTime: Date | null;
  elapsedMs: number;
  isRunning: boolean;
  totalPrice: number;
};

export type HistoryEntry = {
  id: string;
  roomId: number;
  roomName: string;
  start: string;
  end: string;
  durationMs: number;
  priceAmd: number;
  pricePerHourAmd: number;
  createdAt?: string;
};

export type PendingStop = {
  roomId: number;
  roomName: string;
  startTime: Date;
  endTime: Date;
  elapsedMs: number;
  basePrice: number;
  pricePerHour: number;
  manualPrice: number;
};

export const formatDuration = (ms: number) => {
  if (ms <= 0 || Number.isNaN(ms)) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

export const formatDateTime = (value: Date | null) =>
  value ? value.toLocaleString() : "—";

