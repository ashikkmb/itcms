import { useState, useEffect, useCallback } from "react";
import { api, clearToken } from "./api.js";
import { Icons, Badge, Toast, StatCard, S, CAT_COLOR, STA_COLOR, STA_BG, PRI_COLOR, CATEGORIES, STATUSES, fmtDate } from "./components.jsx";
import { ComplaintsTable, ComplaintForm, DetailDrawer } from "./Complaints.jsx";
import UsersPage from "./UsersPage.jsx";
import PrintRegister from "./PrintRegister.jsx";
import KnowledgeReferences from "./KnowledgeReferences.jsx";
import LoginPage from "./LoginPage.jsx";
import orgLogo from "./assets/logo.svg";
import { useIdleTimeout } from "./useIdleTimeout.js";

// ─── Pipeline Bar ─────────────────────────────────────────────────────────────
function PipelineBar({ stats }) {
  if (!stats) return null;
  const { open, inprog, closed, total } = stats;
  return (
    <div style={{ background: "white", borderRadius: 12, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Complaint Pipeline</span>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>Total: {total}</span>
      </div>
      <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", gap: 2, background: "#F1F5F9" }}>
        {open   > 0 && <div style={{ flex: open,   background: "#EF4444", transition: "flex .5s" }} />}
        {inprog > 0 && <div style={{ flex: inprog, background: "#F59E0B", transition: "flex .5s" }} />}
        {closed > 0 && <div style={{ flex: closed, background: "#10B981", transition: "flex .5s" }} />}
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
        {[["Open", open, "#EF4444"], ["In Progress", inprog, "#F59E0B"], ["Closed", closed, "#10B981"]].map(([l, n, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
            <div style={{ width: 8, height: 8, borderRadius: 99, background: c }} />
            {l}: <b style={{ color: "#0F172A" }}>{n}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,      setUser]      = useState(() => { try { return JSON.parse(localStorage.getItem("hd_user")); } catch { return null; } });
  const [page,      setPage]      = useState("dashboard");
  const [complaints,setComplaints]= useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [toast,     setToast]     = useState(null);
  const [catFilter, setCatFilter] = useState("All");
  const [staFilter, setStaFilter] = useState("All");
  const [search,    setSearch]    = useState("");

  const isAdmin = user?.role === "admin";

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }

  // ── Load complaints ──────────────────────────────────────────────────────
  const loadComplaints = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = {};
      if (page === "hardware") params.category = "Hardware";
      if (page === "software") params.category = "Software";
      if (page === "inams")    params.category = "INAMS";
      if (catFilter !== "All" && page === "all") params.category = catFilter;
      if (staFilter !== "All") params.status = staFilter;
      if (search.trim()) params.search = search.trim();
      setComplaints(await api.getComplaints(params));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }, [user, page, catFilter, staFilter, search]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    try { setStats(await api.getStats()); }
    catch {}
  }, [user]);

  useEffect(() => { loadComplaints(); }, [loadComplaints]);
  useEffect(() => { if (page === "dashboard") loadStats(); }, [page, loadStats]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleLogin(u) { setUser(u); setPage("dashboard"); }

  function handleLogout(reason) {
    clearToken();
    setUser(null);
    setPage("dashboard");
    setComplaints([]);
    setStats(null);
    if (reason === "idle") {
      // Show the message on the now-visible login page rather than a toast
      // that would disappear instantly along with the rest of the UI.
      sessionStorage.setItem("hd_logout_reason", "You were signed out due to inactivity.");
    }
  }

  // ── Auto-logout after 5 minutes of inactivity, with a 30s warning toast ────
  useIdleTimeout({
    active: !!user,
    timeoutMs: 5 * 60 * 1000,
    warnMs: 30 * 1000,
    onWarning: () => showToast("You'll be signed out in 30 seconds due to inactivity.", "error"),
    onIdle: () => handleLogout("idle"),
  });

  async function handleSubmit(form) {
    const c = await api.createComplaint(form);
    showToast(`${c.ticket_no} submitted successfully.`);
    setShowForm(false);
    loadComplaints();
    loadStats();
  }

  async function handleClose(id, remarks) {
    await api.closeComplaint(id, remarks);
    showToast("Complaint closed.");
    loadComplaints();
    loadStats();
  }

  async function handleStatusChange(id, status, comment, priority) {
    await api.updateStatus(id, status, comment, priority);
    showToast("Status updated.");
    loadComplaints();
  }

  if (!user) return <LoginPage onLogin={handleLogin} />;

  // ── Nav ────────────────────────────────────────────────────────────────
  const navItems = [
    { key: "dashboard", label: "Dashboard",      icon: <Icons.Dashboard /> },
    { key: "hardware",  label: "Hardware",        icon: <Icons.Hardware /> },
    { key: "software",  label: "Software",        icon: <Icons.Software /> },
    { key: "inams",     label: "INAMS",           icon: <Icons.Network /> },
    { key: "all",       label: "All Complaints",  icon: <Icons.List /> },
    { key: "knowledge", label: "Knowledge References", icon: <Icons.Book /> },
    ...(isAdmin ? [{ key: "print", label: "Print Register", icon: <Icons.Print /> }] : []),
    ...(isAdmin ? [{ key: "users", label: "Manage Users", icon: <Icons.Users /> }] : []),
  ];

  const pageTitle = navItems.find(n => n.key === page)?.label || "Dashboard";

  // Active counts for badge
  const badge = (cat) => stats?.byCat?.find(b => b.category === cat)?.active || 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", background: "#F1F5F9" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width: 228, background: "#0F172A", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={orgLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 13 }}>ITCMS - NAD (A)</div>
              <div style={{ color: "#64748B", fontSize: 10 }}>IT Complaint Management System</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "14px 10px" }}>
          {navItems.map(({ key, label, icon }) => {
            const cnt = key === "hardware" ? badge("Hardware") : key === "software" ? badge("Software") : key === "inams" ? badge("INAMS") : 0;
            const active = page === key;
            return (
              <button key={key} onClick={() => { setPage(key); setCatFilter("All"); setStaFilter("All"); setSearch(""); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: active ? "#1E40AF" : "transparent", color: active ? "white" : "#94A3B8", border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, marginBottom: 2, textAlign: "left", transition: "all .15s" }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "#1E293B"; e.currentTarget.style.color = "white"; }}}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94A3B8"; }}}>
                {icon}
                <span style={{ flex: 1 }}>{label}</span>
                {cnt > 0 && <span style={{ background: "#EF4444", color: "white", borderRadius: 99, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{cnt}</span>}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "14px 10px", borderTop: "1px solid #1E293B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: 99, background: "linear-gradient(135deg,#0E7490,#6366F1)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{user.name[0]}</div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
              <div style={{ color: "#64748B", fontSize: 10 }}>{isAdmin ? "IT Admin" : user.department}</div>
            </div>
          </div>
          <button onClick={handleLogout}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, background: "transparent", color: "#94A3B8", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1E293B"; e.currentTarget.style.color = "#EF4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94A3B8"; }}>
            <Icons.Logout /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>{pageTitle}</h1>
          {!isAdmin && (
            <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", background: "linear-gradient(135deg,#0E7490,#1E40AF)", color: "white", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Icons.Plus /> New Complaint
            </button>
          )}
        </header>

        <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>

          {/* ── Dashboard ── */}
          {page === "dashboard" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
                <StatCard label="Total"       value={stats?.total  ?? "—"} color="#6366F1" icon={<Icons.List />} />
                <StatCard label="Open"        value={stats?.open   ?? "—"} color="#EF4444" icon={<Icons.Alert />} />
                <StatCard label="In Progress" value={stats?.inprog ?? "—"} color="#F59E0B" icon={<Icons.Software />} />
                <StatCard label="Closed"      value={stats?.closed ?? "—"} color="#10B981" icon={<Icons.Check />} />
              </div>

              <PipelineBar stats={stats} />

              {/* Category cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
                {CATEGORIES.map(cat => {
                  const row = stats?.byCat?.find(b => b.category === cat);
                  return (
                    <div key={cat} onClick={() => setPage(cat.toLowerCase())}
                      style={{ background: "white", borderRadius: 12, padding: "20px 22px", border: `1px solid ${CAT_COLOR[cat]}30`, cursor: "pointer", transition: "all .15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = CAT_COLOR[cat]; e.currentTarget.style.boxShadow = `0 4px 20px ${CAT_COLOR[cat]}25`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = `${CAT_COLOR[cat]}30`; e.currentTarget.style.boxShadow = ""; }}>
                      <div style={{ fontSize: 11, color: CAT_COLOR[cat], fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", lineHeight: 1 }}>{row?.total ?? 0}</div>
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>{row?.active ?? 0} active · {row?.closed_count ?? 0} closed</div>
                    </div>
                  );
                })}
              </div>

              {/* Recent complaints */}
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", fontWeight: 700, color: "#0F172A", fontSize: 14 }}>
                  Recent Complaints {isAdmin ? "" : "(My Complaints)"}
                </div>
                <ComplaintsTable complaints={complaints.slice(0, 8)} onSelect={setSelected} loading={loading} />
              </div>
            </>
          )}

          {/* ── Users page ── */}
          {page === "users" && isAdmin && <UsersPage />}

          {/* ── Print Register page ── */}
          {page === "print" && isAdmin && <PrintRegister />}

          {/* ── Knowledge References page ── */}
          {page === "knowledge" && <KnowledgeReferences isAdmin={isAdmin} />}

          {/* ── List pages ── */}
          {["hardware", "software", "inams", "all"].includes(page) && (
            <>
              <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", marginBottom: 16, border: "1px solid #E2E8F0", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ticket, title, user…" style={{ flex: 1, minWidth: 180, padding: "7px 12px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none" }} />
                {page === "all" && (
                  <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={S.select}>
                    <option value="All">All Categories</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                )}
                <select value={staFilter} onChange={e => setStaFilter(e.target.value)} style={S.select}>
                  <option value="All">All Statuses</option>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
                <button onClick={loadComplaints} style={{ padding: "7px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, color: "#1D4ED8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Apply</button>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>{complaints.length} result{complaints.length !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                <ComplaintsTable complaints={complaints} onSelect={setSelected} loading={loading} />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      {showForm && <ComplaintForm user={user} onSubmit={handleSubmit} onClose={() => setShowForm(false)} />}
      {selected && (
        <DetailDrawer
          complaint={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onCloseComplaint={handleClose}
          onStatusChange={handleStatusChange}
        />
      )}
      {toast && <Toast {...toast} />}
    </div>
  );
}
