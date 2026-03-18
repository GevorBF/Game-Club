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
  paidByCard?: boolean;
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
  /** True when the session had an end time set on the main screen (e.g. via "Set start time"). */
  hadScheduledEndTime?: boolean;
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

export const formatTimeOnly = (value: Date | null) =>
  value ? value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

/** Date and time with month (e.g. "14 Mar 15:30") */
export const formatDateTimeWithMonthAndWeek = (value: Date | null) => {
  if (!value) return "—";
  const day = value.getDate();
  const month = value.toLocaleString("en", { month: "short" });
  const time = value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month} ${time}`;
};

