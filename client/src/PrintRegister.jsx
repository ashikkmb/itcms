import { useState } from "react";
import { api } from "./api.js";
import { Icons, S, toUtcDate } from "./components.jsx";

export default function PrintRegister({ orgName = "ITCMS - NAD (A)" }) {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // first of this month
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    if (!fromDate || !toDate) { setError("Please select both dates."); return; }
    if (fromDate > toDate) { setError("From date must be before To date."); return; }
    setError("");
    setLoading(true);
    try {
      const params = {};
      if (category !== "All") params.category = category;
      if (status !== "All") params.status = status;
      const all = await api.getComplaints(params);

      // Filter by date range (inclusive), comparing the IST calendar date —
      // not the raw UTC string, which could be off by a day near midnight IST.
      const filtered = all.filter(c => {
        const createdIST = toUtcDate(c.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // en-CA gives YYYY-MM-DD
        return createdIST >= fromDate && createdIST <= toDate;
      });

      // Sort oldest first for a register-style chronological listing
      filtered.sort((a, b) => toUtcDate(a.created_at) - toUtcDate(b.created_at));

      setComplaints(filtered);
      setGenerated(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const fmtShort = (iso) => {
    // fromDate/toDate inputs are plain "YYYY-MM-DD" with no time — display as-is.
    // Complaint created_at values are full UTC timestamps — convert to IST first.
    const d = iso.length === 10 ? new Date(iso + "T00:00:00") : toUtcDate(iso);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length === 10 ? undefined : "Asia/Kolkata" });
  };
  const fmtRangeLabel = `${fmtShort(fromDate)} to ${fmtShort(toDate)}`;

  return (
    <div>
      {/* ── Screen-only controls (hidden when printing) ── */}
      <div className="no-print" style={{ background: "white", borderRadius: 12, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Generate Printable Register</h3>

        {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 14, color: "#DC2626", fontSize: 13 }}>{error}</div>}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={S.label}>From Date</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>To Date</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...S.select, height: 39 }}>
              <option value="All">All Categories</option>
              <option value="Hardware">Hardware</option>
              <option value="Software">Software</option>
              <option value="INAMS">INAMS</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...S.select, height: 39 }}>
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <button onClick={handleGenerate} disabled={loading}
            style={{ padding: "10px 20px", background: loading ? "#94A3B8" : "linear-gradient(135deg,#0E7490,#1E40AF)", color: "white", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", height: 39 }}>
            {loading ? "Loading…" : "Generate"}
          </button>
          {generated && (
            <button onClick={handlePrint}
              style={{ padding: "10px 20px", background: "linear-gradient(135deg,#059669,#0E7490)", color: "white", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", height: 39, display: "flex", alignItems: "center", gap: 8 }}>
              🖨️ Print / Save as PDF
            </button>
          )}
        </div>
      </div>

      {/* ── Printable A4 Register ── */}
      {generated && (
        <div className="print-page" style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", padding: "32px 36px" }}>
          {/* Register header */}
          <div style={{ textAlign: "center", marginBottom: 24, borderBottom: "2px solid #0F172A", paddingBottom: 16 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", margin: 0 }}>{orgName}</h1>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#334155", margin: "4px 0 0" }}>IT Complaints Register</p>
            <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 0" }}>
              Period: {fmtRangeLabel}
              {category !== "All" && ` · Category: ${category}`}
              {status !== "All" && ` · Status: ${status}`}
            </p>
          </div>

          {complaints.length === 0 ? (
            <p style={{ textAlign: "center", color: "#94A3B8", padding: "40px 0" }}>No complaints found for the selected criteria.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr style={{ background: "#F1F5F9" }}>
                  {["S.No", "Ticket No", "Date", "Complainant", "Category", "Nature of Complaint", "Status", "Remarks"].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {complaints.map((c, i) => (
                  <tr key={c.id} style={{ breakInside: "avoid" }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{c.ticket_no}</td>
                    <td style={tdStyle}>{fmtShort(c.created_at)}</td>
                    <td style={tdStyle}>
                      {c.complainant_name || c.user_name}
                      {(c.raised_by_dept || c.user_dept) && (
                        <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>{c.raised_by_dept || c.user_dept}</div>
                      )}
                    </td>
                    <td style={tdStyle}>{c.category}</td>
                    <td style={{ ...tdStyle, maxWidth: 170 }}>{c.title}</td>
                    <td style={tdStyle}>{c.status}</td>
                    <td style={{ ...tdStyle, maxWidth: 180, fontSize: 9.5 }}>{c.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Signature block for physical record-keeping */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48, paddingTop: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #334155", width: 180, marginBottom: 4 }} />
              <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>Prepared By</p>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ borderTop: "1px solid #334155", width: 180, marginBottom: 4 }} />
              <p style={{ fontSize: 11, color: "#475569", margin: 0 }}>IT Admin Signature</p>
            </div>
          </div>
        </div>
      )}

      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; }
          .print-page {
            border: none !important;
            border-radius: 0 !important;
            padding: 10mm !important;
            box-shadow: none !important;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>
    </div>
  );
}

const thStyle = {
  padding: "6px 8px",
  textAlign: "left",
  fontWeight: 700,
  color: "#334155",
  border: "1px solid #CBD5E1",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.02em",
};

const tdStyle = {
  padding: "6px 8px",
  border: "1px solid #E2E8F0",
  color: "#1E293B",
  verticalAlign: "top",
};
