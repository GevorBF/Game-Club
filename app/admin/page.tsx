"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { HistoryEntry, Room } from "../types";
import { formatDuration, formatDateTime, formatTimeOnly, formatDateTimeWithMonthAndWeek } from "../types";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123";
const VIEWER_PASSWORD = process.env.NEXT_PUBLIC_VIEWER_PASSWORD || "viewer123";

type UserRole = "admin" | "viewer";

const ROOM_NAMES: Record<number, string> = {
  1: "Barc",
  2: "Real",
  3: "VIP",
  4: "Green",
  5: "Blue",
  6: "Euro",
};

const WORKING_DAY_START_HOUR = 6; // 06:00

const STORAGE_KEYS = {
  vercracList: "gameclub-vercrac-list",
  pahacList: "gameclub-pahac-list",
} as const;

type ListItem = { id?: string; text: string; deleted?: boolean };

/** True if session overlaps the working day for filterDate: filterDate 06:00 .. (filterDate+1) 06:00. E.g. 15.03 → 15.03 06:00 till 16.03 06:00 (so sessions after 06:00 on 15.03 appear under 15.03). */
function isInWorkingDay(entry: HistoryEntry, filterDate: string): boolean {
  const [y, m, d] = filterDate.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, WORKING_DAY_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d + 1, WORKING_DAY_START_HOUR, 0, 0, 0);
  const start = new Date(entry.start).getTime();
  const end = new Date(entry.end).getTime();
  return start < dayEnd.getTime() && end > dayStart.getTime();
}

