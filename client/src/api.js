const BASE = "/api";

function getToken() { return localStorage.getItem("hd_token"); }
export function setToken(t) { localStorage.setItem("hd_token", t); }
export function clearToken() { localStorage.removeItem("hd_token"); localStorage.removeItem("hd_user"); }

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// Same as req(), but sends FormData (multipart) instead of JSON — used for
// requests that include a file attachment. Do NOT set Content-Type manually;
// the browser sets the correct multipart boundary automatically.
async function reqFormData(method, path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  // Auth
  login:          (email, password)      => req("POST", "/auth/login", { email, password }),
  me:             ()                     => req("GET",  "/auth/me"),
  changePassword: (currentPassword, newPassword) => req("POST", "/auth/change-password", { currentPassword, newPassword }),

  // Complaints
  getComplaints:  (params = {})          => req("GET",  "/complaints?" + new URLSearchParams(params)),
  getComplaint:   (id)                   => req("GET",  `/complaints/${id}`),
  getStats:       ()                     => req("GET",  "/complaints/stats"),
  createComplaint:(data)                 => {
    const formData = new FormData();
    formData.append("category", data.category);
    formData.append("title", data.title);
    formData.append("description", data.description);
    formData.append("complainant_name", data.complainant_name);
    if (data.attachment) formData.append("attachment", data.attachment);
    return reqFormData("POST", "/complaints", formData);
  },
  updateStatus:   (id, status, comment, priority) => req("PATCH",`/complaints/${id}/status`, { status, comment, priority }),
  closeComplaint: (id, remarks)          => req("PATCH",`/complaints/${id}/close`, { remarks }),
  getActivity:    (id)                   => req("GET",  `/complaints/${id}/activity`),

  // Users (admin)
  getUsers:       ()                     => req("GET",  "/users"),
  createUser:     (data)                 => req("POST", "/users", data),
  deleteUser:     (id)                   => req("DELETE",`/users/${id}`),
  resetPassword:  (id, newPassword)      => req("PATCH",`/users/${id}/reset-password`, { newPassword }),

  // Knowledge References
  getKnowledgeDocs: ()                   => req("GET",  "/knowledge"),
  uploadKnowledgeDoc: (data)             => {
    const formData = new FormData();
    formData.append("title", data.title);
    formData.append("description", data.description || "");
    formData.append("file", data.file);
    return reqFormData("POST", "/knowledge", formData);
  },
  deleteKnowledgeDoc: (id)               => req("DELETE", `/knowledge/${id}`),
};
