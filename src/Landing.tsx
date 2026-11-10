import { useEffect, useState } from "react";
import {
  ArrowRight,
  Buildings,
  Heart,
  LockKey,
  MoonStars,
  Sparkle,
  Sun,
  X,
} from "@phosphor-icons/react";
import Brand from "./Brand";
import "./Landing.css";

type Role = "employee" | "hr" | "finance";

const doors: {
  role: Role;
  label: string;
  detail: string;
  icon: typeof Heart;
}[] = [
  {
    role: "employee",
    label: "I'm an employee",
    detail: "See your moments and choose what feels right",
    icon: Heart,
  },
  {
    role: "hr",
    label: "I'm in HR",
    detail: "Make every milestone feel personal",
    icon: Sparkle,
  },
  {
    role: "finance",
    label: "I'm in finance",
    detail: "Keep the generosity in view",
    icon: Buildings,
  },
];

export default function Landing({
  theme,
  onTheme,
  onLogin,
}: {
  theme: "light" | "dark";
  onTheme: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!role) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRole(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [role]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <Brand />
        <nav aria-label="Landing navigation">
          <a href="#how">How it works</a>
          <a href="#moments">Moments</a>
          <a href="#sign-in">For your team</a>
        </nav>
        <div className="landing-actions">
          <button
            className="theme-toggle"
            onClick={onTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            <span className="theme-orbit">
              {theme === "light" ? <MoonStars size={22} /> : <Sun size={22} />}
            </span>
          </button>
          <button className="text-action" onClick={() => setRole("employee")}>
            Sign in <ArrowRight size={17} />
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="eyebrow">THE BETTER WAY TO SAY THANK YOU</span>
            <h1>
              Good moments deserve <em>good choices</em>
            </h1>
            <p>
              Celebrate the people behind every milestone with a reward they
              actually want
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#sign-in">
                Find your place <ArrowRight size={18} />
              </a>
              <a className="inline-link" href="#how">
                See how it works <ArrowRight size={17} />
              </a>
            </div>
            <div className="hero-note">
              <span className="note-line" /> Made for every kind of occasion
            </div>
          </div>
          <div className="hero-visual">
            <img
              src="/images/hero.webp"
              alt="Playful pencil sketch of coworkers celebrating"
              draggable={false}
              fetchPriority="high"
            />
            <div className="hero-seal">
              <Sparkle size={21} weight="fill" />
              <span>
                Less stuff
                <br />
                More meaning
              </span>
            </div>
          </div>
        </section>

        <section className="landing-flow" id="how">
          <div className="flow-intro">
            <span className="eyebrow">HOW IT FLOWS</span>
            <h2>
              One moment
              <br />
              <em>many ways to enjoy it</em>
            </h2>
          </div>
          <div className="flow-steps">
            <div>
              <span>01</span>
              <strong>HR sets the occasion</strong>
              <p>A team win, a first day, a holiday or just because</p>
            </div>
            <div>
              <span>02</span>
              <strong>People choose their fit</strong>
              <p>A course, a quiet night, a new experience and more</p>
            </div>
            <div>
              <span>03</span>
              <strong>Finance stays in view</strong>
              <p>Clear budgets, a payment record and an audit trail</p>
            </div>
          </div>
        </section>

        <section className="moments" id="moments">
          <div className="moments-heading">
            <span className="eyebrow">LIFE ISN'T ONE SIZE FITS ALL</span>
            <h2>
              Make room for <em>their kind of joy</em>
            </h2>
            <p>Small moments and big celebrations can feel equally personal</p>
          </div>
          <div className="moments-gallery">
            <figure className="moment-tall">
              <img
                src="/images/festival.webp"
                alt="Pencil sketch of festival lanterns and faceless dancers"
                draggable={false}
                loading="lazy"
              />
              <figcaption>
                For the nights together <span>01 / 04</span>
              </figcaption>
            </figure>
            <figure>
              <img
                src="/images/ride.webp"
                alt="Pencil sketch of a bicycle ride"
                draggable={false}
                loading="lazy"
              />
              <figcaption>
                For finding your own way <span>02 / 04</span>
              </figcaption>
            </figure>
            <figure>
              <img
                src="/images/unwind.webp"
                alt="Pencil sketch of a quiet evening with a book"
                draggable={false}
                loading="lazy"
              />
              <figcaption>
                For slowing down <span>03 / 04</span>
              </figcaption>
            </figure>
            <figure className="moment-wide">
              <img
                src="/images/team.webp"
                alt="Pencil sketch of a team celebration"
                draggable={false}
                loading="lazy"
              />
              <figcaption>
                For every win worth sharing <span>04 / 04</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="doors" id="sign-in">
          <div>
            <span className="eyebrow">YOUR SPACE STARTS HERE</span>
            <h2>Come on in</h2>
            <p>
              One home for the people who give, receive and keep it all in
              balance
            </p>
          </div>
          <div className="door-list">
            {doors.map((door) => (
              <button key={door.role} onClick={() => setRole(door.role)}>
                <door.icon size={25} weight="light" />
                <span>
                  <strong>{door.label}</strong>
                  <small>{door.detail}</small>
                </span>
                <ArrowRight size={23} />
              </button>
            ))}
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>Built for the PayPal AI Hackathon by HR Flings</span>
        <span>Independent project · PayPal sandbox</span>
      </footer>

      {role && (
        <div
          className="login-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRole(null);
          }}
        >
          <div
            className="login-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`${role} sign in`}
          >
            <button
              className="icon-button close-login"
              onClick={() => setRole(null)}
              aria-label="Close sign in"
            >
              <X size={22} />
            </button>
            <Brand />
            <span className="eyebrow">WELCOME BACK</span>
            <h2>
              {role === "hr"
                ? "Make a moment"
                : role === "finance"
                  ? "Keep it in view"
                  : "Your moments await"}
            </h2>
            <p>
              Sign in to your{" "}
              {role === "hr"
                ? "HR"
                : role === "finance"
                  ? "finance"
                  : "employee"}{" "}
              space
            </p>
            <form onSubmit={submit}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@company.com"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="Your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="button primary full" disabled={busy}>
                Enter workspace <ArrowRight size={18} />
              </button>
            </form>
            <small className="login-assurance">
              <LockKey size={14} /> Access is managed by your organization
            </small>
          </div>
        </div>
      )}
    </div>
  );
}
