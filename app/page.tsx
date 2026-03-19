"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Room, PendingStop, HistoryEntry } from "./types";
import { formatDuration, formatDateTime, formatTimeOnly } from "./types";

const ROOM_NAMES: Record<number, string> = {
  1: "Barc",
  2: "Real",
  3: "VIP",
  4: "Green",
  5: "Blue",
  6: "Euro",
};

const WORKING_DAY_START_HOUR = 6; // 06:00 – same as admin history: "current day" is from 06:00 to next 06:00

const STORAGE_KEYS = {
  vercracList: "gameclub-vercrac-list",
  pahacList: "gameclub-pahac-list",
  hookahRooms: "gameclub-hookah-rooms",
  paidRooms: "gameclub-paid-rooms",
  runningSessions: "gameclub-running-sessions",
} as const;

/** Current working day bounds: if now >= today 06:00 then today 06:00..tomorrow 06:00, else yesterday 06:00..today 06:00 */
function getCurrentWorkingDayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const todayAt6 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WORKING_DAY_START_HOUR, 0, 0, 0);
  if (now >= todayAt6) {
    const dayEnd = new Date(todayAt6.getTime() + 24 * 60 * 60 * 1000);
    return { start: todayAt6, end: dayEnd };
  }
  const dayStart = new Date(todayAt6.getTime() - 24 * 60 * 60 * 1000);
  return { start: dayStart, end: todayAt6 };
}

/** Current working day as YYYY-MM-DD (for per-day Վերցրած/Պահած storage). Before 06:00 = yesterday, from 06:00 = today. */
function getCurrentWorkingDayDateString(): string {
  const now = new Date();
  const todayAt6 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WORKING_DAY_START_HOUR, 0, 0, 0);
  const ref = now < todayAt6 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, "0");
  const d = String(ref.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Cash payment icon – use parent text color (e.g. text-red-500 / text-emerald-600) for paid state */
function CashIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M42.2,31.7a4.6,4.6,0,0,0-4-1.1l-9.9,1.7A4.7,4.7,0,0,0,26.9,29l-7.1-7H5a2,2,0,0,0,0,4H18.2l5.9,5.9a.8.8,0,0,1,0,1.1.9.9,0,0,1-1.2,0l-3.5-3.5a2.1,2.1,0,0,0-2.8,0,2.1,2.1,0,0,0,0,2.9l3.5,3.4a4.5,4.5,0,0,0,3.4,1.4,5.7,5.7,0,0,0,1.8-.3h0l13.6-2.4a1,1,0,0,1,.8.2,1.1,1.1,0,0,1,.3.7,1,1,0,0,1-.8,1L20.6,39.8,9.7,30.9H5a2,2,0,0,0,0,4H8.3L19.4,44l20.5-3.7A4.9,4.9,0,0,0,44,35.4,4.6,4.6,0,0,0,42.2,31.7Z" />
      <path d="M34.3,20.1h0a6.7,6.7,0,0,1-4.1-1.3,2,2,0,0,0-2.8.6,1.8,1.8,0,0,0,.3,2.6A10.9,10.9,0,0,0,32,23.8V26a2,2,0,0,0,4,0V23.8a6.3,6.3,0,0,0,3-1.3,4.9,4.9,0,0,0,2-4h0c0-3.7-3.4-4.9-6.3-5.5s-3.5-1.3-3.5-1.8.2-.6.5-.9a3.4,3.4,0,0,1,1.8-.4,6.3,6.3,0,0,1,3.3.9,1.8,1.8,0,0,0,2.7-.5,1.9,1.9,0,0,0-.4-2.8A9.1,9.1,0,0,0,36,6.3V4a2,2,0,0,0-4,0V6.2c-3,.5-5,2.5-5,5.2s3.3,4.9,6.5,5.5,3.3,1.3,3.3,1.8S35.7,20.1,34.3,20.1Z" />
    </svg>
  );
}

