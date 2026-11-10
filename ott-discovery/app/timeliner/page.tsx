"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  ListOrdered,
  Loader2,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";

import "./timeliner.css";

type Franchise = {
  id: string;
  name: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  kind: "collection";
  hasChronology: boolean;
};

type TimelineMovie = {
  id: number;
  title: string;
  originalTitle: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number;
  language: string;
  runtime: number | null;
  genres: string[];
};

type Collection = {
  id: number;
  name: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  totalMovies: number;
  releaseOrder: TimelineMovie[];
  chronologicalMovies: TimelineMovie[];
  chronologySource: "gemini" | "release";
  chronologyConfidence: "high" | "medium" | "low";
  chronologyNote: string;
};

type OrderType = "release" | "story";

const INTRO_KEY = "reelradar-timeliner-intro-seen";

function formatDate(value: string): string {
  if (!value) return "Release date unavailable";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRuntime(runtime: number | null): string {
  if (!runtime) return "";

  const hours = Math.floor(runtime / 60);
  const minutes = runtime % 60;

  if (!hours) return `${minutes} min`;

  return `${hours}h ${minutes}m`;
}

function getCollectionFromUrl(): string | null {
  if (typeof window === "undefined") return null;

  return new URLSearchParams(window.location.search).get("collection");
}

export default function TimelinerPage() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"az" | "za">("az");
  const [page, setPage] = useState(1);

  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [order, setOrder] = useState<OrderType>("release");
  const [introOpen, setIntroOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const cardRefs = useRef<Map<number, HTMLAnchorElement>>(new Map());
  const previousRects = useRef<Map<number, DOMRect>>(new Map());

  // Read the shared collection URL after hydration.
  useEffect(() => {
    setSelectedId(getCollectionFromUrl());

    const handlePopState = () => {
      setSelectedId(getCollectionFromUrl());
      setOrder("release");
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // Respect the visitor's reduced-motion preference.
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => setReducedMotion(media.matches);

    update();
    media.addEventListener?.("change", update);

    return () => media.removeEventListener?.("change", update);
  }, []);

  // First-visit introduction.
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(INTRO_KEY);

      if (!seen) setIntroOpen(true);
    } catch {
      // The page remains usable if localStorage is unavailable.
    }
  }, []);

  const closeIntro = useCallback(() => {
    setIntroOpen(false);

    try {
      window.localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const openCollection = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("collection", id);

    window.history.pushState(
      { timeliner: true },
      "",
      `${url.pathname}${url.search}${url.hash}`
    );

    setSelectedId(id);
    setCollection(null);
    setDetailError("");
    setOrder("release");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const backToCollections = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("collection");

    window.history.pushState(
      { timeliner: true },
      "",
      `${url.pathname}${url.search}${url.hash}`
    );

    setSelectedId(null);
    setCollection(null);
    setDetailError("");
    setOrder("release");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Reset pagination when the search changes.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Search TMDB collections.
  useEffect(() => {
    if (selectedId) return;

    const search = query.trim();

    if (search.length < 2) {
      setFranchises([]);
      setTotalResults(0);
      setTotalPages(0);
      setSearchLoading(false);
      setSearchError("");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");

      try {
        const params = new URLSearchParams({
          action: "search",
          query: search,
          page: String(page),
        });

        const response = await fetch(
          `/api/timeliner?${params.toString()}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to search collections.");
        }

        if (cancelled) return;

        setFranchises(Array.isArray(data.results) ? data.results : []);
        setTotalResults(Number(data.totalResults || 0));
        setTotalPages(Number(data.totalPages || 0));
      } catch (error) {
        if (cancelled) return;

        if (error instanceof Error && error.name === "AbortError") return;

        setFranchises([]);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Something went wrong while searching."
        );
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, selectedId]);

  // Load the selected collection.
  useEffect(() => {
    if (!selectedId) {
      setCollection(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadCollection() {
      setDetailLoading(true);
      setDetailError("");
      setCollection(null);

      try {
        const params = new URLSearchParams({
          action: "collection",
          id: selectedId as string,
        });

        const response = await fetch(
          `/api/timeliner?${params.toString()}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load this timeline.");
        }

        if (cancelled) return;

        setCollection(data as Collection);
      } catch (error) {
        if (cancelled) return;

        if (error instanceof Error && error.name === "AbortError") return;

        setDetailError(
          error instanceof Error
            ? error.message
            : "Something went wrong while loading this collection."
        );
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadCollection();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedId]);

  const sortedFranchises = useMemo(() => {
    return [...franchises].sort((a, b) => {
      const comparison = a.name.localeCompare(b.name);
      return sort === "az" ? comparison : -comparison;
    });
  }, [franchises, sort]);

  const movies = useMemo(() => {
    if (!collection) return [];

    return order === "story"
      ? collection.chronologicalMovies
      : collection.releaseOrder;
  }, [collection, order]);

  const setCardRef = useCallback(
    (movieId: number) => (node: HTMLAnchorElement | null) => {
      if (node) {
        cardRefs.current.set(movieId, node);
      } else {
        cardRefs.current.delete(movieId);
      }
    },
    []
  );

  // FLIP animation when switching between release and story order.
  useLayoutEffect(() => {
    if (reducedMotion || previousRects.current.size === 0) return;

    cardRefs.current.forEach((element, movieId) => {
      const previous = previousRects.current.get(movieId);

      if (!previous || !element) return;

      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

      element.animate(
        [
          {
            transform: `translate(${deltaX}px, ${deltaY}px)`,
          },
          {
            transform: "translate(0, 0)",
          },
        ],
        {
          duration: 450,
          easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
        }
      );
    });

    previousRects.current.clear();
  }, [movies, reducedMotion]);

  const changeOrder = (nextOrder: OrderType) => {
    if (nextOrder === order) return;

    previousRects.current.clear();

    cardRefs.current.forEach((element, movieId) => {
      previousRects.current.set(movieId, element.getBoundingClientRect());
    });

    setOrder(nextOrder);
  };

  const handleMovieClick = (movie: TimelineMovie) => {
    try {
      window.sessionStorage.setItem(
        "reelradar-timeliner-open-title",
        JSON.stringify({
          id: movie.id,
          title: movie.title,
          type: "movie",
        })
      );
    } catch {
      // Navigation still works if sessionStorage is unavailable.
    }
  };

  if (selectedId) {
    return (
      <main className="tl-page tl-detail-page">

        <div className="tl-detail-wrap">
          <button
            type="button"
            className="tl-back-button"
            onClick={backToCollections}
          >
            <ArrowLeft size={16} />
            <span>All collections</span>
          </button>

          {detailLoading && (
            <div className="tl-state tl-loading">
              <Loader2 className="tl-spinner" size={26} />
              <span>Building your movie timeline...</span>
            </div>
          )}

          {!detailLoading && detailError && (
            <div className="tl-state tl-error">
              <Film size={30} />
              <h2>Couldn't load this timeline</h2>
              <p>{detailError}</p>
              <button onClick={backToCollections}>
                Back to collections
              </button>
            </div>
          )}

          {!detailLoading && collection && (
            <>
              <section className="tl-detail-hero">
                {collection.backdrop && (
                  <div
                    className="tl-detail-backdrop"
                    style={{
                      backgroundImage: `url("${collection.backdrop}")`,
                    }}
                  />
                )}

                <div className="tl-detail-hero-content">
                  <div className="tl-eyebrow">
                    <span className="tl-eyebrow-dot" />
                    FRANCHISE TIMELINE
                  </div>

                  <h1>{collection.name}</h1>

                  {collection.overview && (
                    <p className="tl-detail-overview">
                      {collection.overview}
                    </p>
                  )}

                  <div className="tl-detail-meta">
                    <span>
                      <Film size={15} />
                      {collection.totalMovies} movies
                    </span>
                    <span>
                      <CalendarDays size={15} />
                      {collection.releaseOrder[0]?.year || "—"}
                      {collection.releaseOrder.length > 1 &&
                        ` – ${
                          collection.releaseOrder[
                            collection.releaseOrder.length - 1
                          ]?.year || "Present"
                        }`}
                    </span>
                  </div>
                </div>
              </section>

              <section className="tl-timeline-section">
                <div className="tl-timeline-heading">
                  <div>
                    <div className="tl-eyebrow">EXPLORE THE STORY</div>
                    <h2>Choose your timeline</h2>
                    <p>
                      Watch in theatrical release order or follow the
                      events in story chronology.
                    </p>
                  </div>

                  <div className="tl-order-switch">
                    <button
                      type="button"
                      className={order === "release" ? "active" : ""}
                      onClick={() => changeOrder("release")}
                    >
                      <CalendarDays size={15} />
                      Release
                    </button>

                    <button
                      type="button"
                      className={order === "story" ? "active" : ""}
                      onClick={() => changeOrder("story")}
                    >
                      <ListOrdered size={15} />
                      Story
                    </button>
                  </div>
                </div>

                {order === "story" && (
                  <div
                    className={`tl-ai-note ${
                      collection.chronologySource === "gemini"
                        ? "tl-ai-note-success"
                        : "tl-ai-note-fallback"
                    }`}
                  >
                    {collection.chronologySource === "gemini" ? (
                      <Sparkles size={17} />
                    ) : (
                      <Clock3 size={17} />
                    )}

                    <div>
                      <strong>
                        {collection.chronologySource === "gemini"
                          ? "Gemini story chronology"
                          : "Release-order fallback"}
                      </strong>
                      <p>{collection.chronologyNote}</p>

                      {collection.chronologySource === "gemini" && (
                        <span className="tl-confidence">
                          AI confidence: {collection.chronologyConfidence}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div
                  className={`tl-timeline ${
                    order === "story" ? "tl-story-order" : ""
                  }`}
                >
                  {movies.map((movie, index) => (
                    <a
                      key={movie.id}
                      ref={setCardRef(movie.id)}
                      href="/"
                      className="tl-movie-row"
                      onClick={() => handleMovieClick(movie)}
                    >
                      <div className="tl-marker-column">
                        <span className="tl-marker">{index + 1}</span>
                      </div>

                      <div className="tl-movie-card">
                        <div className="tl-movie-poster">
                          {movie.poster ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={movie.poster}
                              alt={`${movie.title} poster`}
                              loading={index < 4 ? "eager" : "lazy"}
                            />
                          ) : (
                            <div className="tl-poster-placeholder">
                              <Film size={26} />
                            </div>
                          )}
                        </div>

                        <div className="tl-movie-info">
                          <div className="tl-movie-topline">
                            <span className="tl-step-label">
                              {index === 0
                                ? "START HERE"
                                : `CHAPTER ${String(index + 1).padStart(
                                    2,
                                    "0"
                                  )}`}
                            </span>

                            <span className="tl-movie-year">
                              {movie.year}
                            </span>
                          </div>

                          <h3>{movie.title}</h3>

                          {movie.overview && (
                            <p className="tl-movie-overview">
                              {movie.overview}
                            </p>
                          )}

                          <div className="tl-movie-meta">
                            <span>
                              <CalendarDays size={13} />
                              {formatDate(movie.releaseDate)}
                            </span>

                            {movie.runtime && (
                              <span>
                                <Clock3 size={13} />
                                {formatRuntime(movie.runtime)}
                              </span>
                            )}

                            {movie.rating > 0 && (
                              <span>
                                <Star size={13} />
                                {movie.rating.toFixed(1)}
                              </span>
                            )}
                          </div>

                          {movie.genres.length > 0 && (
                            <div className="tl-genres">
                              {movie.genres.slice(0, 3).map((genre) => (
                                <span key={genre}>{genre}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="tl-movie-arrow">
                          <ArrowUpRight size={18} />
                        </div>
                      </div>
                    </a>
                  ))}
                </div>

                {movies.length === 0 && (
                  <div className="tl-state">
                    No movies were found in this collection.
                  </div>
                )}
              </section>
            </>
          )}
        </div>

      </main>
    );
  }

  return (
    <main className="tl-page">

      <section className="tl-list-hero">
        <div className="tl-list-hero-inner">
          <div className="tl-eyebrow">
            <span className="tl-eyebrow-dot" />
            REELRADAR ORIGINAL
          </div>

          <h1>
            Every story has
            <br />
            <span>a timeline.</span>
          </h1>

          <p>
            Explore movie franchises in release order or discover how
            their stories unfold chronologically.
          </p>

          <div className="tl-search-box">
            <Search size={19} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a movie franchise..."
              aria-label="Search movie franchises"
            />

            {query && (
              <button
                type="button"
                className="tl-clear-search"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X size={17} />
              </button>
            )}
          </div>

          <div className="tl-search-hint">
            Try searching for Star Wars, Harry Potter, or Jurassic Park.
          </div>
        </div>
      </section>

      <section className="tl-results-section">
        <div className="tl-results-heading">
          <div>
            <div className="tl-eyebrow">DISCOVER</div>
            <h2>
              {query.trim().length >= 2
                ? "Search results"
                : "Find your franchise"}
            </h2>

            {query.trim().length >= 2 && (
              <p>
                {totalResults.toLocaleString()} collections found
              </p>
            )}
          </div>

          {franchises.length > 1 && (
            <div className="tl-sort-control">
              <span>Sort</span>
              <button
                type="button"
                onClick={() => setSort(sort === "az" ? "za" : "az")}
              >
                {sort === "az" ? "A – Z" : "Z – A"}
                <ListOrdered size={15} />
              </button>
            </div>
          )}
        </div>

        {searchLoading && (
          <div className="tl-state tl-loading">
            <Loader2 className="tl-spinner" size={24} />
            <span>Searching movie collections...</span>
          </div>
        )}

        {!searchLoading && searchError && (
          <div className="tl-state tl-error">
            <p>{searchError}</p>
          </div>
        )}

        {!searchLoading &&
          !searchError &&
          query.trim().length < 2 && (
            <div className="tl-empty-prompt">
              <div className="tl-empty-icon">
                <Clapperboard size={27} />
              </div>
              <h3>Your next movie marathon starts here.</h3>
              <p>
                Search for a franchise above to explore its complete
                collection and story timeline.
              </p>
            </div>
          )}

        {!searchLoading &&
          !searchError &&
          query.trim().length >= 2 &&
          sortedFranchises.length === 0 && (
            <div className="tl-empty-prompt">
              <div className="tl-empty-icon">
                <Search size={26} />
              </div>
              <h3>No collections found</h3>
              <p>
                Try a different franchise name or a shorter search.
              </p>
            </div>
          )}

        {!searchLoading && sortedFranchises.length > 0 && (
          <div className="tl-grid">
            {sortedFranchises.map((item) => (
              <button
                type="button"
                key={item.id}
                className="tl-collection-card"
                onClick={() => openCollection(item.id)}
              >
                <div className="tl-collection-poster">
                  {item.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.poster}
                      alt={`${item.name} poster`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="tl-poster-placeholder">
                      <Film size={32} />
                    </div>
                  )}

                  <div className="tl-card-overlay" />
                  <span className="tl-card-badge">
                    <Sparkles size={12} />
                    TIMELINE
                  </span>
                  <span className="tl-card-open">
                    <ArrowUpRight size={19} />
                  </span>
                </div>

                <div className="tl-collection-info">
                  <h3>{item.name}</h3>
                  <p>
                    {item.overview || "Explore this movie collection."}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {!searchLoading && totalPages > 1 && (
          <div className="tl-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <ChevronLeft size={17} />
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => {
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                );
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Next
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </section>


      {introOpen && (
        <div className="tl-intro-backdrop" role="presentation">
          <section
            className="tl-intro-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tl-intro-title"
          >
            <button
              type="button"
              className="tl-intro-close"
              onClick={closeIntro}
              aria-label="Close introduction"
            >
              <X size={18} />
            </button>

            <div className="tl-intro-icon">
              <Clapperboard size={27} />
            </div>

            <div className="tl-eyebrow">WELCOME TO TIMELINER</div>
            <h2 id="tl-intro-title">
              Watch the story,
              <br />
              <span>not just the release.</span>
            </h2>

            <p>
              Explore movie collections in their original theatrical
              release order or use Gemini AI to discover the
              chronological order of events inside the story.
            </p>

            <button
              type="button"
              className="tl-intro-continue"
              onClick={closeIntro}
            >
              Explore timelines
              <ArrowUpRight size={17} />
              <Check size={15} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}