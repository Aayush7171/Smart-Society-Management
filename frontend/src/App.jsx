import { useEffect, useState } from 'react';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const DEMO_USERS = [
  { role: 'admin', email: 'admin@society.com', password: 'password123' },
  { role: 'member', email: 'member1@society.com', password: 'password123' },
  { role: 'guard', email: 'guard@society.com', password: 'password123' },
];

const EMPTY_FORMS = {
  login: { email: DEMO_USERS[0].email, password: DEMO_USERS[0].password },
  member: { name: '', email: '', mobileNo: '', flatNo: '', buildingName: '', ownerType: 'Owner' },
  visitor: { visitorName: '', mobileNo: '', purpose: '', flatNo: '', residentName: '' },
  maintenance: { flatNo: '', title: '', amount: '', dueDate: '', notes: '' },
  complaint: { flatNo: '', title: '', description: '', priority: 'Medium' },
  notice: { title: '', description: '', audience: 'All' },
};

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: value.includes('T') ? 'short' : undefined,
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function sectionConfig(role) {
  const common = [{ id: 'overview', label: 'Overview' }, { id: 'notices', label: 'Notices' }];

  if (role === 'admin') {
    return [
      common[0],
      { id: 'members', label: 'Members' },
      { id: 'visitors', label: 'Visitors' },
      { id: 'maintenance', label: 'Maintenance' },
      { id: 'complaints', label: 'Complaints' },
      common[1],
    ];
  }

  if (role === 'guard') {
    return [common[0], { id: 'visitors', label: 'Visitors' }, common[1]];
  }

  return [
    common[0],
    { id: 'profile', label: 'Profile' },
    { id: 'visitors', label: 'Visitors' },
    { id: 'maintenance', label: 'Maintenance' },
    { id: 'complaints', label: 'Complaints' },
    common[1],
  ];
}

