"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../lib/supabase-browser";

type RoomPreview = {
  slug: string;
  title: string;
  created_at: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const hasSupabaseEnv = Boolean(supabase);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [rooms, setRooms] = useState<RoomPreview[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadRooms = useCallback(async (): Promise<void> => {
    if (!supabase) {
      setRooms([]);
      return;
    }

    const { data } = await supabase
      .from("rooms")
      .select("slug,title,created_at")
      .order("created_at", { ascending: false })
      .limit(24);

    setRooms(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    const bootstrap = async (): Promise<void> => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setNotice(error.message);
        }
      } else if (tokenHash && (type === "signup" || type === "magiclink")) {
        const { error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        });
        if (error) {
          setNotice(error.message);
        }
      }

      if (code || tokenHash) {
        // Remove auth params so refreshes don't repeat the exchange call.
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, "", cleanUrl);
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setAuthReady(true);
      await loadRooms();
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadRooms();
    });

    return () => subscription.unsubscribe();
  }, [loadRooms, supabase]);

  useEffect(() => {
    if (!supabase || !session?.user) {
      setDisplayName("");
      return;
    }

    const hydrateProfile = async (): Promise<void> => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle();

      const fallback = (session.user.email ?? "Player").split("@")[0];
      setDisplayName(data?.display_name ?? fallback);
    };

    void hydrateProfile();
  }, [session, supabase]);

  const sendMagicLink = async (): Promise<void> => {
    if (!supabase) {
      setNotice("Missing Supabase environment variables.");
      return;
    }

    if (!email.trim()) {
      setNotice("Enter your email first.");
      return;
    }

    setBusy(true);
    setNotice("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    setBusy(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    setNotice("Magic link sent. Check your inbox and open it in this browser.");
  };

  const saveProfile = async (): Promise<void> => {
    if (!supabase || !session?.user) {
      return;
    }

    const cleanName = displayName.trim();
    if (!cleanName) {
      setNotice("Display name cannot be empty.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        display_name: cleanName,
      },
      { onConflict: "id" },
    );
    setBusy(false);

    setNotice(error ? error.message : "Display name updated.");
  };

  const createRoom = async (): Promise<void> => {
    if (!supabase || !session?.user) {
      setNotice("Sign in first to create a room.");
      return;
    }

    const cleanTitle = roomTitle.trim();
    if (!cleanTitle) {
      setNotice("Room title is required.");
      return;
    }

    const base = slugify(cleanTitle) || "arena-room";
    const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;

    setBusy(true);
    const { error } = await supabase.from("rooms").insert({
      title: cleanTitle,
      slug,
      created_by: session.user.id,
    });
    setBusy(false);

    if (error) {
      setNotice(error.message);
      return;
    }

    router.push(`/room/${slug}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_10%_10%,rgba(255,209,102,0.3),transparent_30%),radial-gradient(circle_at_90%_15%,rgba(76,201,240,0.28),transparent_34%),radial-gradient(circle_at_70%_90%,rgba(255,92,135,0.2),transparent_28%),#f6f4ef] px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(42,43,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(42,43,42,0.04)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="glass-panel rounded-3xl p-5 shadow-xl shadow-black/10 sm:p-8">
          <p className="text-xs uppercase tracking-[0.22em] text-stone-600">IdeaForge Arena</p>
          <h1 className="mt-2 text-4xl font-black leading-tight text-stone-900 sm:text-5xl">
            Public Idea Rooms
            <span className="block text-coral-700">With Real Community Voting</span>
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-stone-700 sm:text-base">
            Create a room, share the link, and run live idea battles where authenticated users improve, vote, and build champions together.
          </p>
        </header>

        {!hasSupabaseEnv && (
          <section className="glass-panel rounded-3xl border border-dashed border-coral-400 p-4 text-sm text-stone-700">
            Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.
          </section>
        )}

        <main className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="glass-panel rounded-3xl p-5 shadow-xl shadow-black/10 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Authentication</h2>
            {!authReady && <p className="mt-2 text-sm text-stone-600">Checking session...</p>}

            {authReady && !session && (
              <div className="mt-4 space-y-3">
                <input
                  className="w-full rounded-xl border border-stone-300/70 bg-white/75 px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <button
                  className="w-full rounded-xl bg-ocean-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-ocean-600 disabled:opacity-50"
                  disabled={busy}
                  onClick={sendMagicLink}
                >
                  Send Magic Link
                </button>
              </div>
            )}

            {authReady && session && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-stone-700">
                  Signed in as <strong>{session.user.email}</strong>
                </p>
                <input
                  className="w-full rounded-xl border border-stone-300/70 bg-white/75 px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                  value={displayName}
                  maxLength={24}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Display name"
                />
                <div className="flex gap-3">
                  <button
                    className="flex-1 rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:opacity-50"
                    disabled={busy}
                    onClick={saveProfile}
                  >
                    Save Name
                  </button>
                  <button
                    className="flex-1 rounded-xl border border-stone-300 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-200 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (supabase) {
                        void supabase.auth.signOut();
                      }
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}

            {notice && (
              <p className="mt-3 rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm text-stone-700">{notice}</p>
            )}
          </section>

          <section className="glass-panel rounded-3xl p-5 shadow-xl shadow-black/10 sm:p-6">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Create Room</h2>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-stone-300/70 bg-white/75 px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                value={roomTitle}
                maxLength={80}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Ex: Hackathon MVP Ideas"
              />
              <button
                className="w-full rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:opacity-50"
                onClick={createRoom}
                disabled={busy || !session}
              >
                Create Shareable Room
              </button>
              {!session && <p className="text-xs text-stone-600">Sign in to create a room.</p>}
            </div>
          </section>
        </main>

        <section className="glass-panel rounded-3xl p-5 shadow-xl shadow-black/10 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Public Rooms</h2>
            <button
              className="rounded-xl border border-stone-300 bg-white/70 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-white"
              onClick={() => void loadRooms()}
            >
              Refresh
            </button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.length === 0 && (
              <p className="rounded-xl border border-dashed border-stone-400/70 bg-white/60 p-3 text-sm text-stone-600">
                No rooms yet. Create one and share it.
              </p>
            )}

            {rooms.map((room) => (
              <Link
                key={room.slug}
                href={`/room/${room.slug}`}
                className="rounded-2xl border border-stone-300/70 bg-white/70 p-4 transition hover:-translate-y-0.5 hover:border-coral-300"
              >
                <p className="line-clamp-2 text-base font-bold text-stone-900">{room.title}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-stone-600">/{room.slug}</p>
                <p className="mt-2 text-xs text-stone-500">Created {relativeTime(room.created_at)}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
