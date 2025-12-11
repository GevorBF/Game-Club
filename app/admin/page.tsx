"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { HistoryEntry, Room } from "../types";
import { formatDuration, formatDateTime } from "../types";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "admin123";
const VIEWER_PASSWORD = process.env.NEXT_PUBLIC_VIEWER_PASSWORD || "viewer123";

type UserRole = "admin" | "viewer";

const ROOM_NAMES: Record<number, string> = {
  1: "Barc",
  2: "Real",
  3: "Euro",
  4: "VIP",
  5: "Green",
  6: "Blue",
  7: "1",
};

export default function AdminPage() {
  const router = useRouter();
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState<string>(() => {
    // Set default to today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

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
    if (!confirm("Are you sure you want to delete this session? This action cannot be undone.")) {
      return;
    }

    try {
      const res = await fetch(`/api/sessions?id=${sessionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete session");
      }

      setHistory((prev) => prev.filter((entry) => entry.id !== sessionId));
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 px-4 py-10 text-slate-900">
        <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
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
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 px-4 py-10 text-slate-900">
      <main className="w-full max-w-5xl rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Go to rooms
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Admin panel
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-600">
              {userRole === "admin"
                ? "Manage room prices and view session history."
                : "View session history (read-only)."}
            </p>
            {userRole && (
              <p className="text-xs text-slate-500 mt-1">
                Role: <span className="font-semibold capitalize">{userRole}</span>
              </p>
            )}
          </div>
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
        {adminTab === "history" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  History
                </p>
                <h2 className="text-xl font-semibold text-slate-900">Completed sessions</h2>
                <p className="text-xs text-slate-500">Saved in the database</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <span>Filter by date:</span>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </label>
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
              // Filter history by date if filterDate is set
              const filteredHistory = filterDate
                ? history.filter((entry) => {
                    const entryDate = new Date(entry.start);
                    const filterDateObj = new Date(filterDate);
                    return (
                      entryDate.getFullYear() === filterDateObj.getFullYear() &&
                      entryDate.getMonth() === filterDateObj.getMonth() &&
                      entryDate.getDate() === filterDateObj.getDate()
                    );
                  })
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
                          <td className="px-4 py-3">{formatDateTime(new Date(entry.start))}</td>
                          <td className="px-4 py-3">{formatDateTime(new Date(entry.end))}</td>
                          <td className="px-4 py-3 font-mono text-slate-700">
                            {formatDuration(entry.durationMs)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-700">
                            AMD {entry.priceAmd.toFixed(2)}
                          </td>
                          {userRole === "admin" && (
                            <td className="px-4 py-3">
                              <button
                                onClick={() => handleDeleteSession(entry.id)}
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
        )}

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
                    <label className="text-sm font-medium text-slate-700">
                      {room.name}
                    </label>
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
                      <span className="text-xs text-slate-500">/hr</span>
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
  );
}

