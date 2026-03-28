"use client";

import { useEffect, useMemo, useState } from "react";

type Version = {
  id: string;
  body: string;
  author: string;
  createdAt: number;
  stage: "original" | "improvement";
};

type Battle = {
  id: string;
  ideaId: string;
  aVersionId: string;
  bVersionId: string;
  votesA: number;
  votesB: number;
  voters: string[];
  status: "open" | "closed";
  winnerVersionId: string | null;
  createdAt: number;
  closedAt: number | null;
};

type Idea = {
  id: string;
  title: string;
  createdAt: number;
  championVersionId: string;
  roundEndAt: number | null;
  versions: Version[];
  battles: Battle[];
};

type ArenaState = {
  ideas: Idea[];
  selectedIdeaId: string | null;
  profileName: string;
};

const STORAGE_KEY = "ideaforge-arena-v1";
const ROUND_SECONDS = 60;
const BATTLE_VOTE_TARGET = 5;

const sampleState = (): ArenaState => {
  const now = Date.now();

  const ideaAOriginal: Version = {
    id: "v1",
    body: "Help students find 15-minute micro-volunteer tasks near campus.",
    author: "Mira",
    createdAt: now - 1000 * 60 * 120,
    stage: "original",
  };

  const ideaAImproved: Version = {
    id: "v2",
    body: "A map-first app that matches students with 15-minute skill-based volunteer tasks and gives verified impact streaks.",
    author: "Kian",
    createdAt: now - 1000 * 60 * 105,
    stage: "improvement",
  };

  const ideaBOriginal: Version = {
    id: "v3",
    body: "Turn apartment rooftops into shared food gardens.",
    author: "Rhea",
    createdAt: now - 1000 * 60 * 75,
    stage: "original",
  };

  const ideaBImproved: Version = {
    id: "v4",
    body: "A rooftop-garden co-op toolkit with smart watering, shared harvest credits, and local chef pickup partnerships.",
    author: "Noah",
    createdAt: now - 1000 * 60 * 60,
    stage: "improvement",
  };

  return {
    profileName: "Guest",
    selectedIdeaId: "idea-a",
    ideas: [
      {
        id: "idea-a",
        title: "Micro-volunteering for busy students",
        createdAt: now - 1000 * 60 * 120,
        championVersionId: ideaAImproved.id,
        roundEndAt: null,
        versions: [ideaAOriginal, ideaAImproved],
        battles: [
          {
            id: "b1",
            ideaId: "idea-a",
            aVersionId: ideaAOriginal.id,
            bVersionId: ideaAImproved.id,
            votesA: 2,
            votesB: 5,
            voters: ["Zara", "Milo", "Ana", "Dev", "Pia", "Guest", "Ivy"],
            status: "closed",
            winnerVersionId: ideaAImproved.id,
            createdAt: now - 1000 * 60 * 107,
            closedAt: now - 1000 * 60 * 104,
          },
        ],
      },
      {
        id: "idea-b",
        title: "Rooftop food-sharing network",
        createdAt: now - 1000 * 60 * 80,
        championVersionId: ideaBImproved.id,
        roundEndAt: null,
        versions: [ideaBOriginal, ideaBImproved],
        battles: [
          {
            id: "b2",
            ideaId: "idea-b",
            aVersionId: ideaBOriginal.id,
            bVersionId: ideaBImproved.id,
            votesA: 3,
            votesB: 6,
            voters: ["Finn", "Kai", "Mila", "Omar", "Pia", "Guest", "Luca", "Rin", "Zo"],
            status: "closed",
            winnerVersionId: ideaBImproved.id,
            createdAt: now - 1000 * 60 * 62,
            closedAt: now - 1000 * 60 * 57,
          },
        ],
      },
    ],
  };
};

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
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

function getVersion(idea: Idea, versionId: string): Version | null {
  return idea.versions.find((v) => v.id === versionId) ?? null;
}

