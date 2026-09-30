import Link from "next/link";
import { getCurrentUser } from "@/lib/local-db";
import { signOut } from "@/app/login/actions";
import { RequestForm } from "./request-form";
import { restaurantCoverageSummary } from "@/lib/venue-catalog";

export const runtime = "nodejs";

export default async function RequestPage() {
  const user = await getCurrentUser();
  return (
    <main className="site-frame app-frame">
      <header className="site-header"><Link className="wordmark" href="/" aria-label="Date Night Tampa home"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link><nav className="site-nav">{user ? <><Link href="/my-dates">My dates</Link><form action={signOut}><button className="nav-signout" type="submit">Sign out</button></form></> : <><Link href="/login">Optional account</Link><Link className="nav-back" href="/">Back to home</Link></>}</nav></header>
      <div className="request-layout">
        <aside className="request-aside"><p className="eyebrow"><span className="eyebrow-dot" /> Your evening, your way</p><h1>Let’s make a night of it.</h1><p className="aside-copy">Share a few details and get a date idea immediately. No account is needed.</p>
          <div className="aside-note"><span className="aside-note-icon" aria-hidden="true">✳</span><div><strong>What happens next?</strong><p>Get named restaurants and activities, addresses, timing and direct links. The planner checks published hours and dated events; reservations remain yours to make.</p></div></div>
          <div className="aside-meta"><span>01</span><span>Thoughtful plans for two</span></div>
        </aside>
        <section className="request-panel"><div className="panel-heading"><span>Your date request</span><span>About 3 minutes</span></div><RequestForm signedIn={Boolean(user)} restaurantCoverage={restaurantCoverageSummary()} /></section>
      </div>
      <footer className="app-footer"><Link href="/">← Date Night Tampa</Link><span>Local preview · Generated ideas do not reserve venues</span></footer>
    </main>
  );
}

