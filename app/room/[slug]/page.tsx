"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../../../lib/supabase-browser";

type DbRoom = {
  id: string;
  slug: string;
  title: string;
  created_at: string;
};

type DbIdea = {
  id: string;
  room_id: string;
  title: string;
  created_by: string;
  champion_version_id: string | null;
  round_end_at: string | null;
  created_at: string;
};

type DbVersion = {
  id: string;
  idea_id: string;
  body: string;
  stage: "original" | "improvement";
  created_by: string;
  created_at: string;
};

type DbBattle = {
  id: string;
  idea_id: string;
  a_version_id: string;
  b_version_id: string;
  status: "open" | "closed";
  winner_version_id: string | null;
  created_at: string;
  closed_at: string | null;
};

type DbVote = {
  battle_id: string;
  voter_id: string;
  pick: "A" | "B";
};

type DbErrorLike = {
  message?: string;
  code?: string;
};

type BattleView = {
  id: string;
  ideaId: string;
  aVersionId: string;
  bVersionId: string;
  status: "open" | "closed";
  winnerVersionId: string | null;
  createdAt: string;
  votesA: number;
  votesB: number;
  voters: string[];
};

type IdeaView = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  championVersionId: string | null;
  roundEndAt: string | null;
  versions: DbVersion[];
  battles: BattleView[];
};

const ROUND_SECONDS = 60;
const BATTLE_VOTE_TARGET = 5;

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

function userLabel(userId: string, names: Record<string, string>): string {
  return names[userId] ?? `user-${userId.slice(0, 8)}`;
}

