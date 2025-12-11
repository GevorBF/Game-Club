"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Room, PendingStop, HistoryEntry } from "./types";
import { formatDuration, formatDateTime } from "./types";

const ROOM_NAMES: Record<number, string> = {
  1: "Barc",
  2: "Real",
  3: "Euro",
  4: "VIP",
  5: "Green",
  6: "Blue",
  7: "1",
};

export default function Home() {
  const [rooms, setRooms] = useState<Room[]>(() =>
    Array.from({ length: 7 }).map((_, idx) => ({
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
        prev.map((room) =>
          room.isRunning && room.startTime
            ? {
                ...room,
                elapsedMs: Date.now() - room.startTime.getTime(),
              }
            : room,
        ),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [hasRunning]);

  const handleStart = (roomId: number) => {
    const now = new Date();
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              startTime: now,
              startTimeRecordedAt: now,
              endTime: null,
              elapsedMs: 0,
              totalPrice: 0,
              isRunning: true,
            }
          : room,
      ),
    );
  };

  const handleManualStart = (roomId: number, selectedStartTime: string) => {
    if (!selectedStartTime) return;
    const startTime = new Date(selectedStartTime);
    const recordedAt = new Date();
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId
          ? {
              ...room,
              startTime: startTime,
              startTimeRecordedAt: recordedAt,
              endTime: null,
              elapsedMs: 0,
              totalPrice: 0,
              isRunning: true,
            }
          : room,
      ),
    );
    setManualStartRoom(null);
    setManualStartTime("");
  };

  const handleStopRequest = (roomId: number) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId || !room.startTime) return room;
        const now = new Date();
        const elapsed = now.getTime() - room.startTime.getTime();
        const basePrice = Number(
          ((elapsed / 3600000) * room.pricePerHour).toFixed(2),
        );
        setPendingStop({
          roomId: room.id,
          roomName: room.name,
          startTime: room.startTime,
          endTime: now,
          elapsedMs: elapsed,
          basePrice,
          pricePerHour: room.pricePerHour,
          manualPrice: basePrice,
        });
        return room;
      }),
    );
  };

  const finalizeStop = async () => {
    if (!pendingStop) return;
    const entry: HistoryEntry = {
      id: `${pendingStop.roomId}-${pendingStop.endTime.getTime()}`,
      roomId: pendingStop.roomId,
      roomName: pendingStop.roomName,
      start: pendingStop.startTime.toISOString(),
      end: pendingStop.endTime.toISOString(),
      durationMs: pendingStop.elapsedMs,
      priceAmd: Math.round(Number(pendingStop.manualPrice.toFixed(2))),
      pricePerHourAmd: pendingStop.pricePerHour,
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
        }),
      });
    } catch (err) {
      console.error("Failed to save session to DB", err);
    }
    setPendingStop(null);
  };

  const cancelStop = () => {
    setPendingStop(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 px-4 py-10 text-slate-900">
      <main className="w-full max-w-6xl rounded-2xl bg-white p-10 shadow-xl ring-1 ring-slate-200">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Game Club</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Link
              href="/admin"
              className="rounded-full border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
            >
              Admin Panel
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {room.name}
                </p>
                <p className="text-sm text-slate-500">
                  Status:{" "}
                  <span className="font-semibold text-slate-800">
                    {room.isRunning ? "Running" : "Stopped"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Rate: <span className="font-semibold text-indigo-700">AMD {room.pricePerHour}</span>
                </p>
              </div>

              <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Start</span>
                  <span className="font-semibold text-slate-900">
                    {formatDateTime(room.startTime)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>End</span>
                  <span className="font-semibold text-slate-900">
                    {formatDateTime(room.endTime)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-indigo-700">
                  <span>Elapsed</span>
                  <span className="text-lg font-bold">
                    {formatDuration(room.elapsedMs)}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>Price (AMD)</span>
                  <span className="text-lg font-semibold">
                    AMD {room.totalPrice.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {!room.isRunning && (
                  <>
                    <button
                      onClick={() => handleStart(room.id)}
                      className="inline-flex flex-1 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => {
                        setManualStartRoom(room.id);
                        const now = new Date();
                        const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                          .toISOString()
                          .slice(0, 16);
                        setManualStartTime(localDateTime);
                      }}
                      className="inline-flex flex-1 items-center justify-center rounded-full border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50"
                    >
                      Set start time
                    </button>
                  </>
                )}
                {room.isRunning && (
                  <button
                    onClick={() => handleStopRequest(room.id)}
                    className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Stop & price
                  </button>
                )}
              </div>
              {room.startTimeRecordedAt && (
                <p className="mt-2 text-xs text-slate-500">
                  Recorded at: {formatDateTime(room.startTimeRecordedAt)}
                </p>
              )}
            </div>
          ))}
        </div>
      </main>

      {manualStartRoom !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Set start time manually
                </p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {rooms.find((r) => r.id === manualStartRoom)?.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Enter the actual start time of the session
                </p>
              </div>
              <button
                onClick={() => {
                  setManualStartRoom(null);
                  setManualStartTime("");
                }}
                className="rounded-full px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Session Start Time
                </label>
                <input
                  type="datetime-local"
                  value={manualStartTime}
                  onChange={(e) => setManualStartTime(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  This is when the session actually started
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">
                  Recorded at: {new Date().toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  This timestamp shows when you're entering the start time
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  if (manualStartTime && manualStartRoom !== null) {
                    handleManualStart(manualStartRoom, manualStartTime);
                  }
                }}
                disabled={!manualStartTime}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Set start time
              </button>
              <button
                onClick={() => {
                  setManualStartRoom(null);
                  setManualStartTime("");
                }}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Cancel
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
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Confirm stop
                </p>
                <h3 className="text-xl font-semibold text-slate-900">
                  {pendingStop.roomName}
                </h3>
              </div>
              <button
                onClick={cancelStop}
                className="rounded-full px-3 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Start</span>
                <span className="font-medium">
                  {formatDateTime(pendingStop.startTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>End</span>
                <span className="font-medium">
                  {formatDateTime(pendingStop.endTime)}
                </span>
              </div>
              <div className="flex justify-between text-indigo-700">
                <span>Elapsed</span>
                <span className="font-mono text-base font-bold">
                  {formatDuration(pendingStop.elapsedMs)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Rate (AMD/hr)</span>
                <span className="font-semibold">AMD {pendingStop.pricePerHour}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Price (editable)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={pendingStop.manualPrice}
                  onChange={(e) =>
                    setPendingStop((prev) =>
                      prev
                        ? {
                            ...prev,
                            manualPrice: Number(e.target.value),
                          }
                        : prev,
                    )
                  }
                  className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <p className="text-xs text-slate-500">
                Based price: AMD {pendingStop.basePrice.toFixed(2)} — edit if you need to override.
              </p>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={finalizeStop}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                Accept & save
              </button>
              <button
                onClick={cancelStop}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Keep running
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