async function request(path, options = {}, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.message || 'Request failed');
  }

  return payload;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('society_token') || '');
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('society_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [activeSection, setActiveSection] = useState('overview');
  const [forms, setForms] = useState(EMPTY_FORMS);
  const [summary, setSummary] = useState({});
  const [data, setData] = useState({
    members: [],
    visitors: [],
    maintenance: [],
    complaints: [],
    notices: [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      return;
    }

    loadSession();
  }, []);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    loadDashboard();
  }, [token, user]);

  async function loadSession() {
    try {
      const session = await request('/api/auth/me', {}, token);
      setUser(session.user);
    } catch (_error) {
      logout();
    }
  }

  async function loadDashboard() {
    setBusy(true);
    setError('');

    try {
      const calls = [request('/api/dashboard/summary', {}, token)];
      const role = user.role;

      calls.push(role === 'admin' || role === 'member' ? request('/api/members', {}, token) : Promise.resolve([]));
      calls.push(request('/api/visitors', {}, token));
      calls.push(role === 'admin' || role === 'member' ? request('/api/maintenance', {}, token) : Promise.resolve([]));
      calls.push(role === 'admin' || role === 'member' ? request('/api/complaints', {}, token) : Promise.resolve([]));
      calls.push(request('/api/notices', {}, token));

      const [summaryResponse, members, visitors, maintenance, complaints, notices] = await Promise.all(calls);

      setSummary(summaryResponse);
      setData({ members, visitors, maintenance, complaints, notices });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const result = await request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(forms.login),
      });

      localStorage.setItem('society_token', result.token);
      localStorage.setItem('society_user', JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
      setActiveSection('overview');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem('society_token');
    localStorage.removeItem('society_user');
    setToken('');
    setUser(null);
    setSummary({});
    setData({ members: [], visitors: [], maintenance: [], complaints: [], notices: [] });
  }

  function handleFormChange(formName, field, value) {
    setForms((current) => ({
      ...current,
      [formName]: {
        ...current[formName],
        [field]: value,
      },
    }));
  }

  async function submitAction(path, method, body, resetForm) {
    setBusy(true);
    setError('');

    try {
      await request(
        path,
        {
          method,
          body: body ? JSON.stringify(body) : undefined,
        },
        token,
      );

      if (resetForm) {
        setForms((current) => ({
          ...current,
          [resetForm]: EMPTY_FORMS[resetForm],
        }));
      }

      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="hero-copy">
            <p className="eyebrow">Society Management System</p>
            <h1>Complete management system for residential communities.</h1>
            <p className="subtle">
              Manage visitors, maintenance, complaints, notices and resident records in one place.
            </p>
          </div>

          <form className="panel form-grid" onSubmit={handleLogin}>
            <div className="section-header">
              <div>
                <h2>Sign In</h2>
                <p>Select an account to login.</p>
              </div>
            </div>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={forms.login.email}
                onChange={(event) => handleFormChange('login', 'email', event.target.value)}
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={forms.login.password}
                onChange={(event) => handleFormChange('login', 'password', event.target.value)}
                required
              />
            </label>

            <div className="demo-users">
              {DEMO_USERS.map((demoUser) => (
                <button
                  key={demoUser.role}
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setForms((current) => ({
                      ...current,
                      login: { email: demoUser.email, password: demoUser.password },
                    }))
                  }
                >
                  {demoUser.role}
                </button>
              ))}
            </div>

            {error ? <p className="error-text">{error}</p> : null}

            <button className="primary-button" disabled={busy} type="submit">
              {busy ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sections = sectionConfig(user.role);
  const memberProfile = data.members[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Society Management</p>
          <h2>Control Panel</h2>
          <p className="sidebar-copy">
            {user.name}
            <br />
            <span>{user.role}</span>
          </p>
        </div>

        <nav className="nav-list">
          {sections.map((section) => (
            <button
              key={section.id}
              className={activeSection === section.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveSection(section.id)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>

        <button className="ghost-button" onClick={logout} type="button">
          Logout
        </button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{sections.find((section) => section.id === activeSection)?.label}</h1>
          </div>
          <button className="ghost-button" disabled={busy} onClick={loadDashboard} type="button">
            Refresh
          </button>
        </header>

        {error ? <div className="banner error-text">{error}</div> : null}

        {activeSection === 'overview' ? (
          <>
            <section className="stats-grid">
              {Object.entries(summary).map(([key, value]) => (
                <article className="stat-card" key={key}>
                  <p>{key.replace(/([A-Z])/g, ' $1')}</p>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>

            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Dashboard Summary</h2>
                  <p>Key metrics at a glance.</p>
                </div>
              </div>
              <div className="overview-grid">
                <div className="mini-panel">
                  <h3>Visitors</h3>
                  <p>{data.visitors.length} records</p>
                </div>
                <div className="mini-panel">
                  <h3>Maintenance</h3>
                  <p>{data.maintenance.length} bills</p>
                </div>
                <div className="mini-panel">
                  <h3>Complaints</h3>
                  <p>{data.complaints.length} issues</p>
                </div>
                <div className="mini-panel">
                  <h3>Notices</h3>
                  <p>{data.notices.length} announcements</p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeSection === 'profile' && memberProfile ? (
          <section className="panel detail-grid">
            <div>
              <h2>{memberProfile.name}</h2>
              <p>{memberProfile.email}</p>
            </div>
            <div>
              <h3>Flat</h3>
              <p>{memberProfile.flat_no}</p>
            </div>
            <div>
              <h3>Building</h3>
              <p>{memberProfile.building_name}</p>
            </div>
            <div>
              <h3>Type</h3>
              <p>{memberProfile.owner_type}</p>
            </div>
            <div>
              <h3>Contact</h3>
              <p>{memberProfile.mobile_no}</p>
            </div>
            <div>
              <h3>Status</h3>
              <p>{memberProfile.status}</p>
            </div>
          </section>
        ) : null}

        {activeSection === 'members' ? (
          <>
            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Add Member</h2>
                  <p>Create new resident account.</p>
                </div>
              </div>

              <div className="form-grid split">
                {[
                  ['name', 'Name'],
                  ['email', 'Email'],
                  ['mobileNo', 'Mobile Number'],
                  ['flatNo', 'Flat Number'],
                  ['buildingName', 'Building Name'],
                ].map(([field, label]) => (
                  <label key={field}>
                    <span>{label}</span>
                    <input
                      type="text"
                      value={forms.member[field]}
                      onChange={(event) => handleFormChange('member', field, event.target.value)}
                    />
                  </label>
                ))}
                <label>
                  <span>Owner Type</span>
                  <select
                    value={forms.member.ownerType}
                    onChange={(event) => handleFormChange('member', 'ownerType', event.target.value)}
                  >
                    <option>Owner</option>
                    <option>Tenant</option>
                  </select>
                </label>
              </div>

              <button
                className="primary-button"
                disabled={busy}
                onClick={() => submitAction('/api/members', 'POST', forms.member, 'member')}
                type="button"
              >
                Add Member
              </button>
            </section>

            <DataTable
              columns={['name', 'email', 'flat_no', 'building_name', 'owner_type', 'status']}
              rows={data.members}
              title="Member directory"
            />
          </>
        ) : null}s

        {activeSection === 'visitors' ? (
          <>
            {user.role === 'guard' ? (
              <section className="panel">
                <div className="section-header">
                  <div>
                    <h2>Register Visitor</h2>
                    <p>Record visitor arrival.</p>
                  </div>
                </div>

                <div className="form-grid split">
                  {[
                    ['visitorName', 'Visitor Name'],
                    ['mobileNo', 'Mobile Number'],
                    ['purpose', 'Purpose'],
                    ['flatNo', 'Flat Number'],
                    ['residentName', 'Resident Name'],
                  ].map(([field, label]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type="text"
                        value={forms.visitor[field]}
                        onChange={(event) => handleFormChange('visitor', field, event.target.value)}
                      />
                    </label>
                  ))}
                </div>

                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => submitAction('/api/visitors', 'POST', forms.visitor, 'visitor')}
                  type="button"
                >
                  Save Entry
                </button>
              </section>
            ) : null}

            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Visitor Records</h2>
                  <p>{user.role === 'member' ? 'Approve or reject visitors for your flat.' : 'Manage visitor entries and approvals.'}</p>
                </div>
              </div>
              <div className="list-grid">
                {data.visitors.map((visitor) => (
                  <article className="record-card" key={visitor.id}>
                    <div className="record-header">
                      <div>
                        <h3>{visitor.visitor_name}</h3>
                        <p>{visitor.flat_no} · {visitor.resident_name}</p>
                      </div>
                      <span className={`status-pill ${visitor.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {visitor.status}
                      </span>
                    </div>

                    <p>{visitor.purpose}</p>
                    <p>Entry: {formatDate(visitor.entry_time)}</p>
                    <p>Exit: {formatDate(visitor.exit_time)}</p>

                    <div className="action-row">
                      {(user.role === 'member' || user.role === 'admin') && visitor.status === 'Pending' ? (
                        <>
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={() => submitAction(`/api/visitors/${visitor.id}/status`, 'PATCH', { status: 'Approved' })}
                            type="button"
                          >
                            Approve
                          </button>
                          <button
                            className="ghost-button"
                            disabled={busy}
                            onClick={() => submitAction(`/api/visitors/${visitor.id}/status`, 'PATCH', { status: 'Rejected' })}
                            type="button"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}

                      {(user.role === 'guard' || user.role === 'admin') && !visitor.exit_time ? (
                        <button
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => submitAction(`/api/visitors/${visitor.id}/exit`, 'PATCH')}
                          type="button"
                        >
                          Mark Exit
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeSection === 'maintenance' ? (
          <>
            {(user.role === 'admin') ? (
              <section className="panel">
                <div className="section-header">
                  <div>
                    <h2>Create Maintenance Bill</h2>
                    <p>Create maintenance bills.</p>
                  </div>
                </div>

                <div className="form-grid split">
                  {[
                    ['flatNo', 'Flat Number'],
                    ['title', 'Title'],
                    ['amount', 'Amount'],
                    ['dueDate', 'Due Date'],
                    ['notes', 'Notes'],
                  ].map(([field, label]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type={field === 'dueDate' ? 'date' : field === 'amount' ? 'number' : 'text'}
                        value={forms.maintenance[field]}
                        onChange={(event) => handleFormChange('maintenance', field, event.target.value)}
                      />
                    </label>
                  ))}
                </div>

                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => submitAction('/api/maintenance', 'POST', forms.maintenance, 'maintenance')}
                  type="button"
                >
                  Create Bill
                </button>
              </section>
            ) : null}

            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>Maintenance Ledger</h2>
                  <p>{user.role === 'member' ? 'View and pay your dues.' : 'Track all maintenance records.'}</p>
                </div>
              </div>
              <div className="list-grid">
                {data.maintenance.map((item) => (
                  <article className="record-card" key={item.id}>
                    <div className="record-header">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.flat_no}</p>
                      </div>
                      <span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
                    </div>

                    <p>{formatCurrency(item.amount)}</p>
                    <p>Due: {formatDate(item.due_date)}</p>
                    <p>{item.notes || '-'}</p>

                    {item.status !== 'Paid' ? (
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => submitAction(`/api/maintenance/${item.id}/pay`, 'PATCH')}
                        type="button"
                      >
                        Mark Paid
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeSection === 'complaints' ? (
          <>
            <section className="panel">
              <div className="section-header">
                <div>
                  <h2>File Complaint</h2>
                  <p>{user.role === 'admin' ? 'Create and track complaints.' : 'Report issues in your flat.'}</p>
                </div>
              </div>

              <div className="form-grid split">
                {user.role === 'admin' ? (
                  <label>
                    <span>Flat Number</span>
                    <input
                      type="text"
                      value={forms.complaint.flatNo}
                      onChange={(event) => handleFormChange('complaint', 'flatNo', event.target.value)}
                    />
                  </label>
                ) : null}

                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    value={forms.complaint.title}
                    onChange={(event) => handleFormChange('complaint', 'title', event.target.value)}
                  />
                </label>

                <label>
                  <span>Priority</span>
                  <select
                    value={forms.complaint.priority}
                    onChange={(event) => handleFormChange('complaint', 'priority', event.target.value)}
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                  </select>
                </label>

                <label className="full-span">
                  <span>Description</span>
                  <textarea
                    rows="4"
                    value={forms.complaint.description}
                    onChange={(event) => handleFormChange('complaint', 'description', event.target.value)}
                  />
                </label>
              </div>

              <button
                className="primary-button"
                disabled={busy}
                onClick={() => submitAction('/api/complaints', 'POST', forms.complaint, 'complaint')}
                type="button"
              >
                Submit Complaint
              </button>
            </section>

            <section className="panel">
              <div className="list-grid">
                {data.complaints.map((item) => (
                  <article className="record-card" key={item.id}>
                    <div className="record-header">
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.flat_no} · {item.priority} priority</p>
                      </div>
                      <span className={`status-pill ${item.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.status}
                      </span>
                    </div>

                    <p>{item.description}</p>
                    <p>Created: {formatDate(item.created_at)}</p>

                    {user.role === 'admin' ? (
                      <div className="action-row">
                        {['Open', 'In Progress', 'Resolved'].map((status) => (
                          <button
                            className="ghost-button"
                            disabled={busy || item.status === status}
                            key={status}
                            onClick={() => submitAction(`/api/complaints/${item.id}/status`, 'PATCH', { status })}
                            type="button"
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        {activeSection === 'notices' ? (
          <>
            {user.role === 'admin' ? (
              <section className="panel">
                <div className="section-header">
                  <div>
                    <h2>Publish Notice</h2>
                    <p>Post announcements.</p>
                  </div>
                </div>

                <div className="form-grid split">
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={forms.notice.title}
                      onChange={(event) => handleFormChange('notice', 'title', event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Audience</span>
                    <select
                      value={forms.notice.audience}
                      onChange={(event) => handleFormChange('notice', 'audience', event.target.value)}
                    >
                      <option>All</option>
                      <option>Members</option>
                      <option>Guards</option>
                    </select>
                  </label>
                  <label className="full-span">
                    <span>Description</span>
                    <textarea
                      rows="4"
                      value={forms.notice.description}
                      onChange={(event) => handleFormChange('notice', 'description', event.target.value)}
                    />
                  </label>
                </div>

                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => submitAction('/api/notices', 'POST', forms.notice, 'notice')}
                  type="button"
                >
                  Publish Notice
                </button>
              </section>
            ) : null}

            <section className="list-grid">
              {data.notices.map((notice) => (
                <article className="panel notice-card" key={notice.id}>
                  <div className="record-header">
                    <div>
                      <h2>{notice.title}</h2>
                    </div>
                    <span>{formatDate(notice.created_at)}</span>
                  </div>
                  <p>{notice.description}</p>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function DataTable({ title, columns, rows }) {
  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          <p>{rows.length} record{rows.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column}>{row[column]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default App;
