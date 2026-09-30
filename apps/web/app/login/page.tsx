import Link from "next/link";
import { signIn, signUp } from "./actions";

const messages: Record<string, string> = {
  missing: "Enter a valid email and password.",
  credentials: "Those sign-in details were not recognized.",
  signup: "Account creation failed. Use a valid email and a password with at least 12 characters.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="site-frame app-frame">
      <header className="site-header"><Link className="wordmark" href="/" aria-label="Date Night Tampa home"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link><nav className="site-nav"><Link href="/request">Start a request</Link><Link className="nav-back" href="/">Back to home</Link></nav></header>
      <div className="auth-layout">
        <aside className="auth-aside"><p className="eyebrow eyebrow-light">A little more us time</p><h1>Good evenings start with showing up.</h1><p>Your plans, requests, and next steps all in one place.</p><span className="auth-aside-mark" aria-hidden="true">✳</span><span className="auth-aside-foot">Tampa · Made for two</span></aside>
        <section className="auth-content"><p className="eyebrow">Your date night account</p><h2>Come on in.</h2><p className="auth-intro">Sign in to see your dates, or make an account to get started.</p>
          {error && <p role="alert" className="error">{messages[error] ?? "Please try again."}</p>}
          <div className="auth-card-grid">
            <form action={signIn} className="auth-form"><div><span className="form-kicker">Welcome back</span><h3>Sign in</h3></div><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button className="button" type="submit">Sign in <span aria-hidden="true">↗</span></button></form>
            <form action={signUp} className="auth-form auth-form-new"><div><span className="form-kicker">New around here?</span><h3>Create account</h3></div><label>Name<input name="name" autoComplete="name" /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>At least 12 characters</small></label><button className="button button-coral" type="submit">Create account <span aria-hidden="true">↗</span></button></form>
          </div>
        </section>
      </div>
      <footer className="app-footer"><Link href="/">← Date Night Tampa</Link><span>Your account stays private</span></footer>
    </main>
  );
}
