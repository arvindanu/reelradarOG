'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  Sparkles,
  Film,
  Tv,
  Star,
  ArrowUpRight,
  LoaderCircle,
  X,
  Target,
  Clapperboard,
  RotateCcw,
  Tags,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

type MediaType = 'movie' | 'tv';
type SearchMode = 'title' | 'tags';

type Title = {
  id: number;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string;
  year: string;
  rating: number | null;
  voteCount: number;
  popularity: number;
  language: string;
  genres: number[];
};

type LookalikeResult = Title & {
  score: number;
  reasons: string[];
  matchType: 'both' | 'recommendation' | 'similar';
};

type SourceTitle = {
  id: number;
  title: string;
  overview?: string;
  poster: string | null;
  backdrop?: string | null;
  year: string;
  mediaType: MediaType;
};

const PAGE_SIZE = 24;

export default function Lookalike() {
  const [type, setType] = useState<MediaType>('movie');
  const [searchMode, setSearchMode] = useState<SearchMode>('title');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Title[]>([]);
  const [selected, setSelected] = useState<Title | null>(null);
  const [results, setResults] = useState<LookalikeResult[]>([]);
  const [source, setSource] = useState<SourceTitle | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (
      searchMode !== 'title' ||
      selected ||
      query.trim().length < 2
    ) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const params = new URLSearchParams({
          q: query.trim(),
          type,
        });

        const response = await fetch(
          `/api/lookalike?${params.toString()}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Search failed.');
        }

        setSearchResults(
          Array.isArray(data.results) ? data.results : []
        );
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, type, selected, searchMode]);

  const chooseTitle = (item: Title) => {
    setSelected(item);
    setQuery(item.title);
    setSearchResults([]);
    setResults([]);
    setSource(null);
    setError('');
    setHasSearched(false);
    setCurrentPage(1);
  };

  const findLookalikes = async () => {
    if (loading) return;

    if (searchMode === 'title' && !selected) return;
    if (searchMode === 'tags' && query.trim().length < 2) return;

    setLoading(true);
    setError('');
    setResults([]);
    setSource(null);
    setHasSearched(false);
    setCurrentPage(1);

    try {
      const body = searchMode === 'tags'
        ? {
            mode: 'tags',
            query: query.trim(),
            type,
          }
        : {
            id: selected!.id,
            type,
          };

      const response = await fetch('/api/lookalike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || 'Could not find matching titles.'
        );
      }

      setSource(data.source ?? null);
      setResults(
        Array.isArray(data.results) ? data.results : []
      );
      setHasSearched(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setQuery('');
    setSelected(null);
    setSearchResults([]);
    setResults([]);
    setSource(null);
    setError('');
    setHasSearched(false);
    setCurrentPage(1);
  };

  const changeType = (nextType: MediaType) => {
    setType(nextType);
    setQuery('');
    setSelected(null);
    setSearchResults([]);
    setResults([]);
    setSource(null);
    setError('');
    setHasSearched(false);
    setCurrentPage(1);
  };

  const changeSearchMode = (nextMode: SearchMode) => {
    setSearchMode(nextMode);
    setQuery('');
    setSelected(null);
    setSearchResults([]);
    setResults([]);
    setSource(null);
    setError('');
    setHasSearched(false);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(results.length / PAGE_SIZE);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const visibleResults = results.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  const goToPage = (page: number) => {
    const nextPage = Math.max(1, Math.min(totalPages, page));
    setCurrentPage(nextPage);

    document
      .querySelector('.lookalike-results-section')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="lookalike-page">
      

      <section className="lookalike-hero">
        <div className="lookalike-orb lookalike-orb-one" />
        <div className="lookalike-orb lookalike-orb-two" />

        <div className="lookalike-hero-content">
          <div className="lookalike-eyebrow">
            <Sparkles size={14} />
            SMART TITLE DISCOVERY
          </div>

          <h1>
            Find your next
            <span> lookalike.</span>
          </h1>

          <p className="lookalike-description">
            Loved a movie or series? Discover titles with a
            similar story, themes, genres and overall feel.
          </p>

          <div className="lookalike-search-panel">
            <div className="lookalike-type-switch">
              <button
                type="button"
                className={type === 'movie' ? 'active' : ''}
                onClick={() => changeType('movie')}
              >
                <Film size={15} />
                Movies
              </button>

              <button
                type="button"
                className={type === 'tv' ? 'active' : ''}
                onClick={() => changeType('tv')}
              >
                <Tv size={15} />
                Series
              </button>

              <button
                type="button"
                className={`lookalike-tag-toggle ${
                  searchMode === 'tags' ? 'active' : ''
                }`}
                onClick={() =>
                  changeSearchMode(
                    searchMode === 'tags' ? 'title' : 'tags'
                  )
                }
                aria-pressed={searchMode === 'tags'}
              >
                <Tags size={14} />
                Search by Tag
              </button>
            </div>

            <div className="lookalike-input-wrap">
              {searchMode === 'tags' ? (
                <Tags size={20} className="lookalike-search-icon" />
              ) : (
                <Search size={20} className="lookalike-search-icon" />
              )}

              <input
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  setSelected(null);
                  setResults([]);
                  setSource(null);
                  setHasSearched(false);
                  setCurrentPage(1);
                  setError('');
                }}
                onKeyDown={event => {
                  if (event.key === 'Escape') {
                    setSearchResults([]);
                  }

                  if (
                    event.key === 'Enter' &&
                    searchMode === 'tags' &&
                    query.trim().length >= 2
                  ) {
                    findLookalikes();
                  }
                }}
                placeholder={
                  searchMode === 'tags'
                    ? 'Try: time travel, dark comedy, survival...'
                    : type === 'movie'
                      ? 'Search for a movie...'
                      : 'Search for a series...'
                }
                autoComplete="off"
                aria-label={
                  searchMode === 'tags'
                    ? 'Search movies or series by tags'
                    : `Search for a ${type === 'movie' ? 'movie' : 'series'}`
                }
              />

              {query && (
                <button
                  type="button"
                  className="lookalike-clear"
                  onClick={reset}
                  aria-label="Clear search"
                >
                  <X size={17} />
                </button>
              )}

              {searching && searchMode === 'title' && (
                <LoaderCircle
                  size={18}
                  className="lookalike-search-loader"
                />
              )}
            </div>

            {searchMode === 'title' &&
              searchResults.length > 0 &&
              !selected && (
                <div className="lookalike-search-results">
                  {searchResults.map(item => (
                    <button
                      type="button"
                      key={item.id}
                      className="lookalike-search-result"
                      onClick={() => chooseTitle(item)}
                    >
                      <span className="lookalike-result-poster">
                        {item.poster ? (
                          <img src={item.poster} alt="" />
                        ) : (
                          <Film size={18} />
                        )}
                      </span>

                      <span className="lookalike-result-info">
                        <strong>{item.title}</strong>
                        <small>
                          {item.year || 'Release date unavailable'}
                          {item.rating !== null
                            ? ` · ★ ${item.rating.toFixed(1)}`
                            : ''}
                        </small>
                      </span>

                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              )}

            {searchMode === 'title' &&
              query.trim().length >= 2 &&
              !searching &&
              !selected &&
              searchResults.length === 0 && (
                <div className="lookalike-no-search">
                  No matching titles found. Try another search.
                </div>
              )}

            {searchMode === 'tags' && (
              <div className="lookalike-tag-hint">
                <Tags size={13} />
                Enter one or more descriptive tags. Separate ideas
                with spaces or commas.
              </div>
            )}

            {searchMode === 'title' && selected && (
              <div className="lookalike-selected">
                <div className="lookalike-selected-poster">
                  {selected.poster ? (
                    <img src={selected.poster} alt="" />
                  ) : (
                    <Film size={20} />
                  )}
                </div>

                <div className="lookalike-selected-info">
                  <small>SELECTED TITLE</small>
                  <strong>{selected.title}</strong>
                  <span>
                    {selected.year || 'Year unavailable'}
                    {selected.rating !== null
                      ? ` · ★ ${selected.rating.toFixed(1)}`
                      : ''}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={reset}
                  aria-label="Remove selected title"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            <button
              type="button"
              className="lookalike-submit"
              disabled={
                loading ||
                (searchMode === 'title' && !selected) ||
                (searchMode === 'tags' && query.trim().length < 2)
              }
              onClick={findLookalikes}
            >
              {loading ? (
                <>
                  <LoaderCircle size={17} className="spin" />
                  Finding your matches...
                </>
              ) : (
                <>
                  <Sparkles size={17} />
                  {searchMode === 'tags'
                    ? 'Find Titles by Tag'
                    : 'Find Lookalikes'}
                  <ArrowUpRight size={16} />
                </>
              )}
            </button>

            <div className="lookalike-search-foot">
              <span>
                <Target size={13} />
                TMDB-powered matching
              </span>
              <span>Movies &amp; series</span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="lookalike-message lookalike-error">
          <span>{error}</span>
          <button type="button" onClick={findLookalikes}>
            Try again
          </button>
        </div>
      )}

      {loading && (
        <section className="lookalike-loading">
          <div className="lookalike-loading-icon">
            <Sparkles size={25} />
          </div>
          <h2>Finding your lookalikes</h2>
          <p>
            Comparing recommendations, genres, plot keywords
            and title metadata...
          </p>
          <div className="lookalike-progress">
            <span />
          </div>
        </section>
      )}

      {!loading && source && (
        <section className="lookalike-results-section">
          <div className="lookalike-section-heading">
            <div>
              <div className="lookalike-eyebrow">
                <Target size={14} />
                YOUR MATCH RESULTS
              </div>
              <h2>
                {searchMode === 'tags'
                  ? `Titles matching "${source.title}"`
                  : `Because you liked ${source.title}`}
              </h2>
              <p>
                {searchMode === 'tags'
                  ? 'Ranked using matching TMDB keywords, title metadata and popularity.'
                  : 'Ranked using TMDB recommendations and metadata similarity.'}
              </p>
            </div>

            <button
              type="button"
              className="lookalike-reset-button"
              onClick={reset}
            >
              <RotateCcw size={15} />
              New search
            </button>
          </div>

          <div className="lookalike-source-card">
            <div className="lookalike-source-poster">
              {source.poster ? (
                <img src={source.poster} alt={source.title} />
              ) : searchMode === 'tags' ? (
                <Tags size={25} />
              ) : (
                <Film size={25} />
              )}
            </div>
            <div>
              <small>
                {searchMode === 'tags'
                  ? 'YOUR SEARCH TAGS'
                  : 'YOU STARTED WITH'}
              </small>
              <h3>{source.title}</h3>
              <span>
                {source.mediaType === 'tv' ? 'SERIES' : 'MOVIE'}
                {source.year ? ` · ${source.year}` : ''}
              </span>
            </div>
          </div>

          {results.length > 0 ? (
            <>
              <div className="lookalike-results-count">
                <strong>
                  {results.length} {searchMode === 'tags' ? 'titles' : 'lookalikes'} found
                </strong>
                <span>
                  Sorted by {searchMode === 'tags' ? 'tag relevance' : 'match strength'}
                </span>
              </div>

              <div className="lookalike-grid">
                {visibleResults.map((item, index) => (
                  <article
                    className="lookalike-card"
                    key={`${item.id}-${item.title}`}
                  >
                    <a
                      className="lookalike-card-image"
                      href={`https://www.themoviedb.org/${type}/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`View ${item.title} on TMDB`}
                    >
                      {item.poster ? (
                        <img
                          src={item.poster}
                          alt={`${item.title} poster`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="lookalike-poster-fallback">
                          <Film size={30} />
                        </div>
                      )}

                      <span className="lookalike-rank">
                        #{startIndex + index + 1}
                      </span>

                      <span className="lookalike-match-score">
                        <Sparkles size={12} />
                        {item.score}% match
                      </span>

                      <span className="lookalike-card-open">
                        <ArrowUpRight size={18} />
                      </span>
                    </a>

                    <div className="lookalike-card-body">
                      <div className="lookalike-card-meta">
                        <span>
                          {item.year || 'Year unknown'}
                        </span>
                        {item.rating !== null && (
                          <span className="lookalike-rating">
                            <Star size={12} fill="currentColor" />
                            {item.rating.toFixed(1)}
                          </span>
                        )}
                      </div>

                      <h3>{item.title}</h3>

                      <p className="lookalike-overview">
                        {item.overview ||
                          'No synopsis available for this title.'}
                      </p>

                      <div className="lookalike-reasons">
                        <small>WHY IT MATCHES</small>
                        <div>
                          {item.reasons.map(reason => (
                            <span key={reason}>{reason}</span>
                          ))}
                        </div>
                      </div>

                      <a
                        className="lookalike-card-link"
                        href={`https://www.themoviedb.org/${type}/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Explore title
                        <ArrowUpRight size={14} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>

              {totalPages > 1 && (
                <nav
                  className="lookalike-pagination"
                  aria-label="Lookalike results pages"
                >
                  <button
                    type="button"
                    className="lookalike-page-button lookalike-page-arrow"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={17} />
                    <span>Previous</span>
                  </button>

                  <div className="lookalike-page-numbers">
                    {Array.from(
                      { length: totalPages },
                      (_, index) => index + 1
                    ).map(page => (
                      <button
                        type="button"
                        key={page}
                        className={`lookalike-page-number ${
                          currentPage === page ? 'active' : ''
                        }`}
                        onClick={() => goToPage(page)}
                        aria-label={`Page ${page}`}
                        aria-current={
                          currentPage === page ? 'page' : undefined
                        }
                      >
                        {page}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="lookalike-page-button lookalike-page-arrow"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                  >
                    <span>Next</span>
                    <ChevronRight size={17} />
                  </button>
                </nav>
              )}

              <div className="lookalike-page-summary">
                Showing {startIndex + 1}–{Math.min(
                  startIndex + PAGE_SIZE,
                  results.length
                )} of {results.length} results
              </div>
            </>
          ) : (
            <div className="lookalike-empty">
              <div><Search size={25} /></div>
              <h3>No matching titles found</h3>
              <p>
                {searchMode === 'tags'
                  ? 'TMDB did not find titles for those tags. Try broader or different descriptive words.'
                  : 'TMDB has not returned similar titles for this selection. Try another movie or series.'}
              </p>
              <button type="button" onClick={reset}>
                Search again
              </button>
            </div>
          )}
        </section>
      )}

      {!loading && !source && !hasSearched && (
        <section className="lookalike-how">
          <div className="lookalike-how-heading">
            <span>BUILT FOR BETTER DISCOVERY</span>
            <h2>Not just the same genre.</h2>
            <p>
              Lookalike considers multiple signals to find titles
              that have more in common than a category label.
            </p>
          </div>

          <div className="lookalike-how-grid">
            <div>
              <span className="lookalike-how-icon"><Target size={20} /></span>
              <h3>TMDB intelligence</h3>
              <p>
                Starts with TMDB's recommendations and similar-title
                results for your selected movie or series.
              </p>
            </div>
            <div>
              <span className="lookalike-how-icon"><Search size={20} /></span>
              <h3>Plot keyword matching</h3>
              <p>
                Compares shared keywords and genres to identify
                stronger thematic connections.
              </p>
            </div>
            <div>
              <span className="lookalike-how-icon"><Star size={20} /></span>
              <h3>Ranked results</h3>
              <p>
                Combines relevance with language, release period
                and rating confidence to order the results.
              </p>
            </div>
          </div>
        </section>
      )}

      
    </main>
  );
}