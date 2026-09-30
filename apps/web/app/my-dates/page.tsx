import Link from "next/link";
import { dateRequestStatusSchema, generatedPlanSchema, type GeneratedPlan } from "@date-planner/contracts";
import { getCurrentUser, getGuestOwnerHash, listDateRequests, listGuestDateRequests } from "@/lib/local-db";
import { GeneratedPlanView } from "@/app/components/generated-plan";
import { signOut } from "@/app/login/actions";

export const runtime = "nodejs";

type SavedRow = { id: string; requested_local_date: string; status: string; created_at: string; details_json: string };
function savedPlan(row: SavedRow): GeneratedPlan | null {
  try {
    const details: unknown = JSON.parse(row.details_json);
    if (!details || typeof details !== "object") return null;
    const record = details as Record<string, unknown>;
    const current = generatedPlanSchema.safeParse(record.plan);
    if (current.success) {
      const requested = record.request && typeof record.request === "object" ? (record.request as Record<string, unknown>).durationMinutes : undefined;
      if (typeof requested === "number" && current.data.durationMinutes !== requested) return null;
      return current.data;
    }
    return null;
  } catch { return null; }
}

export default async function MyDatesPage() {
  const user = await getCurrentUser();
  const guestOwner = user ? null : await getGuestOwnerHash();
  const requests = user ? listDateRequests(user.id) : guestOwner ? listGuestDateRequests(guestOwner) : [];
  return (
    <main className="site-frame app-frame">
      <header className="site-header"><Link className="wordmark" href="/" aria-label="Date Night Tampa home"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link><nav className="site-nav"><Link className="button button-small" href="/request">Generate a date <span aria-hidden="true">↗</span></Link>{user ? <form action={signOut}><button className="nav-signout" type="submit">Sign out</button></form> : <Link href="/login">Create account</Link>}</nav></header>
      <div className="dashboard-heading"><div><p className="eyebrow"><span className="eyebrow-dot" /> Your little corner</p><h1>My dates<span className="heading-period">.</span></h1><p className="dashboard-welcome">{user ? `Welcome back, ${user.name || "there"}. Your generated ideas are here.` : guestOwner ? "These date ideas are saved in this browser. Create an account to see them on another device." : "Your generated date ideas will live here."}</p></div><div className="dashboard-spark" aria-hidden="true">✳</div></div>
      <div className="dashboard-grid"><section className="dashboard-main"><div className="dashboard-section-head"><h2>{guestOwner && !user ? "Plans on this browser" : "Your plans"}</h2><span>{requests.length.toString().padStart(2, "0")}</span></div>
        {requests.length ? <ul className="request-list">{requests.map((request) => {
          const plan = savedPlan(request);
          return <li className="plan-list-item" key={request.id}><div className="plan-list-heading"><strong>{new Date(`${request.requested_local_date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</strong><span className={`status-pill status-${request.status}`}>{dateRequestStatusSchema.parse(request.status).replaceAll("_", " ")}</span></div>{plan ? <GeneratedPlanView plan={plan} /> : <p>This earlier itinerary needs regeneration: it must include at least one hour for each meal and cover your full allotted duration. <Link href="/request">Generate a new date</Link>.</p>}</li>;
        })}</ul> : <div className="empty-state"><span className="empty-heart" aria-hidden="true">♡</span><div><h3>Your next date starts here.</h3><p>Choose a date, budget, and a few preferences to get an instant idea.</p><Link className="button" href="/request">Generate your first date <span aria-hidden="true">↗</span></Link></div></div>}
      </section><aside className="dashboard-aside"><div className="dashboard-note-icon" aria-hidden="true">✦</div><p className="form-kicker">The good part</p><h2>More us.<br /><span>Less planning.</span></h2><p>Get a venue itinerary tailored to what you like and what you want to spend.</p><Link href="/request" className="text-link">Make another date idea <span aria-hidden="true">↗</span></Link><div className="dashboard-note-foot">Local preview · Tampa, FL</div></aside></div>
      <footer className="app-footer"><Link href="/">← Date Night Tampa</Link><span>Selected venues are not reservations</span></footer>
    </main>
  );
}