function closeBattle(idea: Idea, battle: Battle): Idea {
  if (battle.status === "closed") {
    return idea;
  }

  const winnerVersionId =
    battle.votesB > battle.votesA ? battle.bVersionId : idea.championVersionId;

  const updatedBattle: Battle = {
    ...battle,
    status: "closed",
    winnerVersionId,
    closedAt: Date.now(),
  };

  return {
    ...idea,
    championVersionId: winnerVersionId,
    battles: idea.battles.map((b) => (b.id === battle.id ? updatedBattle : b)),
  };
}

export default function Home() {
  const [arena, setArena] = useState<ArenaState>(() => sampleState());
  const [loaded, setLoaded] = useState(false);
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [newIdeaText, setNewIdeaText] = useState("");
  const [improvementDraft, setImprovementDraft] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ArenaState;
        setArena(parsed);
      }
    } catch {
      setArena(sampleState());
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(arena));
  }, [arena, loaded]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!loaded) {
      return;
    }

    setArena((current) => {
      const updatedIdeas = current.ideas.map((idea) => {
        if (!idea.roundEndAt || idea.roundEndAt > Date.now()) {
          return idea;
        }

        const openBattle = idea.battles.find((battle) => battle.status === "open");
        const closedIdea = openBattle ? closeBattle(idea, openBattle) : idea;

        return {
          ...closedIdea,
          roundEndAt: null,
        };
      });

      return {
        ...current,
        ideas: updatedIdeas,
      };
    });
  }, [loaded, nowTick]);

  const selectedIdea = useMemo(
    () => arena.ideas.find((idea) => idea.id === arena.selectedIdeaId) ?? null,
    [arena.ideas, arena.selectedIdeaId],
  );

  const championVersion = selectedIdea
    ? getVersion(selectedIdea, selectedIdea.championVersionId)
    : null;

  const openBattle = selectedIdea
    ? selectedIdea.battles.find((battle) => battle.status === "open") ?? null
    : null;

  const roundSecondsLeft = selectedIdea?.roundEndAt
    ? Math.max(0, Math.ceil((selectedIdea.roundEndAt - nowTick) / 1000))
    : 0;

  const leaderboard = useMemo(() => {
    const board = new Map<string, number>();

    arena.ideas.forEach((idea) => {
      idea.versions.forEach((version) => {
        board.set(version.author, (board.get(version.author) ?? 0) + 2);
      });

      idea.battles.forEach((battle) => {
        if (battle.winnerVersionId) {
          const winner = getVersion(idea, battle.winnerVersionId);
          if (winner) {
            board.set(winner.author, (board.get(winner.author) ?? 0) + 5);
          }
        }

        battle.voters.forEach((voter) => {
          board.set(voter, (board.get(voter) ?? 0) + 1);
        });
      });
    });

    return Array.from(board.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [arena.ideas]);

  const createIdea = (): void => {
    const cleanTitle = newIdeaTitle.trim();
    const cleanText = newIdeaText.trim();
    const author = arena.profileName.trim() || "Guest";
    if (!cleanTitle || !cleanText) {
      return;
    }

    const original: Version = {
      id: uid("ver"),
      body: cleanText,
      author,
      createdAt: Date.now(),
      stage: "original",
    };

    const idea: Idea = {
      id: uid("idea"),
      title: cleanTitle,
      createdAt: Date.now(),
      championVersionId: original.id,
      roundEndAt: null,
      versions: [original],
      battles: [],
    };

    setArena((current) => ({
      ...current,
      ideas: [idea, ...current.ideas],
      selectedIdeaId: idea.id,
    }));

    setNewIdeaTitle("");
    setNewIdeaText("");
    setImprovementDraft("");
  };

  const startRound = (): void => {
    if (!selectedIdea || openBattle) {
      return;
    }

    setArena((current) => ({
      ...current,
      ideas: current.ideas.map((idea) =>
        idea.id === selectedIdea.id
          ? { ...idea, roundEndAt: Date.now() + ROUND_SECONDS * 1000 }
          : idea,
      ),
    }));
  };

  const submitImprovement = (): void => {
    if (!selectedIdea || !selectedIdea.roundEndAt || selectedIdea.roundEndAt < Date.now()) {
      return;
    }

    if (openBattle) {
      return;
    }

    const cleanBody = improvementDraft.trim();
    const author = arena.profileName.trim() || "Guest";
    if (!cleanBody) {
      return;
    }

    const version: Version = {
      id: uid("ver"),
      body: cleanBody,
      author,
      createdAt: Date.now(),
      stage: "improvement",
    };

    setArena((current) => ({
      ...current,
      ideas: current.ideas.map((idea) => {
        if (idea.id !== selectedIdea.id) {
          return idea;
        }

        const battle: Battle = {
          id: uid("battle"),
          ideaId: idea.id,
          aVersionId: idea.championVersionId,
          bVersionId: version.id,
          votesA: 0,
          votesB: 0,
          voters: [],
          status: "open",
          winnerVersionId: null,
          createdAt: Date.now(),
          closedAt: null,
        };

        return {
          ...idea,
          versions: [...idea.versions, version],
          battles: [battle, ...idea.battles],
        };
      }),
    }));

    setImprovementDraft("");
  };

  const vote = (pick: "A" | "B"): void => {
    if (!selectedIdea || !openBattle) {
      return;
    }

    const voter = arena.profileName.trim() || "Guest";
    if (openBattle.voters.includes(voter)) {
      return;
    }

    setArena((current) => {
      const updatedIdeas = current.ideas.map((idea) => {
        if (idea.id !== selectedIdea.id) {
          return idea;
        }

        const nextBattle = idea.battles.find((battle) => battle.id === openBattle.id);
        if (!nextBattle || nextBattle.status === "closed") {
          return idea;
        }

        const updatedBattle: Battle = {
          ...nextBattle,
          votesA: pick === "A" ? nextBattle.votesA + 1 : nextBattle.votesA,
          votesB: pick === "B" ? nextBattle.votesB + 1 : nextBattle.votesB,
          voters: [...nextBattle.voters, voter],
        };

        const shouldClose =
          updatedBattle.votesA >= BATTLE_VOTE_TARGET ||
          updatedBattle.votesB >= BATTLE_VOTE_TARGET;

        const ideaWithVote: Idea = {
          ...idea,
          battles: idea.battles.map((battle) =>
            battle.id === updatedBattle.id ? updatedBattle : battle,
          ),
        };

        return shouldClose ? closeBattle(ideaWithVote, updatedBattle) : ideaWithVote;
      });

      return {
        ...current,
        ideas: updatedIdeas,
      };
    });
  };

  const resetDemo = (): void => {
    const seeded = sampleState();
    setArena(seeded);
    setImprovementDraft("");
    setNewIdeaText("");
    setNewIdeaTitle("");
  };

  const openVersionA =
    selectedIdea && openBattle ? getVersion(selectedIdea, openBattle.aVersionId) : null;
  const openVersionB =
    selectedIdea && openBattle ? getVersion(selectedIdea, openBattle.bVersionId) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_5%_5%,rgba(255,209,102,0.32),transparent_35%),radial-gradient(circle_at_90%_10%,rgba(76,201,240,0.26),transparent_28%),radial-gradient(circle_at_70%_90%,rgba(255,92,135,0.2),transparent_28%),#f6f4ef]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(42,43,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(42,43,42,0.04)_1px,transparent_1px)] bg-[size:42px_42px]" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <header className="glass-panel rounded-3xl p-5 shadow-2xl shadow-black/10 md:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-stone-600">IdeaForge Arena</p>
              <h1 className="mt-2 text-4xl font-black leading-tight text-stone-900 sm:text-5xl">
                Build Better Ideas
                <span className="block text-coral-700">Together, In Public</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-stone-700 sm:text-base">
                Submit a raw concept, launch 60-second improve rounds, then let the community pick winners in head-to-head battles.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:w-[26rem]">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">
                  Your Name
                </span>
                <input
                  className="w-full rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none ring-coral-400 transition focus:ring-2"
                  value={arena.profileName}
                  maxLength={24}
                  onChange={(event) =>
                    setArena((current) => ({
                      ...current,
                      profileName: event.target.value,
                    }))
                  }
                  placeholder="Name shown on the leaderboard"
                />
              </label>
              <button
                className="rounded-xl border border-stone-300/70 bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-200"
                onClick={resetDemo}
              >
                Reset Demo Data
              </button>
              <div className="rounded-xl border border-dashed border-stone-400/70 bg-white/55 px-3 py-2 text-sm text-stone-700">
                Ideas: <strong>{arena.ideas.length}</strong>
                <span className="mx-2 text-stone-400">|</span>
                Battles: <strong>{arena.ideas.reduce((sum, idea) => sum + idea.battles.length, 0)}</strong>
              </div>
            </div>
          </div>
        </header>

        <main className="grid gap-6 xl:grid-cols-[20rem_1fr_20rem]">
          <section className="glass-panel rounded-3xl p-4 shadow-xl shadow-black/10 sm:p-5">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-700">Post New Idea</h2>

            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none ring-coral-400 transition focus:ring-2"
                value={newIdeaTitle}
                maxLength={90}
                onChange={(event) => setNewIdeaTitle(event.target.value)}
                placeholder="Short title"
              />

              <textarea
                className="h-24 w-full rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none ring-coral-400 transition focus:ring-2"
                value={newIdeaText}
                maxLength={240}
                onChange={(event) => setNewIdeaText(event.target.value)}
                placeholder="One-sentence raw idea"
              />

              <button
                className="w-full rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:-translate-y-0.5 hover:bg-coral-500"
                onClick={createIdea}
              >
                Launch Idea
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-stone-600">Arena Queue</h3>
              <div className="mt-2 max-h-[25rem] space-y-2 overflow-auto pr-1">
                {arena.ideas.map((idea) => {
                  const selected = idea.id === arena.selectedIdeaId;
                  const ideaChampion = getVersion(idea, idea.championVersionId);
                  return (
                    <button
                      key={idea.id}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selected
                          ? "border-coral-500 bg-coral-50"
                          : "border-stone-300/70 bg-white/65 hover:border-coral-300"
                      }`}
                      onClick={() => {
                        setArena((current) => ({
                          ...current,
                          selectedIdeaId: idea.id,
                        }));
                        setImprovementDraft("");
                      }}
                    >
                      <p className="line-clamp-2 text-sm font-bold text-stone-900">{idea.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-stone-700">{ideaChampion?.body ?? "No champion yet"}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.15em] text-stone-500">
                        {idea.versions.length} versions • {idea.battles.length} battles
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-3xl p-4 shadow-xl shadow-black/10 sm:p-6">
            {!selectedIdea && <p className="text-stone-700">Create or select an idea to begin.</p>}

            {selectedIdea && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-600">Selected Idea</p>
                    <h2 className="mt-1 text-2xl font-black text-stone-900 sm:text-3xl">{selectedIdea.title}</h2>
                    <p className="mt-1 text-xs text-stone-600">Created {formatAgo(selectedIdea.createdAt)}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      className="rounded-xl bg-ocean-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-ocean-700/20 transition hover:-translate-y-0.5 hover:bg-ocean-600 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={startRound}
                      disabled={Boolean(selectedIdea.roundEndAt && selectedIdea.roundEndAt > nowTick) || Boolean(openBattle)}
                    >
                      {selectedIdea.roundEndAt && selectedIdea.roundEndAt > nowTick
                        ? `Round Live: ${roundSecondsLeft}s`
                        : "Start 60s Round"}
                    </button>
                  </div>
                </div>

                <article className="mt-5 rounded-2xl border border-stone-300/70 bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">Current Champion</p>
                  <p className="mt-2 text-lg font-semibold leading-relaxed text-stone-900">{championVersion?.body}</p>
                  <p className="mt-2 text-sm text-stone-600">by {championVersion?.author ?? "Unknown"}</p>
                </article>

                <div className="mt-6 rounded-2xl border border-stone-300/70 bg-white/65 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">Improve This Idea</p>
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-stone-300/70 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-coral-400 transition focus:ring-2"
                    value={improvementDraft}
                    maxLength={280}
                    onChange={(event) => setImprovementDraft(event.target.value)}
                    placeholder="Write a stronger, clearer version"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-stone-600">
                      {selectedIdea.roundEndAt && selectedIdea.roundEndAt > nowTick
                        ? `Round closes in ${roundSecondsLeft}s`
                        : "Start a round to submit improvements."}
                    </p>
                    <button
                      className="rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-coral-500/25 transition hover:-translate-y-0.5 hover:bg-coral-500 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={!selectedIdea.roundEndAt || selectedIdea.roundEndAt <= nowTick || Boolean(openBattle)}
                      onClick={submitImprovement}
                    >
                      Submit Challenger
                    </button>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-stone-600">Head-to-Head Vote</p>

                  {!openBattle && (
                    <div className="mt-2 rounded-2xl border border-dashed border-stone-400/70 bg-white/55 p-4 text-sm text-stone-700">
                      No active battle. Submit an improvement in a live round to trigger A/B voting.
                    </div>
                  )}

                  {openBattle && openVersionA && openVersionB && (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <article className="rounded-2xl border border-stone-300/70 bg-white/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-stone-600">Version A</p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-900">{openVersionA.body}</p>
                        <p className="mt-2 text-xs text-stone-600">by {openVersionA.author}</p>
                        <p className="mt-2 text-sm font-bold text-stone-800">Votes: {openBattle.votesA}</p>
                        <button
                          className="mt-3 w-full rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => vote("A")}
                          disabled={openBattle.voters.includes(arena.profileName.trim() || "Guest")}
                        >
                          Vote A
                        </button>
                      </article>

                      <article className="rounded-2xl border border-coral-300 bg-coral-50/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.17em] text-coral-700">Version B</p>
                        <p className="mt-2 text-sm leading-relaxed text-stone-900">{openVersionB.body}</p>
                        <p className="mt-2 text-xs text-stone-600">by {openVersionB.author}</p>
                        <p className="mt-2 text-sm font-bold text-stone-800">Votes: {openBattle.votesB}</p>
                        <button
                          className="mt-3 w-full rounded-xl bg-coral-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-coral-500 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => vote("B")}
                          disabled={openBattle.voters.includes(arena.profileName.trim() || "Guest")}
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
                      .sort((a, b) => a.createdAt - b.createdAt)
                      .map((version) => {
                        const champion = version.id === selectedIdea.championVersionId;
                        return (
                          <li
                            key={version.id}
                            className={`rounded-xl border px-3 py-3 ${
                              champion
                                ? "border-ocean-500 bg-ocean-50/80"
                                : "border-stone-300/70 bg-white/65"
                            }`}
                          >
                            <p className="text-xs uppercase tracking-[0.14em] text-stone-600">
                              {version.stage} • {formatAgo(version.createdAt)} {champion ? "• champion" : ""}
                            </p>
                            <p className="mt-1 text-sm leading-relaxed text-stone-900">{version.body}</p>
                            <p className="mt-1 text-xs text-stone-600">by {version.author}</p>
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
            <p className="mt-1 text-xs text-stone-600">Points from ideas, winning upgrades, and votes.</p>

            <ul className="mt-4 space-y-2">
              {leaderboard.map(([name, score], index) => (
                <li
                  key={`${name}-${score}`}
                  className="flex items-center justify-between rounded-xl border border-stone-300/70 bg-white/70 px-3 py-2"
                >
                  <p className="text-sm text-stone-900">
                    <span className="mr-2 text-xs font-bold text-stone-500">#{index + 1}</span>
                    {name}
                  </p>
                  <p className="text-sm font-black text-ocean-700">{score}</p>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-dashed border-stone-400/70 bg-white/55 p-3 text-xs leading-relaxed text-stone-700">
              Voting closes automatically at {BATTLE_VOTE_TARGET} votes for either side, or when a round timer ends.
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}
