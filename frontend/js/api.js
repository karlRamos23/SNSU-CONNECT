// Small fetch wrapper that talks to the Express backend
const API = {
  token: localStorage.getItem('snsu_token'),
  setToken(t) {
    this.token = t;
    t ? localStorage.setItem('snsu_token', t) : localStorage.removeItem('snsu_token');
  },
  async raw(method, url, body) {
    const r = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: 'Bearer ' + this.token } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 && this.token) { this.setToken(null); location.reload(); }
    return r;
  },
  async req(method, url, body) {
    const r = await this.raw(method, url, body);
    let d = {};
    try { d = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
    return d;
  },
  async blob(url) {
    const r = await this.raw('GET', url);
    if (!r.ok) throw new Error('Download failed.');
    return r.blob();
  },
  get: (u) => API.req('GET', u),
  post: (u, b) => API.req('POST', u, b),
  put: (u, b) => API.req('PUT', u, b),
  del: (u) => API.req('DELETE', u),
};
