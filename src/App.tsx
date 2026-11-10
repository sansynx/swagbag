import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  DownloadSimple,
  Gift,
  House,
  Bell,
  LockKey,
  List,
  SidebarSimple,
  Sun,
  MoonStars,
  X,
  Plus,
  Receipt,
  SignOut,
  Sparkle,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import Brand from "./Brand";
import Landing from "./Landing";
import "./App.css";

const DonutChart = lazy(() => import("./DonutChart"));

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
  coupon_count: number;
  audience_type?: "all" | "group" | "person";
  audience_name?: string;
};
type Group = {
  id: string;
  name: string;
  member_ids: string[];
  created_at: string;
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
type Coupon = { campaign_id: string; code: string; created_at: string };
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
type Notification = {
  id: string;
  title: string;
  occasion: string;
  created_at: string;
};
type Page =
  | "overview"
  | "campaigns"
  | "people"
  | "groups"
  | "finance"
  | "about";

let refreshPromise: Promise<boolean> | null = null;
async function request(path: string, data?: unknown) {
  return fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

async function api<T>(path: string, data?: unknown): Promise<T> {
  let response = await request(path, data);
  if (response.status === 401 && !path.startsWith("auth/")) {
    refreshPromise ??= request("auth/refresh", {})
      .then((result) => result.ok)
      .finally(() => {
        refreshPromise = null;
      });
    if (await refreshPromise) response = await request(path, data);
  }
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
    [audit, setAudit] = useState<Audit[]>([]),
    [groups, setGroups] = useState<Group[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [paypalConfigured, setPaypalConfigured] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [navOpen, setNavOpen] = useState(() => window.innerWidth > 800),
    [notificationOpen, setNotificationOpen] = useState(false),
    [notifications, setNotifications] = useState<Notification[]>([]),
    [focusCampaign, setFocusCampaign] = useState<string | null>(null),
    [theme, setTheme] = useState<"light" | "dark">(() =>
      localStorage.getItem("swagbag-theme") === "dark" ? "dark" : "light",
    );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("swagbag-theme", theme);
  }, [theme]);
  useEffect(() => {
    const screen = window.matchMedia("(max-width: 800px)");
    const update = (event: MediaQueryListEvent) => setNavOpen(!event.matches);
    screen.addEventListener("change", update);
    return () => screen.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function refreshNotifications() {
    const result = await api<{ notifications: Notification[] }>(
      "notifications",
    );
    setNotifications(result.notifications);
  }
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
    if (u.role === "hr")
      calls.push(
        api<{ groups: Group[] }>("groups").then((x) => setGroups(x.groups)),
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
    if (u.role === "employee") {
      calls.push(refreshNotifications());
      calls.push(
        api<{ coupons: Coupon[] }>("coupons").then((x) =>
          setCoupons(x.coupons),
        ),
      );
    }
    await Promise.all(calls);
  }
  useEffect(() => {
    if (user?.role !== "employee") return;
    const timer = window.setInterval(() => {
      void refreshNotifications().catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [user]);
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
        setNotice(
          "Sandbox payment captured · Reward delivery needs a provider integration",
        );
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
    setNotifications([]);
  }
  function openCampaign(id: string) {
    setFocusCampaign(id);
    setPage("campaigns");
    setNotificationOpen(false);
    if (user?.role === "employee") {
      void api(`notifications/read`, { campaignId: id })
        .then(refreshNotifications)
        .catch(() => {});
    }
  }
  if (loading)
    return (
      <div className="loading" role="status" aria-live="polite">
        <Brand />
        <p>Making room for better rewards</p>
        <span className="loading-keywords">People · choices · clarity</span>
        <span className="loading-track" aria-hidden="true" />
      </div>
    );
  if (!user)
    return (
      <Landing
        theme={theme}
        onTheme={() => setTheme(theme === "light" ? "dark" : "light")}
        onLogin={async (email, password) => {
          await api("auth/login", {
            email,
            password,
          });
          const session = await api<{ user: User; paypalConfigured: boolean }>(
            "me",
          );
          setPaypalConfigured(session.paypalConfigured);
          setUser(session.user);
          await refresh(session.user);
        }}
        onRegister={async (token, name, password) => {
          await api("auth/register", { token, name, password });
          const session = await api<{ user: User; paypalConfigured: boolean }>(
            "me",
          );
          setPaypalConfigured(session.paypalConfigured);
          setUser(session.user);
          await refresh(session.user);
          history.replaceState(null, "", location.pathname);
        }}
      />
    );
  const links: { id: Page; label: string; icon: typeof House }[] = [
    { id: "overview", label: "Overview", icon: House },
    { id: "campaigns", label: "Campaigns", icon: Gift },
    ...(user.role === "employee"
      ? []
      : [{ id: "people" as Page, label: "People", icon: Users }]),
    ...(user.role === "hr"
      ? [{ id: "groups" as Page, label: "Groups", icon: Users }]
      : []),
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
  const chosenCount =
    user.role === "employee"
      ? selections.length
      : campaigns.reduce((sum, campaign) => sum + campaign.selection_count, 0);
  const availableChoices =
    user.role === "employee"
      ? campaigns.length
      : campaigns.length *
        users.filter((member) => member.role === "employee").length;
  return (
    <div className={`shell ${navOpen ? "nav-open" : "nav-closed"}`}>
      {navOpen && (
        <button
          className="nav-scrim"
          onClick={() => setNavOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className="sidebar" aria-label="Workspace sidebar">
        <div className="sidebar-head">
          <Brand />
          <button
            className="icon-button close-sidebar"
            onClick={() => setNavOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <nav aria-label="Main navigation">
          {links.map((l) => (
            <button
              key={l.id}
              className={`nav-link ${page === l.id ? "current" : ""}`}
              onClick={() => {
                setPage(l.id);
                setNotificationOpen(false);
                if (window.innerWidth <= 800) setNavOpen(false);
              }}
            >
              <l.icon size={20} weight={page === l.id ? "fill" : "regular"} />
              {l.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="sandbox">
            <img src="/paypal-monogram.png" alt="PayPal" />
            {paypalConfigured
              ? "PayPal sandbox ready"
              : "PayPal sandbox preview"}
          </span>
          <button onClick={logout} className="logout-link">
            <SignOut size={19} /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button nav-toggle"
              onClick={() => setNavOpen(!navOpen)}
              aria-label={navOpen ? "Close sidebar" : "Open sidebar"}
            >
              {navOpen ? <SidebarSimple size={22} /> : <List size={22} />}
            </button>
            <span className="topbar-brand">
              <Brand />
            </span>
            <span className="breadcrumb">
              {links.find((l) => l.id === page)?.label}
            </span>
          </div>
          <div className="topbar-actions">
            {user.role === "employee" && (
              <div className="notification-wrap">
                <button
                  className="icon-button notification-button"
                  onClick={() => setNotificationOpen(!notificationOpen)}
                  aria-label={`${notifications.length} new campaign notifications`}
                  aria-expanded={notificationOpen}
                >
                  <Bell size={21} />
                  {notifications.length > 0 && <i>{notifications.length}</i>}
                </button>
                {notificationOpen && (
                  <div className="notification-panel">
                    <div className="notification-title">
                      <strong>New moments</strong>
                      <button
                        className="icon-button"
                        onClick={() => setNotificationOpen(false)}
                        aria-label="Close notifications"
                      >
                        <X size={17} />
                      </button>
                    </div>
                    {notifications.length ? (
                      notifications.map((item) => (
                        <button
                          className="notification-item"
                          key={item.id}
                          onClick={() => openCampaign(item.id)}
                        >
                          <span className="notification-dot" />
                          <span>
                            <strong>{item.title}</strong>
                            <small>
                              {item.occasion} · {date(item.created_at)}
                            </small>
                          </span>
                          <ArrowRight size={15} />
                        </button>
                      ))
                    ) : (
                      <p>All caught up</p>
                    )}
                  </div>
                )}
              </div>
            )}
            <button
              className="icon-button theme-button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? <MoonStars size={21} /> : <Sun size={21} />}
            </button>
            <span className="top-user">
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
            </span>
          </div>
        </header>
        <div className="content">
          {notice && (
            <div className="notice" role="status">
              {notice.replace(/\.$/, "")}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          {page === "overview" && (
            <>
              <section className="workspace-hero">
                <div>
                  <span className="eyebrow">YOUR SPACE, YOUR MOMENTS</span>
                  <h1>
                    {user.role === "employee"
                      ? `There is more to celebrate, ${user.name.split(" ")[0]}`
                      : user.role === "hr"
                        ? `Make it memorable, ${user.name.split(" ")[0]}`
                        : `See the whole picture, ${user.name.split(" ")[0]}`}
                  </h1>
                  <p>
                    {user.role === "employee"
                      ? notifications.length
                        ? `${notifications.length} new moment${notifications.length === 1 ? "" : "s"} waiting for you`
                        : "Choose something that feels like you"
                      : user.role === "hr"
                        ? "Give people a choice that feels genuinely theirs"
                        : "Every reward and every dollar in one clear view"}
                  </p>
                  {user.role === "hr" && (
                    <button
                      className="button primary"
                      onClick={() => {
                        setPage("campaigns");
                        setCreateOpen(true);
                      }}
                    >
                      <Plus size={17} /> Create a moment
                    </button>
                  )}
                </div>
                <img
                  src={`/images/team-${theme}.webp`}
                  alt="Pencil sketch of a team celebration"
                  draggable={false}
                />
              </section>
              <div className="overview-grid">
                <section className="metric-section">
                  <span className="eyebrow">AT A GLANCE</span>
                  <div className="stats">
                    <Stat
                      label={
                        user.role === "finance"
                          ? "Paid through PayPal"
                          : "Open moments"
                      }
                      value={
                        user.role === "finance"
                          ? money(paid)
                          : String(
                              campaigns.filter((c) => c.status === "open")
                                .length,
                            )
                      }
                      icon={user.role === "finance" ? CreditCard : Gift}
                    />
                    <Stat
                      label={
                        user.role === "finance"
                          ? "Ready for payment"
                          : user.role === "employee"
                            ? "Your choices"
                            : "People in the team"
                      }
                      value={
                        user.role === "finance"
                          ? money(committed)
                          : String(
                              user.role === "employee"
                                ? selections.length
                                : users.filter((u) => u.role === "employee")
                                    .length,
                            )
                      }
                      icon={Wallet}
                    />
                    <Stat
                      label={
                        user.role === "finance" ? "Campaigns" : "Ways to choose"
                      }
                      value={String(
                        user.role === "finance"
                          ? campaigns.length
                          : rewards.length,
                      )}
                      icon={Sparkle}
                    />
                  </div>
                </section>
                <section className="chart-section">
                  <div className="chart-heading">
                    <span className="eyebrow">THE PULSE</span>
                    <h2>
                      {user.role === "finance"
                        ? "Money in motion"
                        : user.role === "hr"
                          ? "Team participation"
                          : "Your choices"}
                    </h2>
                  </div>
                  <Suspense
                    fallback={
                      <div
                        className="donut donut-skeleton"
                        aria-label="Loading chart"
                      />
                    }
                  >
                    <DonutChart
                      theme={theme}
                      center={
                        user.role === "finance"
                          ? money(paid)
                          : `${Math.round((100 * chosenCount) / Math.max(1, availableChoices))}%`
                      }
                      caption={user.role === "finance" ? "paid" : "chosen"}
                      slices={
                        user.role === "finance"
                          ? [
                              { name: "Paid", value: paid, color: "#0b67d6" },
                              {
                                name: "Awaiting",
                                value: committed,
                                color: "#ffbd68",
                              },
                            ]
                          : [
                              {
                                name: "Chosen",
                                value: chosenCount,
                                color: "#0b67d6",
                              },
                              {
                                name: "Still to choose",
                                value: Math.max(
                                  0,
                                  availableChoices - chosenCount,
                                ),
                                color: "#c9dff5",
                              },
                            ]
                      }
                    />
                  </Suspense>
                  <div className="chart-legend">
                    <span>
                      <i />
                      {user.role === "finance" ? "Paid" : "Chosen"}
                    </span>
                    <span>
                      <i />
                      {user.role === "finance" ? "Awaiting" : "Still to choose"}
                    </span>
                  </div>
                </section>
              </div>
              <div className="section-heading">
                <div>
                  <h2>
                    {user.role === "employee"
                      ? "Your moments"
                      : "Recent moments"}
                  </h2>
                  <p>
                    {user.role === "employee"
                      ? "Find something that feels right"
                      : "What is happening across your team"}
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
                coupons={coupons}
                theme={theme}
                user={user}
                busy={busy}
                paypalConfigured={paypalConfigured}
                run={run}
                isPreview
                onOpen={openCampaign}
              />
            </>
          )}
          {page === "campaigns" && (
            <>
              <Heading
                eyebrow="THE MOMENTS"
                title="Campaigns"
                description="Holidays, milestones, onboarding and everything worth celebrating"
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
                  users={users}
                  groups={groups}
                  onClose={() => setCreateOpen(false)}
                  onSubmit={async (data) => {
                    if (await run("campaigns", data, "Campaign created"))
                      setCreateOpen(false);
                  }}
                />
              )}
              <Campaigns
                key={focusCampaign || "campaigns"}
                initialActive={focusCampaign}
                campaigns={campaigns}
                selections={selections}
                rewards={rewards}
                coupons={coupons}
                theme={theme}
                user={user}
                busy={busy}
                paypalConfigured={paypalConfigured}
                run={run}
                onOpen={openCampaign}
              />
            </>
          )}
          {page === "people" && user.role !== "employee" && (
            <>
              <Heading
                eyebrow="TEAM ACCESS"
                title="People"
                description="The right people in the right roles"
              />
              {user.role === "finance" && (
                <UserForm
                  busy={busy}
                  onSubmit={async (data) => {
                    return await run<{ invitationUrl: string }>(
                      "invitations",
                      data,
                      "Invitation created",
                    );
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
          {page === "groups" && user.role === "hr" && (
            <GroupsPage
              groups={groups}
              employees={users.filter((member) => member.role === "employee")}
              busy={busy}
              onCreate={(data) => run("groups", data, "Group created")}
              onMembers={(id, memberIds) =>
                run(`groups/${id}/members`, { memberIds }, "Group updated")
              }
            />
          )}
          {page === "finance" && user.role === "finance" && (
            <>
              <Heading
                eyebrow="FINANCIAL CONTROL"
                title="Finance & audit"
                description="Every campaign, commitment and captured payment"
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
                    detail="Approved campaigns will appear here"
                  />
                )}
              </div>
              <div className="section-heading next">
                <div>
                  <h2>Audit trail</h2>
                  <p>Recorded changes and payment actions</p>
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
              <div className="eyebrow">ABOUT SWAGBAG</div>
              <h1>More meaning in every moment</h1>
              <p>
                SwagBag makes company celebrations feel personal through
                thoughtful choices and clear budgets
              </p>
              <div className="about-grid">
                <div>
                  <Gift size={27} />
                  <h3>Every occasion</h3>
                  <p>
                    Holidays, new hires, anniversaries, team wins and custom
                    moments
                  </p>
                </div>
                <div>
                  <LockKey size={27} />
                  <h3>Private by design</h3>
                  <p>
                    Cloudflare AI helps with suggestions while HR sees
                    participation totals without personal notes
                  </p>
                </div>
                <div>
                  <CreditCard size={27} />
                  <h3>Clear spending</h3>
                  <p>
                    Finance sees the total and tests PayPal sandbox checkout
                    while voucher delivery awaits a provider integration
                  </p>
                </div>
              </div>
              <div className="about-foot">
                Built for the PayPal AI Hackathon by SwagBag · Independent
                project, not affiliated with or endorsed by PayPal
              </div>
              <PasswordForm
                busy={busy}
                onSubmit={async (data) => {
                  return !!(await run(
                    "auth/password",
                    data,
                    "Password updated",
                  ));
                }}
              />
            </div>
          )}
        </div>
      </main>
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
function Campaigns({
  campaigns,
  selections,
  rewards,
  coupons,
  theme,
  user,
  busy,
  paypalConfigured,
  run,
  isPreview = false,
  onOpen,
  initialActive = null,
}: {
  campaigns: Campaign[];
  selections: Selection[];
  rewards: Reward[];
  coupons: Coupon[];
  theme: "light" | "dark";
  user: User;
  busy: boolean;
  paypalConfigured: boolean;
  run: <T>(
    path: string,
    data: unknown,
    success: string,
  ) => Promise<T | undefined>;
  isPreview?: boolean;
  onOpen: (id: string) => void;
  initialActive?: string | null;
}) {
  const [active, setActive] = useState<string | null>(initialActive),
    [preference, setPreference] = useState(""),
    [recommendations, setRecommendations] = useState<Reward[] | null>(null),
    [reason, setReason] = useState("");
  const [recipients, setRecipients] = useState<
    {
      id: string;
      name: string;
      email: string;
      chosen: number;
      delivered: number;
    }[]
  >([]);
  const [couponRecipient, setCouponRecipient] = useState("");
  const [couponCode, setCouponCode] = useState("");
  useEffect(() => {
    if (!active || isPreview || user.role !== "hr") return;
    void api<{ recipients: typeof recipients }>(
      `campaigns/${active}/recipients`,
    )
      .then((result) => setRecipients(result.recipients))
      .catch(() => setRecipients([]));
  }, [active, isPreview, user.role]);
  useEffect(() => {
    if (!initialActive || isPreview) return;
    requestAnimationFrame(() =>
      document.getElementById(`campaign-${initialActive}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }, [initialActive, isPreview]);
  if (!campaigns.length)
    return (
      <Empty
        title="No campaigns yet"
        detail="The next occasion is just around the corner"
      />
    );
  return (
    <div className="campaigns">
      {campaigns.map((c) => {
        const chosen = selections.find((s) => s.campaign_id === c.id);
        const coupon = coupons.find((item) => item.campaign_id === c.id);
        const scene =
          c.occasion === "Holiday"
            ? "festival"
            : c.occasion === "Onboarding"
              ? "ride"
              : c.occasion === "Team achievement"
                ? "team"
                : "unwind";
        return (
          <article
            id={`campaign-${c.id}`}
            className={`campaign ${isPreview ? "preview" : ""} ${active === c.id ? "expanded" : ""}`}
            key={c.id}
          >
            <img
              className="campaign-image"
              src={`/images/${scene}-${theme}.webp`}
              alt=""
              draggable={false}
              loading="lazy"
            />
            <div className="campaign-content">
              <div className="campaign-meta">
                <span>{c.occasion}</span>
                <span className={`status ${c.status}`}>{c.status}</span>
                {coupon && <span className="coupon-ready">Code ready</span>}
              </div>
              <h3>{c.title}</h3>
              <p>{c.message || "A little something to mark the moment"}</p>
              {!isPreview && (
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
              )}
            </div>
            <div className="campaign-action">
              {isPreview ? (
                <button
                  className="button text-button"
                  onClick={() => onOpen(c.id)}
                >
                  See moment <ArrowRight size={17} />
                </button>
              ) : user.role === "employee" && c.status === "open" ? (
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
                  title={
                    !paypalConfigured
                      ? "PayPal sandbox credentials are needed"
                      : !c.selection_count
                        ? "Waiting for employee choices"
                        : undefined
                  }
                  onClick={async () => {
                    const x = await run<{ approvalUrl: string }>(
                      `campaigns/${c.id}/checkout`,
                      {},
                      "Taking you to PayPal",
                    );
                    if (x) location.href = x.approvalUrl;
                  }}
                >
                  {!c.selection_count
                    ? "Waiting for choices"
                    : paypalConfigured
                      ? `Pay ${money(c.selection_count * c.budget_cents)}`
                      : "Add PayPal keys to pay"}{" "}
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  className="button text-button"
                  onClick={() => setActive(active === c.id ? null : c.id)}
                >
                  {active === c.id ? "Close details" : "View details"}{" "}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            {active === c.id && !isPreview && user.role !== "employee" && (
              <div className="campaign-detail">
                <div>
                  <span className="eyebrow">MOMENT DETAILS</span>
                  <h4>{c.title}</h4>
                  <p>{c.message || "A little something to mark the moment"}</p>
                </div>
                <div className="detail-facts">
                  <span>
                    Budget per person <strong>{money(c.budget_cents)}</strong>
                  </span>
                  <span>
                    Choices made{" "}
                    <strong>
                      {c.selection_count} of {c.employee_count}
                    </strong>
                  </span>
                  <span>
                    Current state <strong>{c.status}</strong>
                  </span>
                  <span>
                    Sent to <strong>{c.audience_name || "Everyone"}</strong>
                  </span>
                  <span>
                    Codes delivered{" "}
                    <strong>
                      {c.coupon_count} of {c.employee_count}
                    </strong>
                  </span>
                </div>
                {user.role === "hr" && (
                  <div className="coupon-send">
                    <span className="eyebrow">INDIVIDUAL CODE</span>
                    <p>
                      Deliver a pre-funded voucher code privately to one
                      recipient. Code delivery is recorded in the audit trail
                    </p>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (
                          await run(
                            `campaigns/${c.id}/coupons`,
                            { userId: couponRecipient, code: couponCode },
                            "Code sent privately",
                          )
                        ) {
                          setCouponCode("");
                          setCouponRecipient("");
                          const result = await api<{
                            recipients: typeof recipients;
                          }>(`campaigns/${c.id}/recipients`);
                          setRecipients(result.recipients);
                        }
                      }}
                    >
                      <select
                        required
                        aria-label="Coupon recipient"
                        value={couponRecipient}
                        onChange={(event) =>
                          setCouponRecipient(event.target.value)
                        }
                      >
                        <option value="">Choose recipient</option>
                        {recipients
                          .filter((recipient) => !recipient.delivered)
                          .map((recipient) => (
                            <option key={recipient.id} value={recipient.id}>
                              {recipient.name}
                            </option>
                          ))}
                      </select>
                      <input
                        required
                        minLength={4}
                        maxLength={128}
                        aria-label="Coupon code"
                        placeholder="Voucher code"
                        value={couponCode}
                        onChange={(event) => setCouponCode(event.target.value)}
                      />
                      <button
                        className="button primary"
                        disabled={busy || !couponRecipient}
                      >
                        Send code
                      </button>
                    </form>
                    <small>
                      {
                        recipients.filter((recipient) => recipient.delivered)
                          .length
                      }{" "}
                      of {recipients.length} codes sent
                    </small>
                  </div>
                )}
              </div>
            )}
            {active === c.id &&
              !isPreview &&
              user.role === "employee" &&
              coupon && (
                <div className="coupon-received">
                  <span className="eyebrow">YOUR PRIVATE CODE</span>
                  <strong>{coupon.code}</strong>
                  <small>Use this code with its voucher provider</small>
                </div>
              )}
            {active === c.id &&
              !isPreview &&
              user.role === "employee" &&
              c.status !== "open" && (
                <div className="campaign-detail">
                  <span className="eyebrow">MOMENT DETAILS</span>
                  <h4>
                    {c.status === "pending"
                      ? "Payment is in progress"
                      : "Payment has been captured"}
                  </h4>
                  <p>Reward delivery follows after provider fulfillment</p>
                </div>
              )}
            {active === c.id &&
              !isPreview &&
              user.role === "employee" &&
              c.status === "open" && (
                <div className="picker">
                  <div className="picker-heading">
                    <Sparkle size={20} />
                    <span>
                      <b>Make this moment yours</b>
                      <small>
                        Tell us what would be useful · Cloudflare AI processes
                        this answer while HR sees only participation totals
                      </small>
                    </span>
                  </div>
                  <div className="search-reward">
                    <input
                      aria-label="Your reward preference"
                      maxLength={500}
                      value={preference}
                      onChange={(e) => setPreference(e.target.value)}
                      placeholder="I want to learn, relax or spend time with family"
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
                          "Personalized picks are ready",
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
                      {reason.replace(/[.!?]+$/, "")}
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
                            "Your choice is saved",
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
  users,
  groups,
}: {
  onSubmit: (data: unknown) => Promise<void>;
  onClose: () => void;
  busy: boolean;
  users: User[];
  groups: Group[];
}) {
  const [title, setTitle] = useState(""),
    [occasion, setOccasion] = useState("Holiday"),
    [message, setMessage] = useState(""),
    [budget, setBudget] = useState("75"),
    [audienceType, setAudienceType] = useState<"all" | "group" | "person">(
      "all",
    ),
    [audienceId, setAudienceId] = useState("");
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
          audienceType,
          audienceId: audienceType === "all" ? undefined : audienceId,
        });
      }}
    >
      <div className="form-title">
        <span>
          <h2>Create a moment</h2>
          <p>Set the guardrails, then let employees make the choice</p>
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
          Who receives this
          <select
            value={audienceType}
            onChange={(e) => {
              setAudienceType(e.target.value as "all" | "group" | "person");
              setAudienceId("");
            }}
          >
            <option value="all">Everyone</option>
            <option value="group" disabled={!groups.length}>
              A group
            </option>
            <option value="person">One employee</option>
          </select>
        </label>
        {audienceType !== "all" && (
          <label>
            {audienceType === "group" ? "Group" : "Employee"}
            <select
              required
              value={audienceId}
              onChange={(e) => setAudienceId(e.target.value)}
            >
              <option value="">
                Choose {audienceType === "group" ? "a group" : "a person"}
              </option>
              {(audienceType === "group"
                ? groups
                : users.filter((member) => member.role === "employee")
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Message to employees
          <input
            maxLength={300}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Thanks for making this quarter remarkable"
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
  onSubmit: (data: unknown) => Promise<{ invitationUrl: string } | undefined>;
  busy: boolean;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<Role>("employee"),
    [invitationUrl, setInvitationUrl] = useState("");
  return (
    <form
      className="panel form-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await onSubmit({ name, email, role });
        if (result) {
          setInvitationUrl(result.invitationUrl);
          setName("");
          setEmail("");
        }
      }}
    >
      <div className="form-title">
        <span>
          <h2>Invite a teammate</h2>
          <p>Choose their role, then share the private join link</p>
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
      </div>
      <button className="button primary" disabled={busy}>
        <Plus size={17} /> Create invitation
      </button>
      {invitationUrl && (
        <div className="invitation-result" role="status">
          <b>Invitation ready</b>
          <p>
            Copy this link and send it to the teammate. SwagBag does not email
            it automatically
          </p>
          <input
            readOnly
            aria-label="Invitation link"
            value={invitationUrl}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="button secondary"
            onClick={() => void navigator.clipboard?.writeText(invitationUrl)}
          >
            Copy link
          </button>
        </div>
      )}
    </form>
  );
}
function GroupsPage({
  groups,
  employees,
  busy,
  onCreate,
  onMembers,
}: {
  groups: Group[];
  employees: User[];
  busy: boolean;
  onCreate: (data: { name: string; memberIds: string[] }) => Promise<unknown>;
  onMembers: (id: string, memberIds: string[]) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  return (
    <>
      <Heading
        eyebrow="FOCUSED MOMENTS"
        title="Groups"
        description="Celebrate a project team, competition winners or any circle you choose"
      />
      <form
        className="panel form-panel group-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onCreate({ name, memberIds: selected })) {
            setName("");
            setSelected([]);
          }
        }}
      >
        <div className="form-title">
          <span>
            <h2>Create a group</h2>
            <p>New moments sent to this group go to its current members</p>
          </span>
        </div>
        <label>
          Group name
          <input
            required
            minLength={3}
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Design sprint winners"
          />
        </label>
        <div className="group-members" role="group" aria-label="Group members">
          {employees.map((employee) => (
            <label key={employee.id}>
              <input
                type="checkbox"
                checked={selected.includes(employee.id)}
                onChange={() => setSelected(toggle(selected, employee.id))}
              />
              <span>
                <b>{employee.name}</b>
                <small>{employee.email}</small>
              </span>
            </label>
          ))}
        </div>
        <button className="button primary" disabled={busy || !selected.length}>
          <Plus size={17} /> Create group
        </button>
      </form>
      <div className="group-list">
        {groups.map((group) => (
          <section className="group-row" key={group.id}>
            <div className="group-summary">
              <h2>{group.name}</h2>
              <p>
                {group.member_ids.length}{" "}
                {group.member_ids.length === 1 ? "person" : "people"} ·{" "}
                {group.member_ids
                  .map(
                    (id) => employees.find((person) => person.id === id)?.name,
                  )
                  .filter(Boolean)
                  .join(", ") || "No members"}
              </p>
            </div>
            <button
              className="button text-button"
              onClick={() => {
                setEditing(editing === group.id ? null : group.id);
                setDraft(group.member_ids);
              }}
            >
              {editing === group.id ? "Close" : "Edit members"}
            </button>
            {editing === group.id && (
              <div className="group-editor">
                <div
                  className="group-members"
                  role="group"
                  aria-label={`Members of ${group.name}`}
                >
                  {employees.map((employee) => (
                    <label key={employee.id}>
                      <input
                        type="checkbox"
                        checked={draft.includes(employee.id)}
                        onChange={() => setDraft(toggle(draft, employee.id))}
                      />
                      <span>
                        <b>{employee.name}</b>
                        <small>{employee.email}</small>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  className="button primary"
                  disabled={busy || !draft.length}
                  onClick={async () => {
                    if (await onMembers(group.id, draft)) setEditing(null);
                  }}
                >
                  Save members
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
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
      <p>Change your password and sign out other sessions</p>
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
