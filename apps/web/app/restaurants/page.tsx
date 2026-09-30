import Link from "next/link";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { directorySearch } from "@/lib/restaurant-directory.mjs";
import { restaurantEnrichment } from "@/lib/registry-enrichment";
import { venues } from "@/lib/venue-catalog";

export const runtime = "nodejs";

type Query = { q?: string | string[]; city?: string | string[]; page?: string | string[] };
const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
const priceLabel: Record<string, string> = { budget: "Budget-friendly", moderate: "Moderate", upscale: "Upscale", splurge: "Splurge" };

async function loadSnapshot() {
  const path = resolve(process.cwd(), "../../data/restaurant-registry.json");
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export default async function RestaurantsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const search = scalar(params.q).trim().slice(0, 100);
  const city = scalar(params.city).toUpperCase() === "ALL" ? "" : "TAMPA";
  const requestedPage = Number(scalar(params.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const snapshot = await loadSnapshot();
  const plannerLicenses = new Set(venues.map(venue => venue.registryLicense).filter(Boolean));
  const results = directorySearch(snapshot, restaurantEnrichment, { search, city, page });
  const href = (nextPage: number) => `/restaurants?${new URLSearchParams({ q: search, city: city || "ALL", page: String(nextPage) })}`;

  return <main className="site-frame app-frame restaurant-directory">
    <header className="site-header"><Link className="wordmark" href="/"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link><nav className="site-nav"><Link href="/request">Plan a date</Link><Link href="/">Home</Link></nav></header>
    <section className="directory-heading"><p className="eyebrow">Explore local restaurants</p><h1>Restaurant directory</h1><p>Search the Florida DBPR discovery list. A license entry is not proof a restaurant is open today. Price, cuisine, hours and seating are shown only when separately reviewed.</p></section>
    {!snapshot ? <section className="directory-empty"><h2>Directory snapshot not loaded</h2><p>Run <code>pnpm restaurants:refresh</code> from the project root, then reload this page. The planner still works with its existing reviewed catalog.</p></section> : <>
      <form className="directory-search" method="get"><label>Restaurant, street or license<input type="search" name="q" defaultValue={search} maxLength={100} placeholder="Search restaurants" /></label><label>Area<select name="city" defaultValue={city || "ALL"}><option value="TAMPA">Tampa</option><option value="ALL">All imported cities</option></select></label><button className="button" type="submit">Search</button></form>
      <p className="directory-count">{results.count.toLocaleString()} discovery records · Snapshot imported {snapshot.meta.observedAt.slice(0, 10)} · Page {results.page} of {results.pageCount}</p>
      <div className="directory-grid">{results.rows.map((row: { license: string; name: string; street: string; city: string; state: string; zip: string; sourceUrl: string; warnings: string[]; enrichment: { cuisines?: string[]; priceBand?: string; hours?: unknown; setting?: string; reviewedOn?: string; sourceUrl?: string; plannerEligible?: boolean } | null }) => {
        const inPlanner = plannerLicenses.has(row.license) || row.enrichment?.plannerEligible;
        return <article className="directory-card" key={row.license}><div className="directory-card-top"><span className={inPlanner ? "directory-badge directory-badge-ready" : "directory-badge"}>{inPlanner ? "In date planner" : "Discovery listing"}</span><small>{row.license}</small></div><h2>{row.name}</h2><p>{row.street}, {row.city}, {row.state} {row.zip}</p><dl><dt>Cuisine</dt><dd>{row.enrichment?.cuisines?.join(", ") || "Not reviewed"}</dd><dt>Price for two</dt><dd>{row.enrichment?.priceBand ? priceLabel[row.enrichment.priceBand] : "Unknown"}</dd><dt>Hours</dt><dd>{row.enrichment?.hours ? "Reviewed schedule recorded" : "Not reviewed"}</dd><dt>Setting</dt><dd>{row.enrichment?.setting || "Not reviewed"}</dd></dl>{row.warnings?.length > 0 && <p className="directory-warning">Registry flags: {row.warnings.join("; ")}</p>}<p className="directory-links"><a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">DBPR source</a>{row.enrichment?.sourceUrl && <a href={row.enrichment.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a>}{inPlanner && <Link href="/request">Plan a date</Link>}</p></article>;
      })}</div>
      {results.count === 0 && <p className="directory-empty">No matching records. Try another name or show all imported cities.</p>}
      {results.pageCount > 1 && <nav className="directory-pagination" aria-label="Directory pages">{results.page > 1 && <Link href={href(results.page - 1)}>← Previous</Link>}<span>Page {results.page} of {results.pageCount}</span>{results.page < results.pageCount && <Link href={href(results.page + 1)}>Next →</Link>}</nav>}
    </>}
    <footer className="app-footer"><Link href="/">← Date Night Tampa</Link><span>Discovery data is not a reservation or opening-hours guarantee</span></footer>
  </main>;
}