/** Placeholder logo – replace with <img src="/your-logo.svg" /> when you have the asset */
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

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<"settings" | "history">("history");

  // If user is viewer, ensure they can only see history tab
  useEffect(() => {
    if (userRole === "viewer" && adminTab === "settings") {
      setAdminTab("history");
    }
  }, [userRole, adminTab]);
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<HistoryEntry | null>(null);
  const [filterDate, setFilterDate] = useState<string>(() => {
    const now = new Date();
    const todayAt6 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), WORKING_DAY_START_HOUR, 0, 0, 0);
    // Before 06:00 → show yesterday's day (sessions from yesterday 06:00 to today 06:00). From 06:00 → show today (sessions from today 06:00 to tomorrow 06:00).
    const ref = now < todayAt6 ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
    const y = ref.getFullYear();
    const m = String(ref.getMonth() + 1).padStart(2, "0");
    const d = String(ref.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [historyVercracList, setHistoryVercracList] = useState<ListItem[]>([]);
  const [historyPahacList, setHistoryPahacList] = useState<ListItem[]>([]);

  // Load Վերցրած and Պահած for the selected day from localStorage (when on history tab)
  useEffect(() => {
    if (typeof window === "undefined" || !filterDate) {
      setHistoryVercracList([]);
      setHistoryPahacList([]);
      return;
    }
    try {
      const rawVercrac = window.localStorage.getItem(`${STORAGE_KEYS.vercracList}-${filterDate}`);
      setHistoryVercracList(rawVercrac ? (JSON.parse(rawVercrac) as ListItem[]) : []);
      const rawPahac = window.localStorage.getItem(`${STORAGE_KEYS.pahacList}-${filterDate}`);
      setHistoryPahacList(rawPahac ? (JSON.parse(rawPahac) as ListItem[]) : []);
    } catch {
      setHistoryVercracList([]);
      setHistoryPahacList([]);
    }
  }, [filterDate]);

  // Load room prices from database
  const loadRoomPrices = useCallback(async () => {
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
      // Continue with defaaasdult prices if fetch fails
    }
  }, []);

  // Check auth on mount and load prices
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedAuth = window.localStorage.getItem("gameclub-admin-authed");
    const savedRole = window.localStorage.getItem("gameclub-user-role") as UserRole | null;
    if (savedAuth === "true" && savedRole) {
      setIsAuthed(true);
      setUserRole(savedRole);
    }
    loadRoomPrices();
  }, [loadRoomPrices]);

  // Don't auto-save prices - user will click save button

  // Fetch history when authenticated
  const fetchHistory = useCallback(async () => {
    if (!isAuthed) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) {
        throw new Error("Failed to load history");
      }
      const data: HistoryEntry[] = await res.json();
      setHistory(data);
    } catch (err) {
      setHistoryError("Could not load history");
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, [isAuthed]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleLogin = () => {
    let role: UserRole | null = null;

    if (passwordInput === ADMIN_PASSWORD) {
      role = "admin";
    } else if (passwordInput === VIEWER_PASSWORD) {
      role = "viewer";
    }

    if (role) {
      setIsAuthed(true);
      setUserRole(role);
      setLoginError(null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("gameclub-admin-authed", "true");
        window.localStorage.setItem("gameclub-user-role", role);
      }
    } else {
      setLoginError("Wrong password. Please try again.");
    }
  };

  const handleLogout = () => {
    setIsAuthed(false);
    setUserRole(null);
    setPasswordInput("");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("gameclub-admin-authed");
      window.localStorage.removeItem("gameclub-user-role");
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions?id=${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete session");
      }

      setHistory((prev) => prev.filter((entry) => entry.id !== sessionId));
      setDeleteConfirmEntry(null);
    } catch (err) {
      console.error("Failed to delete session", err);
      alert("Failed to delete session. Please try again.");
    }
  };

  const handlePriceChange = (roomId: number, value: string) => {
    const next = Number(value);
    if (Number.isNaN(next) || next < 0) return;
    setRooms((prev) =>
      prev.map((room) =>
        room.id === roomId ? { ...room, pricePerHour: next } : room,
      ),
    );
  };

  const handleSavePrices = async () => {
    try {
      const prices: Record<number, number> = {};
      rooms.forEach((room) => {
        prices[room.id] = room.pricePerHour;
      });

      const res = await fetch("/api/room-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });

      if (!res.ok) {
        throw new Error("Failed to save prices");
      }

      setSaveMessage("Prices saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save prices", err);
      setSaveMessage("Failed to save prices. Please try again.");
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  if (!isAuthed) {
    return (
      <div className="relative flex min-h-screen justify-between gap-4 px-4 py-10 text-slate-900">
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1f1f1f 100%),
              radial-gradient(ellipse 70% 60% at 50% 50%, rgba(60, 60, 60, 0.4) 0%, transparent 70%)
            `,
          }}
          aria-hidden
        />
        <div className="relative z-10 flex flex-1 items-center justify-center">
          <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200/80">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Admin Access</p>
            <h1 className="text-3xl font-semibold text-slate-900">Login</h1>
            <p className="text-sm text-slate-600">
              Enter admin or viewer password to access the panel.
            </p>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Password
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </label>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <button
              onClick={handleLogin}
              className="w-full rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Login as admin
            </button>
            <Link
              href="/"
              className="block w-full rounded-full border border-slate-300 px-4 py-2 text-center text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Go to rooms
            </Link>
          </div>
        </main>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen justify-between gap-4 px-4 py-10 text-slate-900">
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 50%, #1f1f1f 100%),
            radial-gradient(ellipse 70% 60% at 50% 50%, rgba(60, 60, 60, 0.4) 0%, transparent 70%)
          `,
        }}
        aria-hidden
      />
      <div className="relative z-10 flex flex-1 items-stretch justify-center overflow-hidden">
        <main className="w-full max-w-5xl overflow-auto rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-200/80">
        <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Go to rooms
            </Link>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleLogout}
            className="absolute right-0 top-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            title="Log out"
            aria-label="Log out"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setAdminTab("history")}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                adminTab === "history"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              History
            </button>
            {userRole === "admin" && (
              <button
                onClick={() => setAdminTab("settings")}
                className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  adminTab === "settings"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                Settings
              </button>
            )}
          </nav>
        </div>

        {/* History Tab */}
        {adminTab === "history" && (() => {
              const filteredForHeader = filterDate
                ? history.filter((entry) => isInWorkingDay(entry, filterDate))
                : history;
              const totalCash = filteredForHeader
                .filter((e) => !e.paidByCard)
                .reduce((sum, e) => sum + e.priceAmd, 0);
              const totalCard = filteredForHeader
                .filter((e) => e.paidByCard)
                .reduce((sum, e) => sum + e.priceAmd, 0);
              return (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-slate-800">
                  Cash: <span className="text-emerald-700">AMD {totalCash.toFixed(2)}</span>
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  Card: <span className="text-blue-600">AMD {totalCard.toFixed(2)}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  aria-label="Filter by date"
                />
                {filterDate && (
                  <button
                    onClick={() => setFilterDate("")}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {(() => {
              const filteredHistory = filterDate
                ? history.filter((entry) => isInWorkingDay(entry, filterDate))
                : history;

              if (historyLoading) {
                return (
                  <p className="px-6 py-4 text-sm text-slate-600">Loading history…</p>
                );
              }

              if (historyError) {
                return (
                  <p className="px-6 py-4 text-sm text-red-600">{historyError}</p>
                );
              }

              if (history.length === 0) {
                return (
                  <p className="px-6 py-4 text-sm text-slate-600">
                    No finished sessions yet. Stop a room to record it.
                  </p>
                );
              }

              if (filteredHistory.length === 0 && filterDate) {
                return (
                  <p className="px-6 py-4 text-sm text-slate-600">
                    No sessions found for the selected date.
                  </p>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-slate-800">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold">Room</th>
                        <th className="px-4 py-3 text-left font-semibold">Start</th>
                        <th className="px-4 py-3 text-left font-semibold">End</th>
                        <th className="px-4 py-3 text-left font-semibold">Elapsed</th>
                        <th className="px-4 py-3 text-left font-semibold">Price (AMD)</th>
                        {userRole === "admin" && (
                          <th className="px-4 py-3 text-left font-semibold">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-slate-100 transition hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 font-semibold text-indigo-700">
                            {entry.roomName}
                          </td>
                          <td className="px-4 py-3">
                            {filterDate
                              ? formatTimeOnly(new Date(entry.start))
                              : formatDateTimeWithMonthAndWeek(new Date(entry.start))}
                          </td>
                          <td className="px-4 py-3">
                            {filterDate
                              ? formatTimeOnly(new Date(entry.end))
                              : formatDateTimeWithMonthAndWeek(new Date(entry.end))}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">
                            {formatDuration(entry.durationMs)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-700">
                            <span className="inline-flex items-center gap-1.5">
                              AMD {entry.priceAmd.toFixed(2)}
                              {entry.paidByCard && (
                                <svg className="h-7 w-8 shrink-0 text-blue-600" viewBox="0 0 48 48" fill="currentColor" aria-label="Card payment">
                                  <path d="M43,8H5a2.9,2.9,0,0,0-3,3V37a2.9,2.9,0,0,0,3,3H43a2.9,2.9,0,0,0,3-3V11A2.9,2.9,0,0,0,43,8ZM42,36H6V12H42Z" />
                                  <path d="M30.6,28.9H33l.3-.2c.3-.7.4-1.2.5-1.3h3.4a6.1,6.1,0,0,1,.3,1.3l.3.2h1.9c.1,0,.2,0,.2-.1a.4.4,0,0,0,.1-.3l-2.1-9.3c0-.2-.1-.3-.2-.3H35.8a1.4,1.4,0,0,0-1.4.9l-3.8,8.7C30.5,28.7,30.6,28.8,30.6,28.9ZM36,21.7l.2.9.6,2.9H34.6Z" />
                                  <path d="M23.3,28.5a10,10,0,0,0,2.6.5h0c2.8,0,4.5-1.3,4.6-3.3s-.7-2-2.2-2.6-1.5-.8-1.5-1.2.5-.9,1.5-.9h.1a3.2,3.2,0,0,1,1.7.4h.3c.1,0,.1-.1.1-.2l.3-1.4a.5.5,0,0,0-.2-.4,9.5,9.5,0,0,0-2.1-.3c-2.6,0-4.4,1.3-4.4,3.2s1.3,2.2,2.3,2.6,1.3.8,1.3,1.2-.8,1-1.5,1a5.7,5.7,0,0,1-2.4-.5.2.2,0,0,0-.3,0c-.1,0-.1.1-.2.2l-.2,1.5C23.1,28.3,23.1,28.5,23.3,28.5Z" />
                                  <path d="M8.2,19.6a8.8,8.8,0,0,1,4.1,2.9h.3c.2-.1.2-.2.2-.4l-.5-2.4h0a1.1,1.1,0,0,0-1.2-.8H8.3a.3.3,0,0,0-.3.3Z" />
                                  <path d="M18.6,28.9H21c.1,0,.2-.1.2-.3l1.6-9.3v-.3H20.5a.3.3,0,0,0-.3.3l-1.6,9.3Z" />
                                  <path d="M10.3,21.2H10c-.1,0-.2.2-.2.3l2.1,7.3.3.2h2.5a.2.2,0,0,0,.2-.2l4-9.4c.1,0,.1-.2,0-.2s-.1-.2-.2-.2H16.5c-.2,0-.3.1-.3.2l-2.6,6.6-.3-1h0A10.2,10.2,0,0,0,10.3,21.2Z" />
                                </svg>
                              )}
                            </span>
                          </td>
                          {userRole === "admin" && (
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setDeleteConfirmEntry(entry)}
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                                title="Delete this session"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        );})()}

        {/* Settings Tab */}
        {adminTab === "settings" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Settings
                </p>
                <h2 className="text-xl font-semibold text-slate-900">Room Prices</h2>
                <p className="text-xs text-slate-500">Set hourly rate for each room</p>
              </div>
            </div>
            <div className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-slate-700">
                        {room.name}
                      </label>
                      {room.name === "Barc" ? (
                        <img
                          src="/logos/barc.png"
                          alt=""
                          className="h-16 w-16 flex-shrink-0 object-contain"
                        />
                      ) : room.name === "Real" ? (
                        <img
                          src="/logos/real.png"
                          alt=""
                          className="h-16 w-16 flex-shrink-0 object-contain"
                        />
                      ) : room.name === "Euro" ? (
                        <img
                          src="/logos/euro.png"
                          alt=""
                          className="h-16 w-16 flex-shrink-0 object-contain"
                        />
                      ) : room.name === "VIP" ? (
                        <span className="inline-flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5">
                          <img
                            src="/logos/vip.png"
                            alt=""
                            className="h-16 w-16 object-contain"
                          />
                        </span>
                      ) : room.name === "Green" ? (
                        <span className="h-16 w-16 flex-shrink-0 rounded-full bg-green-500" />
                      ) : room.name === "Blue" ? (
                        <span className="h-16 w-16 flex-shrink-0 rounded-full bg-blue-500" />
                      ) : (
                        <LogoIcon className="h-16 w-16 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">AMD</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={room.pricePerHour}
                        onChange={(e) => handlePriceChange(room.id, e.target.value)}
                        className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
                        aria-label={`${room.name} hourly price`}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-6">
                {saveMessage && (
                  <p className="text-sm font-medium text-emerald-600">{saveMessage}</p>
                )}
                {!saveMessage && <div />}
                <button
                  onClick={handleSavePrices}
                  className="rounded-full bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  Save Prices
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      </div>

      {adminTab === "history" && (
        <aside className="relative z-10 hidden w-64 flex-shrink-0 flex-col border-l border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm xl:flex">
          <div className="flex flex-1 flex-col gap-0 p-4">
            <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <h2 className="text-lg font-semibold text-blue-600">Վերցրած</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {filterDate ? `Day ${filterDate}` : "Select a date"}
              </p>
              {historyVercracList.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {historyVercracList.map((item, i) => (
                    <li key={item.id ?? i} className="border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                      <span className={`font-medium text-slate-700 ${item.deleted ? "line-through opacity-60" : ""}`}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No items for this day.</p>
              )}
            </section>
            <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <h2 className="text-lg font-semibold text-red-600">Պահած</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {filterDate ? `Day ${filterDate}` : "Select a date"}
              </p>
              {historyPahacList.length > 0 ? (
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {historyPahacList.map((item, i) => (
                    <li key={item.id ?? i} className="border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                      <span className={`font-medium text-slate-700 ${item.deleted ? "line-through opacity-60" : ""}`}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No items for this day.</p>
              )}
            </section>
          </div>
        </aside>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmEntry(null)}
            aria-hidden
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl ring-1 ring-slate-200/80">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-900">
                  Delete session?
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  This action cannot be undone. The session will be permanently removed from history.
                </p>
                <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p><span className="font-medium text-slate-500">Room:</span> {deleteConfirmEntry.roomName}</p>
                  <p className="mt-1"><span className="font-medium text-slate-500">Start – End:</span> {formatTimeOnly(new Date(deleteConfirmEntry.start))} – {formatTimeOnly(new Date(deleteConfirmEntry.end))}</p>
                  <p className="mt-1"><span className="font-medium text-slate-500">Price:</span> AMD {deleteConfirmEntry.priceAmd.toFixed(2)}</p>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmEntry(null)}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(deleteConfirmEntry.id)}
                    className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