function actionableDbError(context: string, error: DbErrorLike | null | undefined): string {
  const message = (error?.message ?? "").toLowerCase();

  if (error?.code === "42501" || message.includes("row-level security") || message.includes("permission denied")) {
    return `${context} failed due to permissions. Sign in and run supabase/add-rls-policies.sql in Supabase SQL Editor.`;
  }

  if (message.includes("votes_battle_id_voter_id_key") || message.includes("duplicate key value violates unique constraint")) {
    return "You already voted in this battle.";
  }

  if (message.includes("jwt") || message.includes("auth") || message.includes("not authenticated")) {
    return `${context} failed because your session expired. Sign in again and retry.`;
  }

  return error?.message ?? `${context} failed. Please retry.`;
}

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const hasSupabaseEnv = Boolean(supabase);

  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<DbRoom | null>(null);
  const [ideas, setIdeas] = useState<IdeaView[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [notice, setNotice] = useState("");
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaText, setNewIdeaText] = useState("");
  const [improvementDraft, setImprovementDraft] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadRoomData = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    const silent = options?.silent ?? false;

    if (!supabase || !slug) {
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    const roomResult = await supabase
      .from("rooms")
      .select("id,slug,title,created_at")
      .eq("slug", slug)
      .maybeSingle();

    if (roomResult.error || !roomResult.data) {
      setRoom(null);
      setIdeas([]);
      setLoading(false);
      return;
    }

    const roomRow = roomResult.data as DbRoom;
    setRoom(roomRow);

    const ideasResult = await supabase
      .from("ideas")
      .select("id,room_id,title,created_by,champion_version_id,round_end_at,created_at")
      .eq("room_id", roomRow.id)
      .order("created_at", { ascending: false });

    if (ideasResult.error) {
      setNotice(ideasResult.error.message);
      setIdeas([]);
      setLoading(false);
      return;
    }

    const ideaRows = (ideasResult.data ?? []) as DbIdea[];
    if (ideaRows.length === 0) {
      setIdeas([]);
      setSelectedIdeaId(null);
      setLoading(false);
      return;
    }

    const ideaIds = ideaRows.map((idea) => idea.id);

    const [versionResult, battleResult] = await Promise.all([
      supabase
        .from("versions")
        .select("id,idea_id,body,stage,created_by,created_at")
        .in("idea_id", ideaIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("battles")
        .select("id,idea_id,a_version_id,b_version_id,status,winner_version_id,created_at,closed_at")
        .in("idea_id", ideaIds)
        .order("created_at", { ascending: false }),
    ]);

    if (versionResult.error || battleResult.error) {
      setNotice(versionResult.error?.message ?? battleResult.error?.message ?? "Failed to load room data.");
      setLoading(false);
      return;
    }

    const versionRows = (versionResult.data ?? []) as DbVersion[];
    const battleRows = (battleResult.data ?? []) as DbBattle[];

    const battleIds = battleRows.map((battle) => battle.id);
    let voteRows: DbVote[] = [];
    if (battleIds.length > 0) {
      const voteResult = await supabase
        .from("votes")
        .select("battle_id,voter_id,pick")
        .in("battle_id", battleIds);
      voteRows = (voteResult.data ?? []) as DbVote[];
    }

    const votesByBattle = voteRows.reduce<Record<string, DbVote[]>>((acc, vote) => {
      acc[vote.battle_id] = [...(acc[vote.battle_id] ?? []), vote];
      return acc;
    }, {});

    const ideasView: IdeaView[] = ideaRows.map((idea) => {
      const ideaVersions = versionRows.filter((version) => version.idea_id === idea.id);
      const ideaBattles = battleRows
        .filter((battle) => battle.idea_id === idea.id)
        .map((battle) => {
          const votes = votesByBattle[battle.id] ?? [];
          return {
            id: battle.id,
            ideaId: battle.idea_id,
            aVersionId: battle.a_version_id,
            bVersionId: battle.b_version_id,
            status: battle.status,
            winnerVersionId: battle.winner_version_id,
            createdAt: battle.created_at,
            votesA: votes.filter((vote) => vote.pick === "A").length,
            votesB: votes.filter((vote) => vote.pick === "B").length,
            voters: votes.map((vote) => vote.voter_id),
          };
        });

      return {
        id: idea.id,
        title: idea.title,
        createdBy: idea.created_by,
        createdAt: idea.created_at,
        championVersionId: idea.champion_version_id,
        roundEndAt: idea.round_end_at,
        versions: ideaVersions,
        battles: ideaBattles,
      };
    });

    const profileIds = new Set<string>();
    ideasView.forEach((idea) => {
      profileIds.add(idea.createdBy);
      idea.versions.forEach((version) => profileIds.add(version.created_by));
      idea.battles.forEach((battle) => battle.voters.forEach((voter) => profileIds.add(voter)));
    });

    const ids = Array.from(profileIds);
    if (ids.length > 0) {
      const profileResult = await supabase.from("profiles").select("id,display_name").in("id", ids);
      const mapped = (profileResult.data ?? []).reduce<Record<string, string>>(
        (acc, row: { id: string; display_name: string }) => {
          acc[row.id] = row.display_name;
          return acc;
        },
        {},
      );
      setNames(mapped);
    } else {
      setNames({});
    }

    setIdeas(ideasView);
    setSelectedIdeaId((current) => current ?? ideasView[0]?.id ?? null);
    setLoading(false);
  }, [slug, supabase]);

  const finalizeEligibleBattles = useCallback(async (): Promise<void> => {
    if (!supabase || !session?.user || !room) {
      return;
    }

    let changed = false;
    for (const idea of ideas) {
      for (const battle of idea.battles) {
        if (battle.status === "closed") {
          continue;
        }

        const expired = idea.roundEndAt ? new Date(idea.roundEndAt).getTime() <= Date.now() : false;
        const reachedTarget = battle.votesA >= BATTLE_VOTE_TARGET || battle.votesB >= BATTLE_VOTE_TARGET;

        if (!expired && !reachedTarget) {
          continue;
        }

        const winnerVersionId = battle.votesB > battle.votesA ? battle.bVersionId : battle.aVersionId;

        const updateBattle = await supabase
          .from("battles")
          .update({
            status: "closed",
            winner_version_id: winnerVersionId,
            closed_at: new Date().toISOString(),
          })
          .eq("id", battle.id)
          .eq("status", "open");

        if (!updateBattle.error) {
          changed = true;
          await supabase
            .from("ideas")
            .update({
              champion_version_id: winnerVersionId,
              round_end_at: null,
            })
            .eq("id", idea.id);
        }
      }
    }

    if (changed) {
      await loadRoomData({ silent: true });
    }
  }, [ideas, loadRoomData, room, session?.user, supabase]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const initialize = async (): Promise<void> => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      await loadRoomData();
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadRoomData({ silent: true });
    });

    return () => subscription.unsubscribe();
  }, [loadRoomData, supabase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTick(Date.now());
      void finalizeEligibleBattles();
    }, 1000);

    const poll = window.setInterval(() => {
      void loadRoomData({ silent: true });
    }, 5000);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(poll);
    };
  }, [finalizeEligibleBattles, loadRoomData]);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedIdeaId) ?? null,
    [ideas, selectedIdeaId],
  );

  const openBattle = selectedIdea?.battles.find((battle) => battle.status === "open") ?? null;
  const championVersion = selectedIdea
    ? selectedIdea.versions.find((version) => version.id === selectedIdea.championVersionId) ?? null
    : null;

  const roundSecondsLeft = selectedIdea?.roundEndAt
    ? Math.max(0, Math.ceil((new Date(selectedIdea.roundEndAt).getTime() - nowTick) / 1000))
    : 0;

  const leaderboard = useMemo(() => {
    const points = new Map<string, number>();

    ideas.forEach((idea) => {
      idea.versions.forEach((version) => {
        points.set(version.created_by, (points.get(version.created_by) ?? 0) + 2);
      });

      idea.battles.forEach((battle) => {
        if (battle.winnerVersionId) {
          const winner = idea.versions.find((version) => version.id === battle.winnerVersionId);
          if (winner) {
            points.set(winner.created_by, (points.get(winner.created_by) ?? 0) + 5);
          }
        }

        battle.voters.forEach((voter) => {
          points.set(voter, (points.get(voter) ?? 0) + 1);
        });
      });
    });

    return Array.from(points.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [ideas]);

  const canStartRound = Boolean(
    session &&
      selectedIdea &&
      !openBattle &&
      !(selectedIdea.roundEndAt && roundSecondsLeft > 0),
  );

  const startRoundHint = !session
    ? "Sign in to start a round."
    : openBattle
      ? "An active battle is running. Vote to close it first."
      : selectedIdea?.roundEndAt && roundSecondsLeft > 0
        ? `Round already live: ${roundSecondsLeft}s remaining.`
        : "Start a 60s round to collect challengers.";

  const canSubmitChallenger = Boolean(
    session &&
      selectedIdea &&
      selectedIdea.roundEndAt &&
      roundSecondsLeft > 0 &&
      !openBattle &&
      improvementDraft.trim(),
  );

  const submitHint = !session
    ? "Sign in to submit improvements."
    : openBattle
      ? "A battle is active. Vote now, then submit the next challenger."
      : !selectedIdea?.roundEndAt || roundSecondsLeft <= 0
        ? "Start a round to submit improvements."
        : !improvementDraft.trim()
          ? "Write your challenger text to enable submit."
          : `Round closes in ${roundSecondsLeft}s`;

  const createIdea = async (): Promise<void> => {
    if (!supabase || !session?.user || !room) {
      setNotice("Sign in first to post ideas.");
      return;
    }

    const cleanTitle = newIdeaTitle.trim();
    const cleanText = newIdeaText.trim();
    if (!cleanTitle || !cleanText) {
      setNotice("Title and idea text are required.");
      return;
    }

    const ideaResult = await supabase
      .from("ideas")
      .insert({
        room_id: room.id,
        title: cleanTitle,
        created_by: session.user.id,
      })
      .select("id")
      .single();

    if (ideaResult.error || !ideaResult.data) {
      setNotice(actionableDbError("Creating idea", ideaResult.error));
      return;
    }

    const ideaId = (ideaResult.data as { id: string }).id;
    const versionResult = await supabase
      .from("versions")
      .insert({
        idea_id: ideaId,
        body: cleanText,
        stage: "original",
        created_by: session.user.id,
      })
      .select("id")
      .single();

    if (versionResult.error || !versionResult.data) {
      setNotice(actionableDbError("Creating initial version", versionResult.error));
      return;
    }

    const championUpdate = await supabase
      .from("ideas")
      .update({ champion_version_id: (versionResult.data as { id: string }).id })
      .eq("id", ideaId);

    if (championUpdate.error) {
      setNotice(actionableDbError("Updating champion", championUpdate.error));
      return;
    }

    setNewIdeaTitle("");
    setNewIdeaText("");
    setNotice("");
    await loadRoomData();
    setSelectedIdeaId(ideaId);
  };

  const startRound = async (): Promise<void> => {
    if (!supabase || !session?.user || !selectedIdea) {
      return;
    }

    const { error } = await supabase
      .from("ideas")
      .update({ round_end_at: new Date(Date.now() + ROUND_SECONDS * 1000).toISOString() })
      .eq("id", selectedIdea.id);

    if (error) {
      setNotice(actionableDbError("Starting round", error));
      return;
    }

    setNotice("");
    await loadRoomData();
  };

  const submitImprovement = async (): Promise<void> => {
    if (!supabase || !session?.user || !selectedIdea || !selectedIdea.championVersionId) {
      setNotice("Sign in and select an active idea.");
      return;
    }

    if (!selectedIdea.roundEndAt || new Date(selectedIdea.roundEndAt).getTime() < Date.now()) {
      setNotice("Start a new round before submitting improvements.");
      return;
    }

    if (openBattle) {
      setNotice("There is already an active battle for this idea.");
      return;
    }

    const cleanBody = improvementDraft.trim();
    if (!cleanBody) {
      setNotice("Improvement text is required.");
      return;
    }

    const versionResult = await supabase
      .from("versions")
      .insert({
        idea_id: selectedIdea.id,
        body: cleanBody,
        stage: "improvement",
        created_by: session.user.id,
      })
      .select("id")
      .single();

    if (versionResult.error || !versionResult.data) {
      setNotice(actionableDbError("Creating improvement", versionResult.error));
      return;
    }

    const newVersionId = (versionResult.data as { id: string }).id;

    const battleResult = await supabase.from("battles").insert({
      idea_id: selectedIdea.id,
      a_version_id: selectedIdea.championVersionId,
      b_version_id: newVersionId,
      status: "open",
    });

    if (battleResult.error) {
      setNotice(actionableDbError("Creating battle", battleResult.error));
      return;
    }

    setImprovementDraft("");
    await loadRoomData();
  };

  const vote = async (pick: "A" | "B"): Promise<void> => {
    if (!supabase || !session?.user || !openBattle) {
      setNotice("Sign in to vote.");
      return;
    }

    const voteResult = await supabase.from("votes").insert({
      battle_id: openBattle.id,
      voter_id: session.user.id,
      pick,
    });

    if (voteResult.error) {
      setNotice(actionableDbError("Voting", voteResult.error));
      return;
    }

    setNotice("");
    await loadRoomData();
    await finalizeEligibleBattles();
  };

  const copyShareLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(window.location.href);
    setNotice("Share link copied.");
  };

  if (loading) {
    return <div className="p-6 text-stone-700">Loading room...</div>;
  }

  if (!room) {
    return (
      <div className="p-6 text-stone-700">
        Room not found. Go back to{" "}
        <Link href="/" className="font-semibold text-ocean-700">
          home
        </Link>
        .
      </div>
    );
  }

  const openVersionA =
    selectedIdea && openBattle
      ? selectedIdea.versions.find((version) => version.id === openBattle.aVersionId) ?? null
      : null;
  const openVersionB =
    selectedIdea && openBattle
      ? selectedIdea.versions.find((version) => version.id === openBattle.bVersionId) ?? null
      : null;

  const hasVoted = Boolean(session?.user && openBattle?.voters.includes(session.user.id));

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_5%_5%,rgba(255,209,102,0.32),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(76,201,240,0.26),transparent_28%),radial-gradient(circle_at_70%_90%,rgba(255,92,135,0.2),transparent_28%),#f6f4ef]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(42,43,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(42,43,42,0.04)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="glass-panel rounded-3xl p-5 shadow-xl shadow-black/10 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-600">Room</p>
              <h1 className="mt-1 text-3xl font-black text-stone-900 sm:text-4xl">{room.title}</h1>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-600">/{room.slug}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl border border-stone-300 bg-white/70 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-white"
                onClick={() => void loadRoomData()}
              >
                Refresh
              </button>
              <button
                className="rounded-xl bg-coral-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-coral-500"
                onClick={() => void copyShareLink()}
              >
                Copy Share Link
              </button>
              <Link
                href="/"
                className="rounded-xl border border-stone-300 bg-white/70 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-white"
              >
                Home
              </Link>
            </div>
          </div>

          <div className="mt-4 text-sm text-stone-700">
            {!hasSupabaseEnv && (
              <span>Supabase env vars are missing. Add them in .env.local to enable room data.</span>
            )}
            {hasSupabaseEnv && session?.user ? (
              <span>
                Signed in as <strong>{session.user.email}</strong>
              </span>
            ) : null}
            {hasSupabaseEnv && !session?.user ? (
              <span>Sign in from the home page to post ideas and vote.</span>
            ) : null}
          </div>
          {notice && (
            <p className="mt-3 rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm text-stone-700">{notice}</p>
          )}
        </header>

        <main className="grid gap-6 xl:grid-cols-[20rem_1fr_20rem]">
          <section className="glass-panel rounded-3xl p-4 shadow-xl shadow-black/10 sm:p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Post New Idea</h2>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-stone-300/70 bg-white/75 px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                value={newIdeaTitle}
                onChange={(event) => setNewIdeaTitle(event.target.value)}
                maxLength={90}
                placeholder="Short title"
                disabled={!session}
              />
              <textarea
                className="h-24 w-full rounded-xl border border-stone-300/70 bg-white/75 px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                value={newIdeaText}
                onChange={(event) => setNewIdeaText(event.target.value)}
                maxLength={280}
                placeholder="One-sentence idea"
                disabled={!session}
              />
              <button
                className="w-full rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:opacity-50"
                onClick={() => void createIdea()}
                disabled={!session}
              >
                Launch Idea
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-600">Idea Queue</h3>
              <div className="mt-2 max-h-[24rem] space-y-2 overflow-auto pr-1">
                {ideas.map((idea) => {
                  const selected = selectedIdeaId === idea.id;
                  const champion = idea.versions.find((version) => version.id === idea.championVersionId);
                  return (
                    <button
                      key={idea.id}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-coral-500 bg-coral-50"
                          : "border-stone-300/70 bg-white/65 hover:border-coral-300"
                      }`}
                      onClick={() => {
                        setSelectedIdeaId(idea.id);
                        setImprovementDraft("");
                      }}
                    >
                      <p className="line-clamp-2 text-sm font-bold text-stone-900">{idea.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-stone-700">{champion?.body ?? "No champion"}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.15em] text-stone-500">
                        {idea.versions.length} versions | {idea.battles.length} battles
                      </p>
                    </button>
                  );
                })}
                {ideas.length === 0 && (
                  <p className="rounded-xl border border-dashed border-stone-400/70 bg-white/55 p-3 text-sm text-stone-600">
                    No ideas yet. Create one.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-3xl p-4 shadow-xl shadow-black/10 sm:p-6">
            {!selectedIdea && <p className="text-stone-700">Choose an idea from the queue.</p>}

            {selectedIdea && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-600">Selected Idea</p>
                    <h2 className="mt-1 text-2xl font-black text-stone-900 sm:text-3xl">{selectedIdea.title}</h2>
                    <p className="mt-1 text-xs text-stone-600">
                      by {userLabel(selectedIdea.createdBy, names)} | {relativeTime(selectedIdea.createdAt)}
                    </p>
                  </div>

                  <button
                    className="rounded-xl bg-ocean-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-ocean-600 disabled:opacity-50"
                    onClick={() => void startRound()}
                    disabled={!canStartRound}
                  >
                    {selectedIdea.roundEndAt && roundSecondsLeft > 0
                      ? `Round Live: ${roundSecondsLeft}s`
                      : "Start 60s Round"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-stone-600">{startRoundHint}</p>

                <article className="mt-5 rounded-2xl border border-stone-300/70 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">Current Champion</p>
                  <p className="mt-2 text-lg font-semibold leading-relaxed text-stone-900">{championVersion?.body}</p>
                  {championVersion && (
                    <p className="mt-2 text-sm text-stone-600">by {userLabel(championVersion.created_by, names)}</p>
                  )}
                </article>

                <div className="mt-6 rounded-2xl border border-stone-300/70 bg-white/65 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">Improve This Idea</p>
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-stone-300/70 bg-white px-3 py-2 text-sm outline-none ring-coral-400 transition focus:ring-2"
                    value={improvementDraft}
                    maxLength={320}
                    onChange={(event) => setImprovementDraft(event.target.value)}
                    placeholder="Write a stronger challenger version"
                    disabled={!session}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-stone-600">{submitHint}</p>
                    <button
                      className="rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:opacity-50"
                      disabled={!canSubmitChallenger}
                      onClick={() => void submitImprovement()}
                    >
                      Submit Challenger
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-600">Head-to-Head Vote</p>

                  {!openBattle && (
                    <div className="mt-2 rounded-2xl border border-dashed border-stone-400/70 bg-white/55 p-4 text-sm text-stone-700">
                      No active battle. Submit an improvement during a live round.
                    </div>
                  )}

                  {openBattle && openVersionA && openVersionB && (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <article className="rounded-2xl border border-stone-300/70 bg-white/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-stone-600">Version A</p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-900">{openVersionA.body}</p>
                        <p className="mt-2 text-xs text-stone-600">by {userLabel(openVersionA.created_by, names)}</p>
                        <p className="mt-2 text-sm font-bold text-stone-800">Votes: {openBattle.votesA}</p>
                        <button
                          className="mt-3 w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-800 disabled:opacity-50"
                          onClick={() => void vote("A")}
                          disabled={!session || hasVoted}
                        >
                          Vote A
                        </button>
                      </article>

                      <article className="rounded-2xl border border-coral-300 bg-coral-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-coral-700">Version B</p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-900">{openVersionB.body}</p>
                        <p className="mt-2 text-xs text-stone-600">by {userLabel(openVersionB.created_by, names)}</p>
                        <p className="mt-2 text-sm font-bold text-stone-800">Votes: {openBattle.votesB}</p>
                        <button
                          className="mt-3 w-full rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:opacity-50"
                          onClick={() => void vote("B")}
                          disabled={!session || hasVoted}
                        >
                          Vote B
                        </button>
                      </article>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-600">Evolution Timeline</p>
                  <ol className="mt-3 space-y-2">
                    {[...selectedIdea.versions]
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((version) => {
                        const champion = selectedIdea.championVersionId === version.id;
                        return (
                          <li
                            key={version.id}
                            className={`rounded-xl border px-3 py-3 ${
                              champion ? "border-ocean-500 bg-ocean-50/80" : "border-stone-300/70 bg-white/65"
                            }`}
                          >
                            <p className="text-xs uppercase tracking-[0.14em] text-stone-600">
                              {version.stage} | {relativeTime(version.created_at)} {champion ? "| champion" : ""}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-stone-900">{version.body}</p>
                            <p className="mt-1 text-xs text-stone-600">by {userLabel(version.created_by, names)}</p>
                          </li>
                        );
                      })}
                  </ol>
                </div>
              </>
            )}
          </section>

          <aside className="glass-panel rounded-3xl p-4 shadow-xl shadow-black/10 sm:p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Leaderboard</h2>
            <p className="mt-1 text-xs text-stone-600">Points from versions, wins, and votes.</p>
            <ul className="mt-4 space-y-2">
              {leaderboard.map(([userId, score], index) => (
                <li
                  key={`${userId}-${score}`}
                  className="flex items-center justify-between rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2"
                >
                  <p className="text-sm text-stone-900">
                    <span className="mr-2 text-xs font-bold text-stone-500">#{index + 1}</span>
                    {userLabel(userId, names)}
                  </p>
                  <p className="text-sm font-black text-ocean-700">{score}</p>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-dashed border-stone-400/70 bg-white/55 p-3 text-xs leading-relaxed text-stone-700">
              Battles auto-close at {BATTLE_VOTE_TARGET} votes or when the round timer ends.
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