/** Placeholder logo – replace with <img src="/your-logo.svg" alt="Logo" className="h-8 w-8" /> when you have the asset */
function LogoIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="32" height="32" rx="6" fill="rgb(79 70 229)" opacity="0.2" />
      <path
        d="M8 12h4v8H8v-8zm12 0h4v8h-4v-8zm-6-4h4v16h-4V8z"
        fill="rgb(79 70 229)"
      />
    </svg>
  );
}

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>(() =>
    Array.from({ length: 6 }).map((_, idx) => ({
      id: idx + 1,
      name: ROOM_NAMES[idx + 1] || `Room ${idx + 1}`,
      pricePerHour: 20,
      startTime: null,
      startTimeRecordedAt: null,
      endTime: null,
      elapsedMs: 0,
      isRunning: false,
      totalPrice: 0,
    })),
  );
  const [pendingStop, setPendingStop] = useState<PendingStop | null>(null);
  const [manualStartRoom, setManualStartRoom] = useState<number | null>(null);
  const [manualStartTime, setManualStartTime] = useState<string>("");
  const [manualEndTime, setManualEndTime] = useState<string>("");
  const [manualTargetPrice, setManualTargetPrice] = useState<string>("");
  const [hookahClickedRooms, setHookahClickedRooms] = useState<Set<number>>(new Set());
  const [paidRooms, setPaidRooms] = useState<Set<number>>(new Set());
  const [transferFromRoomId, setTransferFromRoomId] = useState<number | null>(null);
  const [editEndTimeRoomId, setEditEndTimeRoomId] = useState<number | null>(null);
  const [editEndTimeValue, setEditEndTimeValue] = useState<string>("");
  const [confirmPriceInput, setConfirmPriceInput] = useState<string>("");
  const [confirmCardSelected, setConfirmCardSelected] = useState(false);
  const [confirmModalEditEndTime, setConfirmModalEditEndTime] = useState(false);
  const [confirmModalEndTimeValue, setConfirmModalEndTimeValue] = useState<string>("");
  const [vercracModalOpen, setVercracModalOpen] = useState(false);
  const [vercracDescription, setVercracDescription] = useState("");
  const [vercracList, setVercracList] = useState<{ id: string; text: string; deleted: boolean }[]>([]);
  const [vercracDeleteIndex, setVercracDeleteIndex] = useState<number | null>(null);
  const [showDeletedVercrac, setShowDeletedVercrac] = useState(true);
  const [pahacModalOpen, setPahacModalOpen] = useState(false);
  const [pahacDescription, setPahacDescription] = useState("");
  const [pahacList, setPahacList] = useState<{ id: string; text: string; deleted: boolean }[]>([]);
  const [pahacDeleteIndex, setPahacDeleteIndex] = useState<number | null>(null);
  const [showDeletedPahac, setShowDeletedPahac] = useState(true);
  const [isAdminRole, setIsAdminRole] = useState(false);
  const router = useRouter();
  const hasLoadedFromStorage = useRef(false);

  const persistHookahRooms = (next: Set<number>) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.hookahRooms, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.warn("Failed to save hookah rooms", e);
    }
  };

  const persistPaidRooms = (next: Set<number>) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.paidRooms, JSON.stringify(Array.from(next)));
    } catch (e) {
      console.warn("Failed to save paid rooms", e);
    }
  };

  type ListItem = { id: string; text: string; deleted: boolean };
  const persistVercracList = (next: ListItem[]) => {
    if (typeof window === "undefined") return;
    try {
      const key = `${STORAGE_KEYS.vercracList}-${getCurrentWorkingDayDateString()}`;
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save vercrac list", e);
    }
  };
  const persistPahacList = (next: ListItem[]) => {
    if (typeof window === "undefined") return;
    try {
      const key = `${STORAGE_KEYS.pahacList}-${getCurrentWorkingDayDateString()}`;
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save pahac list", e);
    }
  };

  const removeRoomFromRunningSessions = (roomId: number) => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.runningSessions);
      const running = raw
        ? (JSON.parse(raw) as Record<string, { startTime: string; endTime: string | null; pricePerHour: number }>)
        : {};
      if (running && typeof running === "object") {
        delete running[String(roomId)];
        window.localStorage.setItem(STORAGE_KEYS.runningSessions, JSON.stringify(running));
      }
    } catch (e) {
      console.warn("Failed to remove room from running sessions", e);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const role = window.localStorage.getItem("gameclub-user-role");
      setIsAdminRole(role === "admin");
    }
  }, []);

  // Sync confirm modal price input when modal opens
  useEffect(() => {
    if (pendingStop) {
      const hookahAdd = hookahClickedRooms.has(pendingStop.roomId) ? 2000 : 0;
      setConfirmPriceInput(String(pendingStop.manualPrice + hookahAdd));
      setConfirmCardSelected(false);
    } else {
      setConfirmPriceInput("");
    }
  }, [pendingStop !== null, pendingStop?.roomId]);

  // Load persisted dashboard data from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dayKey = getCurrentWorkingDayDateString();
      const rawVercrac = window.localStorage.getItem(`${STORAGE_KEYS.vercracList}-${dayKey}`);
      if (rawVercrac) {
        const parsed = JSON.parse(rawVercrac) as { id?: string; text: string; deleted: boolean }[];
        const withIds = parsed.map((item) => ({
          id: item.id ?? `v-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: item.text,
          deleted: item.deleted ?? false,
        }));
        setVercracList(withIds);
      }
      const rawPahac = window.localStorage.getItem(`${STORAGE_KEYS.pahacList}-${dayKey}`);
      if (rawPahac) {
        const parsed = JSON.parse(rawPahac) as { id?: string; text: string; deleted: boolean }[];
        const withIds = parsed.map((item) => ({
          id: item.id ?? `p-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          text: item.text,
          deleted: item.deleted ?? false,
        }));
        setPahacList(withIds);
      }
      const rawHookah = window.localStorage.getItem(STORAGE_KEYS.hookahRooms);
      if (rawHookah) {
        const arr = JSON.parse(rawHookah) as number[];
        if (Array.isArray(arr)) setHookahClickedRooms(new Set(arr));
      }
      const rawPaid = window.localStorage.getItem(STORAGE_KEYS.paidRooms);
      if (rawPaid) {
        const arr = JSON.parse(rawPaid) as number[];
        if (Array.isArray(arr)) setPaidRooms(new Set(arr));
      }
      const rawRunning = window.localStorage.getItem(STORAGE_KEYS.runningSessions);
      if (rawRunning) {
        const running = JSON.parse(rawRunning) as Record<
          string,
          { startTime: string; endTime: string | null; pricePerHour: number }
        >;
        if (running && typeof running === "object") {
          const { start: dayStart, end: dayEnd } = getCurrentWorkingDayBounds();
          const dayStartMs = dayStart.getTime();
          const dayEndMs = dayEnd.getTime();
          setRooms((prev) =>
            prev.map((room) => {
              const s = running[String(room.id)];
              if (!s?.startTime) return room;
              const sessionStartMs = new Date(s.startTime).getTime();
              if (sessionStartMs < dayStartMs || sessionStartMs >= dayEndMs) return room;
              return {
                ...room,
                startTime: new Date(s.startTime),
                startTimeRecordedAt: new Date(s.startTime),
                endTime: s.endTime ? new Date(s.endTime) : null,
                elapsedMs: 0,
                totalPrice: 0,
                isRunning: true,
                pricePerHour: s.pricePerHour ?? room.pricePerHour,
              };
            }),
          );
        }
      }
    } catch (e) {
      console.warn("Failed to load dashboard data from localStorage", e);
    } finally {
      hasLoadedFromStorage.current = true;
    }
  }, []);

  // Lists and hookah are persisted only inside state updaters (persistVercracList, persistPahacList, persistHookahRooms),
  // so we never overwrite localStorage with stale empty state after load.

  // Hookah is persisted only in persistHookahRooms() inside state updaters (not here),
  // so we never overwrite localStorage with stale empty state after load.

  // Running sessions are persisted only in finalizeStop, handleTransferToRoom, and handleManualStart
  // (never in an effect) so we never overwrite with stale state after load or from the tick.

  // Load room prices from database
  useEffect(() => {
    const loadRoomPrices = async () => {
      try {
        const res = await fetch("/api/room-prices");
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("Failed to load prices:", errorData);
          // Continue with default prices if API fails
          return;
        }
        const prices: Record<number, number> = await res.json();
        setRooms((prev) =>
          prev.map((room) => ({
            ...room,
            pricePerHour: prices[room.id] ?? room.pricePerHour,
          })),
        );
      } catch (err) {
        console.error("Failed to load room prices", err);
        // Continue waith default prices if fetch fails
      }
    };
    loadRoomPrices();
  }, []);

  const hasRunning = useMemo(() => rooms.some((room) => room.isRunning), [rooms]);

  // Keep all running rooms ticking once per second
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(() => {
      setRooms((prev) =>
        prev.map((room) => {
          if (!room.isRunning || !room.startTime) return room;
          const now = Date.now();
          const startTimeMs = room.startTime.getTime();
          // If end time is set and reached, use end time for calculation
          const endTimeMs = room.endTime ? room.endTime.getTime() : now;
          const elapsedMs = Math.min(endTimeMs - startTimeMs, now - startTimeMs);
          const totalPrice = Number(((elapsedMs / 3600000) * room.pricePerHour).toFixed(2));
          return {
            ...room,
            elapsedMs: elapsedMs,
            totalPrice: totalPrice,
          };
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const handleManualStart = (roomId: number, selectedStartTime: string, selectedEndTime?: string) => {
    if (!selectedStartTime) return;
    const today = new Date();
    const [startH, startM] = selectedStartTime.split(":").map(Number);
    const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM, 0, 0);
    let endTime: Date | null = null;
    if (selectedEndTime) {
      const [endH, endM] = selectedEndTime.split(":").map(Number);
      let endTimeCandidate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM, 0, 0);
      if (endTimeCandidate <= startTime) {
        endTimeCandidate = new Date(endTimeCandidate.getTime() + 24 * 60 * 60 * 1000);
      }
      endTime = endTimeCandidate;
    }
    const recordedAt = new Date();
    setRooms((prev) => {
      const next = prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              startTime: startTime,
              startTimeRecordedAt: recordedAt,
              endTime: endTime,
              elapsedMs: 0,
              totalPrice: 0,
              isRunning: true,
            }
          : room,
      );
      if (typeof window !== "undefined") {
        try {
          const running: Record<string, { startTime: string; endTime: string | null; pricePerHour: number }> = {};
          next.forEach((room) => {
            if (room.isRunning && room.startTime) {
              running[String(room.id)] = {
                startTime: room.startTime.toISOString(),
                endTime: room.endTime ? room.endTime.toISOString() : null,
                pricePerHour: room.pricePerHour,
              };
            }
          });
          window.localStorage.setItem(STORAGE_KEYS.runningSessions, JSON.stringify(running));
        } catch (e) {
          console.warn("Failed to save running sessions", e);
        }
      }
      return next;
    });
    setManualStartRoom(null);
    setManualStartTime("");
    setManualEndTime("");
    setManualTargetPrice("");
  };

  const handleStopRequest = (roomId: number) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId || !room.startTime) return room;
        const now = new Date();
        const endTime = room.endTime || now;
        const elapsed = endTime.getTime() - room.startTime.getTime();
        const basePrice = Number(
          ((elapsed / 3600000) * room.pricePerHour).toFixed(2),
        );
        setPendingStop({
          roomId: room.id,
          roomName: room.name,
          startTime: room.startTime,
          endTime,
          elapsedMs: elapsed,
          basePrice,
          pricePerHour: room.pricePerHour,
          manualPrice: basePrice,
          hadScheduledEndTime: !!room.endTime,
        });
        return room;
      }),
    );
  };

  const finalizeStop = async () => {
    if (!pendingStop) return;
    // Write running sessions to localStorage immediately (before any setState/await) so it persists even if user navigates away
    if (typeof window !== "undefined") {
      try {
        const running: Record<string, { startTime: string; endTime: string | null; pricePerHour: number }> = {};
        rooms.forEach((room) => {
          if (room.isRunning && room.startTime && room.id !== pendingStop.roomId) {
            running[String(room.id)] = {
              startTime: room.startTime.toISOString(),
              endTime: room.endTime ? room.endTime.toISOString() : null,
              pricePerHour: room.pricePerHour,
            };
          }
        });
        window.localStorage.setItem(STORAGE_KEYS.runningSessions, JSON.stringify(running));
      } catch (e) {
        console.warn("Failed to save running sessions", e);
      }
    }
    setConfirmModalEditEndTime(false);
    setConfirmModalEndTimeValue("");
    const hookahAdd = hookahClickedRooms.has(pendingStop.roomId) ? 2000 : 0;
    const totalFromInput = parseFloat(confirmPriceInput);
    const basePrice = Number.isNaN(totalFromInput)
      ? Math.round(Number(pendingStop.manualPrice.toFixed(2)))
      : Math.max(0, Math.round(totalFromInput - hookahAdd));
    const entry: HistoryEntry = {
      id: `${pendingStop.roomId}-${pendingStop.endTime.getTime()}`,
      roomId: pendingStop.roomId,
      roomName: pendingStop.roomName,
      start: pendingStop.startTime.toISOString(),
      end: pendingStop.endTime.toISOString(),
      durationMs: pendingStop.elapsedMs,
      priceAmd: basePrice + hookahAdd,
      pricePerHourAmd: pendingStop.pricePerHour,
      paidByCard: confirmCardSelected,
    };
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== pendingStop.roomId || !room.startTime) return room;
        return {
          ...room,
          startTime: null,
          startTimeRecordedAt: null,
          endTime: null,
          elapsedMs: 0,
          totalPrice: 0,
          isRunning: false,
        };
      }),
    );
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: entry.roomId,
          roomName: entry.roomName,
          start: entry.start,
          end: entry.end,
          durationMs: entry.durationMs,
          priceAmd: entry.priceAmd,
          pricePerHourAmd: entry.pricePerHourAmd,
          paidByCard: entry.paidByCard,
          cashCollected: paidRooms.has(pendingStop.roomId),
        }),
      });
    } catch (err) {
      console.error("Failed to save session to DB", err);
    }
    setHookahClickedRooms((prev) => {
      const next = new Set(prev);
      next.delete(pendingStop.roomId);
      persistHookahRooms(next);
      return next;
    });
    setPaidRooms((prev) => {
      const next = new Set(prev);
      next.delete(pendingStop.roomId);
      persistPaidRooms(next);
      return next;
    });
    setPendingStop(null);
  };

  const cancelStop = () => {
    setPendingStop(null);
    setConfirmModalEditEndTime(false);
    setConfirmModalEndTimeValue("");
  };

  const applyConfirmModalEndTime = () => {
    if (!pendingStop || !confirmModalEndTimeValue.trim()) return;
    const [h, m] = confirmModalEndTimeValue.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const start = pendingStop.startTime;
    let endTime = new Date(start.getFullYear(), start.getMonth(), start.getDate(), h, m, 0, 0);
    if (endTime <= start) {
      endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
    }
    const elapsedMs = endTime.getTime() - start.getTime();
    const basePrice = Number(((elapsedMs / 3600000) * pendingStop.pricePerHour).toFixed(2));
    const hookahAdd = hookahClickedRooms.has(pendingStop.roomId) ? 2000 : 0;
    setPendingStop((prev) =>
      prev
        ? { ...prev, endTime, elapsedMs, basePrice, manualPrice: basePrice }
        : null,
    );
    setConfirmPriceInput(String(basePrice + hookahAdd));
    setConfirmModalEditEndTime(false);
    setConfirmModalEndTimeValue("");
  };

  const handleSaveEndTime = () => {
    if (editEndTimeRoomId == null || editEndTimeValue.trim() === "") return;
    const room = rooms.find((r) => r.id === editEndTimeRoomId);
    if (!room || !room.startTime) return;
    const price = parseFloat(editEndTimeValue);
    if (Number.isNaN(price) || price <= 0) return;
    const durationHours = price / room.pricePerHour;
    const newEndTime = new Date(room.startTime.getTime() + durationHours * 3600000);
    setRooms((prev) => {
      const next = prev.map((r) =>
        r.id === editEndTimeRoomId ? { ...r, endTime: newEndTime } : r,
      );
      if (typeof window !== "undefined") {
        try {
          const running: Record<string, { startTime: string; endTime: string | null; pricePerHour: number }> = {};
          next.forEach((r) => {
            if (r.isRunning && r.startTime) {
              running[String(r.id)] = {
                startTime: r.startTime.toISOString(),
                endTime: r.endTime ? r.endTime.toISOString() : null,
                pricePerHour: r.pricePerHour,
              };
            }
          });
          window.localStorage.setItem(STORAGE_KEYS.runningSessions, JSON.stringify(running));
        } catch (e) {
          console.warn("Failed to save running sessions", e);
        }
      }
      return next;
    });
    setEditEndTimeRoomId(null);
    setEditEndTimeValue("");
  };

  const handleTransferToRoom = (targetRoomId: number) => {
    if (transferFromRoomId == null) return;
    const source = rooms.find((r) => r.id === transferFromRoomId);
    if (!source || !source.isRunning) {
      setTransferFromRoomId(null);
      return;
    }
    const target = rooms.find((r) => r.id === targetRoomId);
    const isSwap = target?.isRunning === true;

    setRooms((prev) => {
      const targetRoom = prev.find((r) => r.id === targetRoomId);
      const sourceRoom = prev.find((r) => r.id === transferFromRoomId);
      if (!sourceRoom?.isRunning || !sourceRoom.startTime) return prev;

      let next: typeof prev;
      if (isSwap && targetRoom?.isRunning && targetRoom.startTime) {
        // Swap sessions between source and target
        next = prev.map((room) => {
          if (room.id === transferFromRoomId) {
            return {
              ...room,
              startTime: targetRoom.startTime,
              startTimeRecordedAt: targetRoom.startTimeRecordedAt ?? null,
              endTime: targetRoom.endTime,
              elapsedMs: targetRoom.elapsedMs,
              totalPrice: targetRoom.totalPrice,
              pricePerHour: targetRoom.pricePerHour,
              isRunning: true,
            };
          }
          if (room.id === targetRoomId) {
            return {
              ...room,
              startTime: sourceRoom.startTime,
              startTimeRecordedAt: sourceRoom.startTimeRecordedAt ?? null,
              endTime: sourceRoom.endTime,
              elapsedMs: sourceRoom.elapsedMs,
              totalPrice: sourceRoom.totalPrice,
              pricePerHour: sourceRoom.pricePerHour,
              isRunning: true,
            };
          }
          return room;
        });
      } else {
        // Move session to inactive target
        next = prev.map((room) => {
          if (room.id === transferFromRoomId) {
            return {
              ...room,
              startTime: null,
              startTimeRecordedAt: null,
              endTime: null,
              elapsedMs: 0,
              totalPrice: 0,
              isRunning: false,
            };
          }
          if (room.id === targetRoomId) {
            return {
              ...room,
              startTime: sourceRoom.startTime,
              startTimeRecordedAt: sourceRoom.startTimeRecordedAt ?? null,
              endTime: sourceRoom.endTime,
              elapsedMs: sourceRoom.elapsedMs,
              totalPrice: sourceRoom.totalPrice,
              pricePerHour: sourceRoom.pricePerHour,
              isRunning: true,
            };
          }
          return room;
        });
      }
      if (typeof window !== "undefined") {
        try {
          const running: Record<string, { startTime: string; endTime: string | null; pricePerHour: number }> = {};
          next.forEach((room) => {
            if (room.isRunning && room.startTime) {
              const st = room.startTime instanceof Date ? room.startTime : new Date(room.startTime as unknown as string);
              const et = room.endTime ? (room.endTime instanceof Date ? room.endTime : new Date(room.endTime as unknown as string)) : null;
              running[String(room.id)] = {
                startTime: st.toISOString(),
                endTime: et ? et.toISOString() : null,
                pricePerHour: room.pricePerHour,
              };
            }
          });
          window.localStorage.setItem(STORAGE_KEYS.runningSessions, JSON.stringify(running));
        } catch (e) {
          console.warn("Failed to save running sessions", e);
        }
      }
      return next;
    });

    setHookahClickedRooms((prev) => {
      const next = new Set(prev);
      if (isSwap) {
        const sourceHad = next.has(transferFromRoomId);
        const targetHad = next.has(targetRoomId);
        if (sourceHad && !targetHad) {
          next.delete(transferFromRoomId);
          next.add(targetRoomId);
        } else if (!sourceHad && targetHad) {
          next.delete(targetRoomId);
          next.add(transferFromRoomId);
        }
      } else {
        if (next.has(transferFromRoomId)) {
          next.delete(transferFromRoomId);
          next.add(targetRoomId);
        }
      }
      persistHookahRooms(next);
      return next;
    });
    setPaidRooms((prev) => {
      const next = new Set(prev);
      if (isSwap) {
        const sourceHad = next.has(transferFromRoomId);
        const targetHad = next.has(targetRoomId);
        if (sourceHad && !targetHad) {
          next.delete(transferFromRoomId);
          next.add(targetRoomId);
        } else if (!sourceHad && targetHad) {
          next.delete(targetRoomId);
          next.add(transferFromRoomId);
        }
      } else {
        if (next.has(transferFromRoomId)) {
          next.delete(transferFromRoomId);
          next.add(targetRoomId);
        }
      }
      persistPaidRooms(next);
      return next;
    });
    setTransferFromRoomId(null);
  };

  const runningRooms = rooms.filter((r) => r.isRunning);
  const totalRunningPrice = runningRooms.reduce((sum, r) => sum + r.totalPrice, 0);

  return (
    <div className="relative flex min-h-screen text-slate-100">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/stadium-bg.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-1 flex-col items-center px-4 py-10">
      <div className="w-full max-w-6xl px-4 pb-10 pt-4">
        <div className="flex justify-end">
          {isAdminRole ? (
              <Link
                href="/admin"
                className="m-2 rounded-full border border-white/30 bg-white/10 px-6 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-white/20"
              >
                History
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("gameclub-admin-authed", "true");
                    window.localStorage.setItem("gameclub-user-role", "viewer");
                  }
                  router.push("/admin");
                }}
                className="m-2 rounded-full border border-white/30 bg-white/10 px-6 py-2 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-white/20"
              >
              History
            </button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className={`relative flex h-full flex-col justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-sm ${
                room.isRunning
                  ? room.endTime && room.endTime.getTime() - Date.now() < 5 * 60 * 1000
                    ? "shadow-[0_0_56px_16px_rgba(239,68,68,0.85),0_0_24px_4px_rgba(239,68,68,0.5),0_8px_24px_rgba(0,0,0,0.5)]"
                    : "shadow-[0_0_28px_6px_rgba(239,68,68,0.55),0_4px_12px_rgba(0,0,0,0.35)]"
                  : "shadow-[0_0_28px_6px_rgba(34,197,94,0.55),0_4px_12px_rgba(0,0,0,0.35)]"
              }`}
            >
              {/* Status indicator - top right, color only */}
              <div
                className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${
                  room.isRunning ? "bg-red-500" : "bg-green-500"
                }`}
                aria-hidden
              />
              {/* Logo and title - fixed height so texts container starts at same place on all cards */}
              <div className="flex min-h-[4rem] items-center gap-3 px-3 pt-3 pb-1.5">
                <button
                  type="button"
                  onClick={room.isRunning ? () => setTransferFromRoomId(room.id) : undefined}
                  className={`flex items-center gap-3 ${room.isRunning ? "cursor-pointer rounded-lg transition hover:opacity-80" : "cursor-default"}`}
                  aria-label="Transfer session to another room"
                >
                  {room.name === "Barc" ? (
                    <img
                      src="/logos/barc.png"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : room.name === "Real" ? (
                    <img
                      src="/logos/real.png"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : room.name === "Euro" ? (
                    <img
                      src="/logos/euro.png"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : room.name === "VIP" ? (
                    <img
                      src="/logos/vip.png"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : room.name === "Green" ? (
                    <img
                      src="/logos/green.svg"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : room.name === "Blue" ? (
                    <img
                      src="/logos/blue.svg"
                      alt=""
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  ) : (
                    <LogoIcon className="h-12 w-12 flex-shrink-0" />
                  )}
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-200">
                    {room.name}
                  </p>
                </button>
              </div>
              <div className="relative space-y-2 px-3">
                {/* Session info - left: Started/Ends, right: Remaining countdown, bottom: two-tone progress bar */}
                <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="flex min-h-[3.5rem] items-start justify-between gap-4">
                    <div className="flex flex-col gap-0.5 text-left">
                      <p className="text-sm text-white">
                        Start {formatTimeOnly(room.startTime)}
                      </p>
                      <p className="flex items-center gap-1 text-sm">
                        <span className="font-semibold text-white">End</span>
                        <span className="text-white">
                          {room.endTime ? formatTimeOnly(room.endTime) : "—"}
                        </span>
                        {room.isRunning && room.startTime && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditEndTimeRoomId(room.id);
                              const price =
                                room.endTime && room.startTime
                                  ? ((room.endTime.getTime() - room.startTime.getTime()) / 3600000) * room.pricePerHour
                                  : room.totalPrice;
                              setEditEndTimeValue(price > 0 ? String(Math.round(price * 100) / 100) : "");
                            }}
                            className="rounded p-0.5 text-white transition hover:bg-white/20 hover:text-white"
                            aria-label="Edit end time"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </p>
                    </div>
                    <div className="flex min-w-[5rem] flex-col items-end justify-end gap-0.5 text-right">
                      {room.isRunning && room.startTime ? (
                        <>
                          <p className="text-xs italic text-green-400">
                            Time
                          </p>
                          <p className="text-xl font-bold tabular-nums text-green-400">
                            {room.endTime
                              ? formatDuration(Math.max(0, room.endTime.getTime() - Date.now()))
                              : formatDuration(room.elapsedMs)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xs italic text-white">Time</p>
                          <p className="text-xl font-bold tabular-nums text-white">—</p>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Progress bar or reserved space so container height stays same */}
                  <div className="mt-2 h-2 w-full">
                    {room.isRunning && room.startTime && room.endTime && (() => {
                      const totalMs = room.endTime.getTime() - room.startTime.getTime();
                      const progressPct =
                        totalMs > 0
                          ? Math.min(100, (room.elapsedMs / totalMs) * 100)
                          : 100;
                      return (
                        <div className="flex h-full w-full overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-l-full bg-red-500 transition-all duration-1000"
                            style={{ width: `${progressPct}%` }}
                          />
                          <div
                            className="h-full rounded-r-full bg-slate-600/80"
                            style={{ width: `${100 - progressPct}%` }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div
                    className={`flex flex-shrink-0 origin-left items-center gap-1.5 transition-all duration-200 ease-out ${
                      room.isRunning ? "translate-x-0 scale-100 opacity-100" : "pointer-events-none translate-x-1 scale-95 opacity-0"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setHookahClickedRooms((prev) => {
                          const next = new Set(prev);
                          if (next.has(room.id)) next.delete(room.id);
                          else next.add(room.id);
                          persistHookahRooms(next);
                          return next;
                        })
                      }
                      className="rounded p-1 transition hover:opacity-80"
                      aria-label="Toggle hookah"
                    >
                      <img
                        src="/logos/hookah.svg"
                        alt=""
                        className={`h-6 w-6 object-contain ${
                          hookahClickedRooms.has(room.id)
                            ? "[filter:invert(48%)_sepia(79%)_saturate(2476%)_hue-rotate(86deg)_brightness(118%)_contrast(119%)]"
                            : "[filter:invert(27%)_sepia(98%)_saturate(7472%)_hue-rotate(358deg)_brightness(101%)_contrast(118%)]"
                        }`}
                      />
                    </button>
                    {room.endTime && (
                      <button
                        type="button"
                        onClick={() =>
                          setPaidRooms((prev) => {
                            const next = new Set(prev);
                            if (next.has(room.id)) next.delete(room.id);
                            else next.add(room.id);
                            persistPaidRooms(next);
                            return next;
                          })
                        }
                        className="rounded p-1 transition hover:opacity-80"
                        aria-label={paidRooms.has(room.id) ? "Mark as unpaid" : "Mark as paid"}
                        title={paidRooms.has(room.id) ? "Paid" : "Not paid"}
                      >
                        <img
                          src="/logos/cash.svg"
                          alt=""
                          className={`h-8 w-8 object-contain ${
                            paidRooms.has(room.id)
                              ? "[filter:invert(48%)_sepia(79%)_saturate(2476%)_hue-rotate(86deg)_brightness(118%)_contrast(119%)]"
                              : "[filter:invert(27%)_sepia(98%)_saturate(7472%)_hue-rotate(358deg)_brightness(101%)_contrast(118%)]"
                          }`}
                        />
                      </button>
                    )}
                  </div>
                  <span className="min-w-[7rem] text-right text-lg font-semibold tabular-nums text-slate-100">
                    AMD {(room.totalPrice + (hookahClickedRooms.has(room.id) ? 2000 : 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3">
                {!room.isRunning && (
                  <div className="w-full animate-stop-to-start px-4">
                    <button
                      onClick={() => {
                        setManualStartRoom(room.id);
                        const now = new Date();
                        setManualStartTime(
                          String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0"),
                        );
                        setManualEndTime("");
                        setManualTargetPrice("");
                      }}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(to_right,#1e3a8a,#8B5CF6)] px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(65,105,225,0.4),0_2px_4px_0_rgba(0,0,0,0.3)] transition hover:opacity-90"
                    >
                      Start
                    </button>
                  </div>
                )}
                {room.isRunning && (
                  <div className="w-full animate-start-to-stop px-4">
                    <button
                      onClick={() => handleStopRequest(room.id)}
                      className={`inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(to_right,#b91c1c,#7f1d1d)] px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(185,28,28,0.4),0_2px_4px_0_rgba(0,0,0,0.3)] transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] ${
                        room.endTime && room.endTime.getTime() - Date.now() < 5 * 60 * 1000 ? "animate-pulse" : ""
                      }`}
                    >
                      Stop
                    </button>
                  </div>
                )}
              </div>
              </div>
          ))}
        </div>
      </div>
      </div>

      <aside className="sticky top-0 z-10 flex hidden w-56 flex-shrink-0 flex-col self-start border-l border-white/20 bg-black/25 p-4 backdrop-blur-sm xl:flex">
        <div className="flex flex-col gap-3">
          <section className="rounded-lg border border-white/20 bg-black/20 p-3 backdrop-blur-sm">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setVercracModalOpen(true);
                setVercracDescription("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setVercracModalOpen(true);
                  setVercracDescription("");
                }
              }}
              className="w-full cursor-pointer text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-blue-300">Վերցրած</h2>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeletedVercrac((prev) => !prev);
                  }}
                  className="flex-shrink-0 rounded p-1 text-slate-400 transition hover:bg-white/20 hover:text-slate-200"
                  aria-label={showDeletedVercrac ? "Hide deleted items" : "Show deleted items"}
                  title={showDeletedVercrac ? "Hide deleted items" : "Show deleted items"}
                >
                  {showDeletedVercrac ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
              {vercracList.length > 0 && (
                <ul className="mt-2 space-y-2 text-sm text-slate-300">
                  {(showDeletedVercrac ? vercracList : vercracList.filter((item) => !item.deleted)).map((item) => {
                    const realIndex = vercracList.findIndex((x) => x.id === item.id);
                    return (
                      <li key={item.id} className="flex items-start justify-between gap-2 border-b border-white/10 pb-1 last:border-0 last:pb-0">
                        <span className={`flex-1 font-semibold text-slate-200 ${item.deleted ? "line-through opacity-60" : ""}`}>{item.text}</span>
                        {!item.deleted && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setVercracDeleteIndex(realIndex);
                            }}
                            className="flex-shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-red-500/20 hover:text-red-400"
                            aria-label="Remove"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
          <section className="rounded-lg border border-white/20 bg-black/20 p-3 backdrop-blur-sm">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setPahacModalOpen(true);
                setPahacDescription("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPahacModalOpen(true);
                  setPahacDescription("");
                }
              }}
              className="w-full cursor-pointer text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-red-300">Պահած</h2>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeletedPahac((prev) => !prev);
                  }}
                  className="flex-shrink-0 rounded p-1 text-slate-400 transition hover:bg-white/20 hover:text-slate-200"
                  aria-label={showDeletedPahac ? "Hide deleted items" : "Show deleted items"}
                  title={showDeletedPahac ? "Hide deleted items" : "Show deleted items"}
                >
                  {showDeletedPahac ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
              {pahacList.length > 0 && (
                <ul className="mt-2 space-y-2 text-sm text-slate-300">
                  {(showDeletedPahac ? pahacList : pahacList.filter((item) => !item.deleted)).map((item) => {
                    const realIndex = pahacList.findIndex((x) => x.id === item.id);
                    return (
                      <li key={item.id} className="flex items-start justify-between gap-2 border-b border-white/10 pb-1 last:border-0 last:pb-0">
                        <span className={`flex-1 font-semibold text-slate-200 ${item.deleted ? "line-through opacity-60" : ""}`}>{item.text}</span>
                        {!item.deleted && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPahacDeleteIndex(realIndex);
                            }}
                            className="flex-shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-red-500/20 hover:text-red-400"
                            aria-label="Remove"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </aside>

      {vercracModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Վերցրած</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <input
                type="text"
                value={vercracDescription}
                onChange={(e) => setVercracDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const description = vercracDescription.trim();
                  if (description) {
                    setVercracList((prev) => {
                      const next = [...prev, { id: `v-${Date.now()}-${Math.random().toString(36).slice(2)}`, text: description, deleted: false }];
                      persistVercracList(next);
                      return next;
                    });
                    setVercracModalOpen(false);
                  }
                }}
                className="flex-1 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setVercracModalOpen(false)}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {vercracDeleteIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-800">Delete item?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {vercracList[vercracDeleteIndex] != null && (
                <span className="font-medium text-slate-700">&quot;{vercracList[vercracDeleteIndex].text}&quot;</span>
              )}
              {" "}This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setVercracList((prev) => {
                    const next = prev.map((item, idx) => idx === vercracDeleteIndex ? { ...item, deleted: true } : item);
                    persistVercracList(next);
                    return next;
                  });
                  setVercracDeleteIndex(null);
                }}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setVercracDeleteIndex(null)}
                className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pahacModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="mb-4 text-lg font-semibold text-slate-800">Պահած</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <input
                type="text"
                value={pahacDescription}
                onChange={(e) => setPahacDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const description = pahacDescription.trim();
                  if (description) {
                    setPahacList((prev) => {
                      const next = [...prev, { id: `p-${Date.now()}-${Math.random().toString(36).slice(2)}`, text: description, deleted: false }];
                      persistPahacList(next);
                      return next;
                    });
                    setPahacModalOpen(false);
                  }
                }}
                className="flex-1 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setPahacModalOpen(false)}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pahacDeleteIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-800">Delete item?</h3>
            <p className="mt-2 text-sm text-slate-600">
              {pahacList[pahacDeleteIndex] != null && (
                <span className="font-medium text-slate-700">&quot;{pahacList[pahacDeleteIndex].text}&quot;</span>
              )}
              {" "}This cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setPahacList((prev) => {
                    const next = prev.map((item, idx) => idx === pahacDeleteIndex ? { ...item, deleted: true } : item);
                    persistPahacList(next);
                    return next;
                  });
                  setPahacDeleteIndex(null);
                }}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setPahacDeleteIndex(null)}
                className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {transferFromRoomId !== null && (() => {
          const sourceRoom = rooms.find((r) => r.id === transferFromRoomId);
          const otherRooms = rooms.filter((r) => r.id !== transferFromRoomId);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      Transfer session
                    </p>
                    <h3 className="text-xl font-semibold text-slate-900">
                      Move from {sourceRoom?.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setTransferFromRoomId(null)}
                    className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-2">
                  {otherRooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => handleTransferToRoom(room.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition ${
                        room.isRunning
                          ? "border-red-800/50 bg-[linear-gradient(to_right,#b91c1c,#7f1d1d)] text-white shadow-[0_2px_8px_rgba(185,28,28,0.3)] hover:opacity-90"
                          : "border border-slate-200 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {room.name === "Barc" ? (
                          <img src="/logos/barc.png" alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : room.name === "Real" ? (
                          <img src="/logos/real.png" alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : room.name === "Euro" ? (
                          <img src="/logos/euro.png" alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : room.name === "VIP" ? (
                          <img src={room.isRunning ? "/logos/vip.png" : "/logos/vip-modal.png"} alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : room.name === "Green" ? (
                          <img src="/logos/green.svg" alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : room.name === "Blue" ? (
                          <img src="/logos/blue.svg" alt="" className="h-12 w-12 flex-shrink-0 object-contain" />
                        ) : (
                          <LogoIcon className="h-12 w-12 flex-shrink-0" />
                        )}
                        <span className={`font-medium ${room.isRunning ? "text-white" : "text-slate-800"}`}>{room.name}</span>
                      </div>
                      <span className={`text-sm ${room.isRunning ? "text-red-100" : "text-slate-500"}`}>
                        AMD {room.pricePerHour}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

      {editEndTimeRoomId !== null && (() => {
          const room = rooms.find((r) => r.id === editEndTimeRoomId);
          if (!room) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
              <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
                <div className="mb-4 flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Edit end time — {room.name}
                  </h3>
                  <button
                    onClick={() => {
                      setEditEndTimeRoomId(null);
                      setEditEndTimeValue("");
                    }}
                    className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Price (AMD)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editEndTimeValue}
                    onChange={(e) => setEditEndTimeValue(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSaveEndTime}
                    disabled={!editEndTimeValue.trim()}
                    className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {manualStartRoom !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {rooms.find((r) => r.id === manualStartRoom)?.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setManualStartRoom(null);
                  setManualStartTime("");
                  setManualEndTime("");
                  setManualTargetPrice("");
                }}
                className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Price (AMD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={manualTargetPrice}
                  onChange={(e) => {
                    const value = e.target.value;
                    setManualTargetPrice(value);
                    const price = parseFloat(value);
                    const room = rooms.find((r) => r.id === manualStartRoom);
                    if (!room || !manualStartTime || Number.isNaN(price) || price <= 0) {
                      if (!value.trim()) setManualEndTime("");
                      return;
                    }
                    const durationHours = price / room.pricePerHour;
                    const [h, m] = manualStartTime.split(":").map(Number);
                    const startDate = new Date();
                    startDate.setHours(h, m, 0, 0);
                    const endDate = new Date(startDate.getTime() + durationHours * 3600000);
                    setManualEndTime(
                      String(endDate.getHours()).padStart(2, "0") +
                        ":" +
                        String(endDate.getMinutes()).padStart(2, "0"),
                    );
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Start
                </label>
                <input
                  type="time"
                  value={manualStartTime}
                  onChange={(e) => setManualStartTime(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Finish
                </label>
                <input
                  type="time"
                  value={manualEndTime}
                  onChange={(e) => setManualEndTime(e.target.value)}
                  min={manualStartTime || undefined}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5">
              <button
                onClick={() => {
                  if (manualStartTime && manualStartRoom !== null) {
                    handleManualStart(manualStartRoom, manualStartTime, manualEndTime || undefined);
                  }
                }}
                disabled={!manualStartTime}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(to_right,#1e3a8a,#8B5CF6)] px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_0_rgba(65,105,225,0.4),0_2px_4px_0_rgba(0,0,0,0.3)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {pendingStop.roomName}
                </h3>
              </div>
              <button
                onClick={cancelStop}
                className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Start</span>
                <span className="font-medium">
                  {formatTimeOnly(pendingStop.startTime)}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span>End</span>
                {!confirmModalEditEndTime ? (
                  <span className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatTimeOnly(pendingStop.endTime)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalEndTimeValue(
                          `${String(pendingStop.endTime.getHours()).padStart(2, "0")}:${String(pendingStop.endTime.getMinutes()).padStart(2, "0")}`,
                        );
                        setConfirmModalEditEndTime(true);
                      }}
                      className="rounded p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
                      aria-label="Edit end time"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <input
                      type="time"
                      value={confirmModalEndTimeValue}
                      onChange={(e) => setConfirmModalEndTimeValue(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyConfirmModalEndTime}
                      className="rounded bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmModalEditEndTime(false);
                        setConfirmModalEndTimeValue("");
                      }}
                      className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Close"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                )}
              </div>
              <div className="flex justify-between text-indigo-700">
                <span>Time</span>
                <span className="font-mono text-base font-bold">
                  {formatDuration(pendingStop.elapsedMs)}
                </span>
              </div>
              {hookahClickedRooms.has(pendingStop.roomId) && (
                <div className="flex justify-between text-emerald-600">
                  <span>Hookah</span>
                  <span className="font-semibold">+2000 AMD</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span>Price (editable)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={confirmPriceInput}
                  onChange={(e) => setConfirmPriceInput(e.target.value)}
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-slate-600">Card payment</span>
                <button
                  type="button"
                  onClick={() => setConfirmCardSelected((prev) => !prev)}
                  className={`rounded-lg border-2 p-2 transition ${
                    confirmCardSelected
                      ? "border-indigo-500 bg-indigo-50 text-indigo-600"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-600"
                  }`}
                  aria-label="Card payment"
                  aria-pressed={confirmCardSelected}
                >
                  <svg className="h-8 w-10" viewBox="0 0 48 48" fill="currentColor" aria-hidden>
                    <path d="M43,8H5a2.9,2.9,0,0,0-3,3V37a2.9,2.9,0,0,0,3,3H43a2.9,2.9,0,0,0,3-3V11A2.9,2.9,0,0,0,43,8ZM42,36H6V12H42Z" />
                    <path d="M30.6,28.9H33l.3-.2c.3-.7.4-1.2.5-1.3h3.4a6.1,6.1,0,0,1,.3,1.3l.3.2h1.9c.1,0,.2,0,.2-.1a.4.4,0,0,0,.1-.3l-2.1-9.3c0-.2-.1-.3-.2-.3H35.8a1.4,1.4,0,0,0-1.4.9l-3.8,8.7C30.5,28.7,30.6,28.8,30.6,28.9ZM36,21.7l.2.9.6,2.9H34.6Z" />
                    <path d="M23.3,28.5a10,10,0,0,0,2.6.5h0c2.8,0,4.5-1.3,4.6-3.3s-.7-2-2.2-2.6-1.5-.8-1.5-1.2.5-.9,1.5-.9h.1a3.2,3.2,0,0,1,1.7.4h.3c.1,0,.1-.1.1-.2l.3-1.4a.5.5,0,0,0-.2-.4,9.5,9.5,0,0,0-2.1-.3c-2.6,0-4.4,1.3-4.4,3.2s1.3,2.2,2.3,2.6,1.3.8,1.3,1.2-.8,1-1.5,1a5.7,5.7,0,0,1-2.4-.5.2.2,0,0,0-.3,0c-.1,0-.1.1-.2.2l-.2,1.5C23.1,28.3,23.1,28.5,23.3,28.5Z" />
                    <path d="M8.2,19.6a8.8,8.8,0,0,1,4.1,2.9h.3c.2-.1.2-.2.2-.4l-.5-2.4h0a1.1,1.1,0,0,0-1.2-.8H8.3a.3.3,0,0,0-.3.3Z" />
                    <path d="M18.6,28.9H21c.1,0,.2-.1.2-.3l1.6-9.3v-.3H20.5a.3.3,0,0,0-.3.3l-1.6,9.3Z" />
                    <path d="M10.3,21.2H10c-.1,0-.2.2-.2.3l2.1,7.3.3.2h2.5a.2.2,0,0,0,.2-.2l4-9.4c.1,0,.1-.2,0-.2s-.1-.2-.2-.2H16.5c-.2,0-.3.1-.3.2l-2.6,6.6-.3-1h0A10.2,10.2,0,0,0,10.3,21.2Z" />
                  </svg>
                </button>
              </div>
              </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={finalizeStop}
                className="inline-flex w-full items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Accept & save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
