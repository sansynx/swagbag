import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  DownloadSimple,
  Gift,
  House,
  LockKey,
  Plus,
  Receipt,
  SignOut,
  Sparkle,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import "./App.css";

type Role = "hr" | "finance" | "employee";
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at?: string;
};
type Campaign = {
  id: string;
  title: string;
  occasion: string;
  message: string;
  budget_cents: number;
  status: "open" | "pending" | "paid";
  created_at: string;
  selection_count: number;
  employee_count: number;
};
type Reward = {
  id: string;
  title: string;
  category: string;
  description: string;
};
type Selection = {
  campaign_id: string;
  reward_id: string;
  private_reason: string;
};
type Payment = {
  campaign_id: string;
  title: string;
  occasion: string;
  order_id: string;
  capture_id: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
};
type Audit = {
  id: string;
  actor_name: string | null;
  action: string;
  entity_id: string;
  detail: string;
  created_at: string;
};
type Page = "overview" | "campaigns" | "people" | "finance" | "about";

async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
const date = (value: string) =>
  new Date(
    value.endsWith("Z") ? value : value.replace(" ", "T") + "Z",
  ).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState<Page>("overview");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]),
    [selections, setSelections] = useState<Selection[]>([]),
    [rewards, setRewards] = useState<Reward[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [payments, setPayments] = useState<Payment[]>([]),
    [audit, setAudit] = useState<Audit[]>([]);
  const [paypalConfigured, setPaypalConfigured] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [createOpen, setCreateOpen] = useState(false);
  async function refresh(u: User) {
    const calls: Promise<unknown>[] = [
      api<{ campaigns: Campaign[]; selections: Selection[] }>("campaigns").then(
        (x) => {
          setCampaigns(x.campaigns);
          setSelections(x.selections);
        },
      ),
      api<{ rewards: Reward[] }>("rewards").then((x) => setRewards(x.rewards)),
    ];
    if (u.role !== "employee")
      calls.push(
        api<{ users: User[] }>("users").then((x) => setUsers(x.users)),
      );
    if (u.role === "finance")
      calls.push(
        api<{ payments: Payment[]; auditLogs: Audit[] }>("finance").then(
          (x) => {
            setPayments(x.payments);
            setAudit(x.auditLogs);
          },
        ),
      );
    await Promise.all(calls);
  }
  useEffect(() => {
    api<{ user: User; paypalConfigured: boolean }>("me")
      .then(async (x) => {
        setUser(x.user);
        setPaypalConfigured(x.paypalConfigured);
        await refresh(x.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(location.search).get("payment");
    if (!id) return;
    api(`campaigns/${id}/capture`, {})
      .then(() => {
        setNotice("Payment confirmed. Rewards are ready.");
        return refresh(user);
      })
      .catch((e) => setNotice(e.message))
      .finally(() => {
        history.replaceState(null, "", location.pathname);
      });
  }, [user]);
  async function run<T>(
    path: string,
    data: unknown,
    success: string,
  ): Promise<T | undefined> {
    if (!user) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api<T>(path, data);
      await refresh(user);
      setNotice(success);
      return result;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    await api("auth/logout", {});
    setUser(null);
    setPage("overview");
  }
  if (loading) return <div className="loading">Loading HR Flings…</div>;
  if (!user)
    return (
      <Login
        onLogin={async (u) => {
          setUser(u);
          await refresh(u);
        }}
      />
    );
  const links: { id: Page; label: string; icon: typeof House }[] = [
    { id: "overview", label: "Overview", icon: House },
    { id: "campaigns", label: "Campaigns", icon: Gift },
    ...(user.role === "employee"
      ? []
      : [{ id: "people" as Page, label: "People", icon: Users }]),
    ...(user.role === "finance"
      ? [{ id: "finance" as Page, label: "Finance & audit", icon: Receipt }]
      : []),
    { id: "about", label: "About", icon: Sparkle },
  ];
  const paid = payments
    .filter((p) => p.status === "paid")
    .reduce((n, p) => n + p.amount_cents, 0);
  const committed = campaigns
    .filter((c) => c.status !== "paid")
    .reduce((n, c) => n + c.selection_count * c.budget_cents, 0);
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <Gift weight="bold" size={21} />
          </span>
          HR <b>Flings</b>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map((l) => (
            <button
              key={l.id}
              className={`nav-link ${page === l.id ? "current" : ""}`}
              onClick={() => setPage(l.id)}
            >
              <l.icon size={20} weight={page === l.id ? "fill" : "regular"} />
              {l.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sandbox">
            <img src="/paypal-monogram.png" alt="PayPal" />
            Sandbox integration
          </span>
          <button onClick={logout} className="profile">
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>
                {user.role === "hr"
                  ? "HR manager"
                  : user.role === "finance"
                    ? "Finance admin"
                    : "Employee"}
              </small>
            </span>
            <SignOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            HR Flings <em>/</em> {links.find((l) => l.id === page)?.label}
          </span>
          <span className="top-user">
            <span className="avatar">{initials(user.name)}</span>
            {user.name}
          </span>
        </header>
        <div className="content">
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <Heading
                eyebrow="YOUR WORKSPACE"
                title={`Good to see you, ${user.name.split(" ")[0]}.`}
                description={
                  user.role === "employee"
                    ? "Your moments deserve something you will actually enjoy."
                    : user.role === "hr"
                      ? "Make every milestone feel personal."
                      : "A clear view of every reward and every payment."
                }
                action={
                  user.role === "hr" ? (
                    <button
                      className="button primary"
                      onClick={() => {
                        setPage("campaigns");
                        setCreateOpen(true);
                      }}
                    >
                      <Plus size={17} /> New campaign
                    </button>
                  ) : undefined
                }
              />
              <div className="stats">
                <Stat
                  label={
                    user.role === "finance" ? "Total paid" : "Open moments"
                  }
                  value={
                    user.role === "finance"
                      ? money(paid)
                      : String(
                          campaigns.filter((c) => c.status === "open").length,
                        )
                  }
                  icon={user.role === "finance" ? CreditCard : Gift}
                />
                <Stat
                  label={
                    user.role === "finance"
                      ? "Awaiting payment"
                      : user.role === "employee"
                        ? "Your choices"
                        : "Employees"
                  }
                  value={
                    user.role === "finance"
                      ? money(committed)
                      : String(
                          user.role === "employee"
                            ? selections.length
                            : users.filter((u) => u.role === "employee").length,
                        )
                  }
                  icon={Wallet}
                />
                <Stat
                  label={
                    user.role === "finance" ? "Campaigns" : "Rewards to explore"
                  }
                  value={String(
                    user.role === "finance" ? campaigns.length : rewards.length,
                  )}
                  icon={Sparkle}
                />
              </div>
              <div className="section-heading">
                <div>
                  <h2>
                    {user.role === "employee"
                      ? "Moments for you"
                      : "Recent campaigns"}
                  </h2>
                  <p>
                    {user.role === "employee"
                      ? "Choose a reward that feels right."
                      : "Everything happening across your workspace."}
                  </p>
                </div>
                <button onClick={() => setPage("campaigns")}>
                  View all <ArrowRight size={16} />
                </button>
              </div>
              <Campaigns
                campaigns={campaigns.slice(0, 3)}
                selections={selections}
                rewards={rewards}
                user={user}
                busy={busy}
                paypalConfigured={paypalConfigured}
                run={run}
              />
              <div className="callout">
                <Sparkle size={21} />
                <span>
                  <b>Less guessing. More meaning.</b>
                  <small>
                    People choose what matters to them, while every campaign
                    stays within your budget.
                  </small>
                </span>
              </div>
            </>
          )}
          {page === "campaigns" && (
            <>
              <Heading
                eyebrow="THE MOMENTS"
                title="Campaigns"
                description="Holidays, milestones, onboarding, and everything worth celebrating."
                action={
                  user.role === "hr" ? (
                    <button
                      className="button primary"
                      onClick={() => setCreateOpen(true)}
                    >
                      <Plus size={17} /> New campaign
                    </button>
                  ) : undefined
                }
              />
              {createOpen && user.role === "hr" && (
                <CampaignForm
                  busy={busy}
                  onClose={() => setCreateOpen(false)}
                  onSubmit={async (data) => {
                    if (await run("campaigns", data, "Campaign created."))
                      setCreateOpen(false);
                  }}
                />
              )}
              <Campaigns
                campaigns={campaigns}
                selections={selections}
                rewards={rewards}
                user={user}
                busy={busy}
                paypalConfigured={paypalConfigured}
                run={run}
              />
            </>
          )}
          {page === "people" && user.role !== "employee" && (
            <>
              <Heading
                eyebrow="TEAM ACCESS"
                title="People"
                description="The right people in the right roles."
              />
              {user.role === "finance" && (
                <UserForm
                  busy={busy}
                  onSubmit={async (data) => {
                    await run("users", data, "Team member added.");
                  }}
                />
              )}
              <div className="panel">
                <div className="table-head people-grid">
                  <span>Member</span>
                  <span>Role</span>
                  <span>Added</span>
                </div>
                {users.map((u) => (
                  <div className="people-grid row" key={u.id}>
                    <span className="person">
                      <span className="avatar">{initials(u.name)}</span>
                      <span>
                        <b>{u.name}</b>
                        <small>{u.email}</small>
                      </span>
                    </span>
                    <span className="tag">
                      {u.role === "hr"
                        ? "HR manager"
                        : u.role === "finance"
                          ? "Finance admin"
                          : "Employee"}
                    </span>
                    <span className="secondary-text">
                      {u.created_at ? date(u.created_at) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {page === "finance" && user.role === "finance" && (
            <>
              <Heading
                eyebrow="FINANCIAL CONTROL"
                title="Finance & audit"
                description="Every campaign, commitment, and captured payment."
              />
              <div className="stats">
                <Stat
                  label="Paid through PayPal"
                  value={money(paid)}
                  icon={CreditCard}
                />
                <Stat
                  label="Pending commitments"
                  value={money(committed)}
                  icon={Wallet}
                />
                <Stat
                  label="Payment records"
                  value={String(payments.length)}
                  icon={Receipt}
                />
              </div>
              <div className="section-heading">
                <div>
                  <h2>Payment ledger</h2>
                  <p>
                    Amounts come from employee selections and campaign budgets.
                  </p>
                </div>
                <a className="export-link" href="/api/finance/export/payments">
                  <DownloadSimple size={16} /> Export CSV
                </a>
              </div>
              <div className="panel">
                <div className="table-head ledger-grid">
                  <span>Campaign</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Reference</span>
                </div>
                {payments.length ? (
                  payments.map((p) => (
                    <div className="ledger-grid row" key={p.campaign_id}>
                      <span className="stack">
                        <b>{p.title}</b>
                        <small>
                          {p.occasion} · {date(p.created_at)}
                        </small>
                      </span>
                      <b>{money(p.amount_cents)}</b>
                      <span className={`status ${p.status}`}>{p.status}</span>
                      <code>{p.capture_id || p.order_id}</code>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No payments yet"
                    detail="Approved campaigns will appear here."
                  />
                )}
              </div>
              <div className="section-heading next">
                <div>
                  <h2>Audit trail</h2>
                  <p>Recorded changes and payment actions.</p>
                </div>
                <a className="export-link" href="/api/finance/export/audit">
                  <DownloadSimple size={16} /> Export CSV
                </a>
              </div>
              <div className="panel audit">
                {audit.map((a) => (
                  <div className="audit-row" key={a.id}>
                    <i />
                    <span className="stack">
                      <b>{a.action.replaceAll(".", " · ")}</b>
                      <small>
                        {a.actor_name || "System"} · {a.detail || a.entity_id}
                      </small>
                    </span>
                    <time>{date(a.created_at)}</time>
                  </div>
                ))}
              </div>
            </>
          )}
          {page === "about" && (
            <div className="about">
              <div className="eyebrow">ABOUT HR FLINGS</div>
              <h1>More meaning in every moment.</h1>
              <p>
                HR Flings helps companies celebrate people without assuming
                everyone wants the same thing. Employees privately describe what
                would be useful, choose from approved rewards, and receive
                something that fits the occasion.
              </p>
              <div className="about-grid">
                <div>
                  <Gift size={27} />
                  <h3>Every occasion</h3>
                  <p>
                    Holidays, new hires, anniversaries, team wins, and custom
                    moments.
                  </p>
                </div>
                <div>
                  <LockKey size={27} />
                  <h3>Private by design</h3>
                  <p>
                    Preferences are sent to Cloudflare AI for suggestions. HR
                    sees participation totals, not personal notes.
                  </p>
                </div>
                <div>
                  <CreditCard size={27} />
                  <h3>Clear spending</h3>
                  <p>
                    Finance reviews the total and tests PayPal sandbox checkout.
                    Voucher fulfillment needs a provider integration.
                  </p>
                </div>
              </div>
              <div className="about-foot">
                Built for the PayPal AI Hackathon by HR Flings. Independent
                project; not affiliated with or endorsed by PayPal.
              </div>
              <PasswordForm
                busy={busy}
                onSubmit={async (data) => {
                  return !!(await run(
                    "auth/password",
                    data,
                    "Password updated.",
                  ));
                }}
              />
            </div>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map((l) => (
          <button
            key={l.id}
            className={page === l.id ? "current" : ""}
            onClick={() => setPage(l.id)}
          >
            <l.icon size={21} weight={page === l.id ? "fill" : "regular"} />
            <span>{l.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Gift;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <Icon size={20} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Gift size={25} />
      <b>{title}</b>
      <p>{detail}</p>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const x = await api<{ user: User }>("auth/login", { email, password });
      onLogin(x.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-hero">
        <div className="brand light">
          <span className="brand-icon">
            <Gift weight="bold" size={21} />
          </span>
          HR <b>Flings</b>
        </div>
        <div>
          <div className="eyebrow">REWARDS, REIMAGINED</div>
          <h1>
            Celebrate people.
            <br />
            Skip the guesswork.
          </h1>
          <p>
            Thoughtful rewards for every moment that matters, from the first day
            to the biggest team win.
          </p>
          <div className="pill-row">
            <span>Every occasion</span>
            <span>Every person</span>
            <span>One clear budget</span>
          </div>
        </div>
        <small>
          Built for the PayPal AI Hackathon · PayPal sandbox integration
        </small>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <div className="login-icon">
            <Gift weight="fill" size={24} />
          </div>
          <h2>Welcome back</h2>
          <p>Sign in to your HR Flings workspace.</p>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            Sign in <ArrowRight size={17} />
          </button>
          <small>Access is managed by your organization.</small>
        </form>
      </div>
    </div>
  );
}
function Campaigns({
  campaigns,
  selections,
  rewards,
  user,
  busy,
  paypalConfigured,
  run,
}: {
  campaigns: Campaign[];
  selections: Selection[];
  rewards: Reward[];
  user: User;
  busy: boolean;
  paypalConfigured: boolean;
  run: <T>(
    path: string,
    data: unknown,
    success: string,
  ) => Promise<T | undefined>;
}) {
  const [active, setActive] = useState<string | null>(null),
    [preference, setPreference] = useState(""),
    [recommendations, setRecommendations] = useState<Reward[] | null>(null),
    [reason, setReason] = useState("");
  if (!campaigns.length)
    return (
      <Empty
        title="No campaigns yet"
        detail="The next occasion is just around the corner."
      />
    );
  return (
    <div className="campaigns">
      {campaigns.map((c) => {
        const chosen = selections.find((s) => s.campaign_id === c.id);
        return (
          <article className="campaign" key={c.id}>
            <div className="campaign-symbol">
              <Gift size={24} />
            </div>
            <div className="campaign-content">
              <div className="campaign-meta">
                <span>{c.occasion}</span>
                <span className={`status ${c.status}`}>{c.status}</span>
              </div>
              <h3>{c.title}</h3>
              <p>{c.message || "A little something to mark the moment."}</p>
              <div className="campaign-facts">
                <span>
                  <Wallet size={15} />
                  {money(c.budget_cents)} per person
                </span>
                <span>
                  <Users size={15} />
                  {c.selection_count} of {c.employee_count} chosen
                </span>
                {chosen && (
                  <span className="chosen">
                    <CheckCircle size={15} weight="fill" />
                    Your choice:{" "}
                    {rewards.find((r) => r.id === chosen.reward_id)?.title ||
                      chosen.reward_id}
                  </span>
                )}
              </div>
            </div>
            <div className="campaign-action">
              {user.role === "employee" && c.status === "open" ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    setActive(active === c.id ? null : c.id);
                    setRecommendations(null);
                    setReason("");
                  }}
                >
                  {chosen ? "Change choice" : "Choose reward"}{" "}
                  <ArrowRight size={15} />
                </button>
              ) : user.role === "finance" && c.status !== "paid" ? (
                <button
                  className="button secondary"
                  disabled={!c.selection_count || busy || !paypalConfigured}
                  onClick={async () => {
                    const x = await run<{ approvalUrl: string }>(
                      `campaigns/${c.id}/checkout`,
                      {},
                      "Taking you to PayPal.",
                    );
                    if (x) location.href = x.approvalUrl;
                  }}
                >
                  Pay {money(c.selection_count * c.budget_cents)}{" "}
                  <ArrowRight size={15} />
                </button>
              ) : (
                <span className="secondary-text">
                  {c.status === "paid"
                    ? "Completed"
                    : c.status === "pending"
                      ? "Awaiting PayPal"
                      : "Open"}
                </span>
              )}
            </div>
            {active === c.id && user.role === "employee" && (
              <div className="picker">
                <div className="picker-heading">
                  <Sparkle size={20} />
                  <span>
                    <b>Make this moment yours</b>
                    <small>
                      Tell us what would be useful. Cloudflare AI processes this
                      answer; HR sees only participation totals.
                    </small>
                  </span>
                </div>
                <div className="search-reward">
                  <input
                    aria-label="Your reward preference"
                    maxLength={500}
                    value={preference}
                    onChange={(e) => setPreference(e.target.value)}
                    placeholder="I want to learn, relax, spend time with family..."
                  />
                  <button
                    className="button dark"
                    disabled={busy || preference.trim().length < 8}
                    onClick={async () => {
                      const x = await run<{
                        rewards: Reward[];
                        reason: string;
                      }>(
                        `campaigns/${c.id}/recommend`,
                        { preference },
                        "Personalized picks are ready.",
                      );
                      if (x) {
                        setRecommendations(x.rewards);
                        setReason(x.reason);
                      }
                    }}
                  >
                    Find my fit
                  </button>
                </div>
                {reason && (
                  <div className="reason">
                    <Sparkle size={15} />
                    {reason}
                  </div>
                )}
                <div className="reward-grid">
                  {(recommendations || rewards).map((r) => (
                    <button
                      className="reward"
                      key={r.id}
                      disabled={busy}
                      onClick={async () => {
                        const x = await run(
                          `campaigns/${c.id}/select`,
                          { rewardId: r.id, reason: preference },
                          "Your choice is saved.",
                        );
                        if (x) {
                          setActive(null);
                          setRecommendations(null);
                        }
                      }}
                    >
                      <span>{r.category}</span>
                      <b>{r.title}</b>
                      <small>{r.description}</small>
                      <em>
                        Select <ArrowRight size={15} />
                      </em>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
function CampaignForm({
  onSubmit,
  onClose,
  busy,
}: {
  onSubmit: (data: unknown) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(""),
    [occasion, setOccasion] = useState("Holiday"),
    [message, setMessage] = useState(""),
    [budget, setBudget] = useState("75");
  return (
    <form
      className="panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({
          title,
          occasion,
          message,
          budgetCents: Math.round(Number(budget) * 100),
        });
      }}
    >
      <div className="form-title">
        <span>
          <h2>Create a moment</h2>
          <p>Set the guardrails. Employees make the choice.</p>
        </span>
        <button type="button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="form-grid">
        <label>
          Campaign name
          <input
            required
            minLength={3}
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Winter appreciation 2026"
          />
        </label>
        <label>
          Occasion
          <select
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
          >
            <option>Holiday</option>
            <option>Team achievement</option>
            <option>Work anniversary</option>
            <option>Onboarding</option>
            <option>Recognition</option>
            <option>Custom event</option>
          </select>
        </label>
        <label>
          Budget per employee (USD)
          <input
            required
            type="number"
            min="1"
            max="100000"
            step="1"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label>
          Message to employees
          <input
            maxLength={300}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Thanks for making this quarter remarkable."
          />
        </label>
      </div>
      <button className="button primary" disabled={busy}>
        <Plus size={17} /> Create campaign
      </button>
    </form>
  );
}
function UserForm({
  onSubmit,
  busy,
}: {
  onSubmit: (data: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<Role>("employee"),
    [password, setPassword] = useState("");
  return (
    <form
      className="panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit({ name, email, role, password });
        setName("");
        setEmail("");
        setPassword("");
      }}
    >
      <div className="form-title">
        <span>
          <h2>Add a team member</h2>
          <p>Create access for an employee or manager.</p>
        </span>
      </div>
      <div className="form-grid">
        <label>
          Name
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Morgan"
          />
        </label>
        <label>
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@company.com"
          />
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="employee">Employee</option>
            <option value="hr">HR manager</option>
            <option value="finance">Finance admin</option>
          </select>
        </label>
        <label>
          Temporary password
          <input
            required
            minLength={12}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
          />
        </label>
      </div>
      <button className="button primary" disabled={busy}>
        <Plus size={17} /> Add member
      </button>
    </form>
  );
}
function PasswordForm({
  onSubmit,
  busy,
}: {
  onSubmit: (data: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  return (
    <form
      className="password-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await onSubmit({ currentPassword, newPassword })) {
          setCurrentPassword("");
          setNewPassword("");
        }
      }}
    >
      <h2>Account security</h2>
      <p>Change your password and sign out other sessions.</p>
      <label>
        Current password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </label>
      <label>
        New password
        <input
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>
      <button className="button secondary" disabled={busy}>
        Update password
      </button>
    </form>
  );
}
export default App;
