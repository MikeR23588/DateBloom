import Link from "next/link";
import { HeroDoodles } from "./components/hero-doodles";
import { HeroBackdrop } from "./components/hero-backdrop";

export default function Home() {
  return (
    <main className="site-frame home-frame">
      <div className="sunset-scene">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Date Night Tampa home"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link>
        <nav className="site-nav" aria-label="Main navigation"><a href="#how-it-works">How it works</a><Link href="/restaurants">Restaurants</Link><Link href="/login">Sign in</Link><Link className="button button-small" href="/request">Start planning <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <section className="hero">
        <HeroBackdrop />
        <HeroDoodles />
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> A better night out, planned for you</p>
          <h1>Make room for a little <span className="heading-accent">romance.</span></h1>
          <p className="hero-intro">Tell us when you’re free, what you love, and what you want to spend. Get a date idea built around you.</p>
          <div className="hero-actions"><Link className="button button-large" href="/request">Plan my date <span aria-hidden="true">↗</span></Link><a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div>
          <div className="hero-details"><span>Made for two</span><i /><span>Your budget, your pace</span><i /><span>Tampa, FL</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration of a planned date night">
          <span className="art-caption">A night that feels like you</span>
          <div className="date-card">
            <div className="date-card-top"><span>Your date, at a glance</span><span className="card-heart" aria-hidden="true">💖</span></div>
            <div className="date-card-title">A little dinner.<br /><span>A lot of together.</span></div><div className="date-card-rule" />
            <div className="date-stop"><span className="stop-number">01</span><span><strong>Something delicious</strong><small>A meal idea picked for your taste</small></span><span className="stop-icon" aria-hidden="true">🍝</span></div>
            <div className="date-stop"><span className="stop-number">02</span><span><strong>Something memorable</strong><small>A fun second stop, your way</small></span><span className="stop-icon stop-icon-sun" aria-hidden="true">🎡</span></div>
            <div className="date-card-foot"><span className="mini-spark" aria-hidden="true">✦</span><span>Automatically planned around you</span></div>
          </div>
          <div className="art-sticker"><span>The<br />night is<br /><strong>yours</strong></span><span className="sticker-star" aria-hidden="true">✳</span></div>
        </div>
      </section>
      </div>
      <div className="promise-strip"><span className="promise-label">Less scrolling</span><span className="promise-mark" aria-hidden="true">✳</span><span className="promise-message">More looking at each other.</span><span className="promise-location">That’s the plan <span aria-hidden="true">↗</span></span></div>
      <section className="how-section" id="how-it-works">
        <div className="section-heading"><div><p className="eyebrow">A good plan, minus the homework</p><h2>You bring the <span>“us.”</span><br />Get an idea that fits.</h2></div><p className="section-intro">No endless tabs. No “what do you want to do?” loop. Start with a venue itinerary built around the two of you.</p></div>
        <div className="steps-grid">
          <article className="step-card step-card-peach"><span className="step-index">01 / You set the scene</span><span className="step-illustration" aria-hidden="true">💌</span><h3>Tell us what fits.</h3><p>Share your date, budget, starting neighborhood, and the kind of night you have in mind.</p></article>
          <article className="step-card step-card-sage"><span className="step-index">02 / Your idea appears</span><span className="step-illustration step-illustration-spark" aria-hidden="true">✨</span><h3>A plan, instantly.</h3><p>The app selects real restaurants and activities, with opening hours, event times and cost estimates.</p></article>
          <article className="step-card step-card-yellow"><span className="step-index">03 / Make it your night</span><span className="step-illustration step-illustration-sun" aria-hidden="true">🌴</span><h3>Your places, picked.</h3><p>See the selected venues, addresses, menus and event listings. Reserve directly when needed.</p></article>
        </div>
      </section>
      <section className="closing-cta"><div><p className="eyebrow eyebrow-light">Your next favorite evening starts here</p><h2>Ready to make a night of it?</h2></div><Link className="button button-cream" href="/request">Let’s plan it <span aria-hidden="true">↗</span></Link></section>
      <footer className="site-footer"><Link className="wordmark wordmark-footer" href="/"><span className="wordmark-mark">d</span><span>Date night<span className="wordmark-city">Tampa</span></span></Link><p>Local preview · Sourced Tampa venues · Reservations made directly</p><Link href="/login">Your account</Link></footer>
    </main>
  );
}
