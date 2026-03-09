const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'society-management-secret';
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'society.db');
const frontendDistPath =
  process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', 'frontend', 'dist');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

app.use(cors());
app.use(express.json());

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    memberId: row.member_id,
    flatNo: row.flat_no,
    buildingName: row.building_name,
  };
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      memberId: user.memberId,
      flatNo: user.flatNo,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = db
        .prepare(
          `
            SELECT u.id, u.name, u.email, u.role, u.member_id, m.flat_no, m.building_name
            FROM users u
            LEFT JOIN members m ON m.id = u.member_id
            WHERE u.id = ?
          `,
        )
        .get(payload.id);

      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = mapUser(user);

      if (requiredRoles.length > 0 && !requiredRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      mobile_no TEXT NOT NULL,
      flat_no TEXT NOT NULL,
      building_name TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      member_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_name TEXT NOT NULL,
      mobile_no TEXT NOT NULL,
      purpose TEXT NOT NULL,
      flat_no TEXT NOT NULL,
      resident_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      entry_time TEXT NOT NULL,
      exit_time TEXT,
      created_by INTEGER NOT NULL,
      approved_by INTEGER,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS maintenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flat_no TEXT NOT NULL,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT,
      paid_at TEXT,
      created_by INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flat_no TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium',
      status TEXT NOT NULL DEFAULT 'Open',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'All',
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
  `);

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

  if (userCount > 0) {
    return;
  }

  const insertMember = db.prepare(`
    INSERT INTO members (name, email, mobile_no, flat_no, building_name, owner_type, status)
    VALUES (@name, @email, @mobile_no, @flat_no, @building_name, @owner_type, @status)
  `);

  const members = [
    {
      name: 'Rohan Mehta',
      email: 'member1@society.com',
      mobile_no: '9876543210',
      flat_no: 'A-101',
      building_name: 'Sunrise Tower',
      owner_type: 'Owner',
      status: 'Active',
    },
    {
      name: 'Neha Sharma',
      email: 'member2@society.com',
      mobile_no: '9876501234',
      flat_no: 'B-203',
      building_name: 'Sunrise Tower',
      owner_type: 'Tenant',
      status: 'Active',
    },
  ];

  const memberIds = members.map((member) => insertMember.run(member).lastInsertRowid);
  const passwordHash = bcrypt.hashSync('password123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, member_id)
    VALUES (@name, @email, @password_hash, @role, @member_id)
  `);

  insertUser.run({
    name: 'Society Admin',
    email: 'admin@society.com',
    password_hash: passwordHash,
    role: 'admin',
    member_id: null,
  });

  insertUser.run({
    name: 'Gate Guard',
    email: 'guard@society.com',
    password_hash: passwordHash,
    role: 'guard',
    member_id: null,
  });

  insertUser.run({
    name: 'Rohan Mehta',
    email: 'member1@society.com',
    password_hash: passwordHash,
    role: 'member',
    member_id: memberIds[0],
  });

  insertUser.run({
    name: 'Neha Sharma',
    email: 'member2@society.com',
    password_hash: passwordHash,
    role: 'member',
    member_id: memberIds[1],
  });

  const adminUser = db.prepare(`SELECT id FROM users WHERE email = 'admin@society.com'`).get();
  const guardUser = db.prepare(`SELECT id FROM users WHERE email = 'guard@society.com'`).get();

  db.prepare(`
    INSERT INTO visitors (visitor_name, mobile_no, purpose, flat_no, resident_name, status, entry_time, exit_time, created_by, approved_by)
    VALUES
    ('Courier Partner', '9988776655', 'Parcel Delivery', 'A-101', 'Rohan Mehta', 'Approved', '2026-03-09T09:30:00.000Z', '2026-03-09T09:42:00.000Z', ?, ?),
    ('Electrician', '9871234567', 'Repair Work', 'B-203', 'Neha Sharma', 'Pending', '2026-03-09T11:00:00.000Z', NULL, ?, NULL)
  `).run(guardUser.id, adminUser.id, guardUser.id);

  db.prepare(`
    INSERT INTO maintenance (flat_no, title, amount, due_date, status, notes, paid_at, created_by)
    VALUES
    ('A-101', 'March Maintenance', 2500, '2026-03-20', 'Pending', 'Monthly society maintenance', NULL, ?),
    ('B-203', 'Water Charges', 900, '2026-03-18', 'Paid', 'Utility bill', '2026-03-08T15:30:00.000Z', ?)
  `).run(adminUser.id, adminUser.id);

  db.prepare(`
    INSERT INTO complaints (flat_no, title, description, priority, status, created_by, resolved_at)
    VALUES
    ('A-101', 'Lift Noise', 'The lift is making unusual noise near the first floor.', 'High', 'Open', ?, NULL),
    ('B-203', 'Parking Light', 'Parking area light is not working.', 'Medium', 'Resolved', ?, '2026-03-08T12:00:00.000Z')
  `).run(memberIds[0] + 2, memberIds[1] + 2);

  db.prepare(`
    INSERT INTO notices (title, description, audience, created_by)
    VALUES
    ('Water Supply Maintenance', 'Water supply will be interrupted from 2 PM to 4 PM on Wednesday for pipeline servicing.', 'All', ?),
    ('Security Advisory', 'Members are requested to pre-approve expected visitors for faster gate clearance.', 'Members', ?)
  `).run(adminUser.id, adminUser.id);
}

initDb();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = db
    .prepare(
      `
        SELECT u.id, u.name, u.email, u.password_hash, u.role, u.member_id, m.flat_no, m.building_name
        FROM users u
        LEFT JOIN members m ON m.id = u.member_id
        WHERE u.email = ?
      `,
    )
    .get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const mappedUser = mapUser(user);

  return res.json({
    token: createToken(mappedUser),
    user: mappedUser,
  });
});

app.get('/api/auth/me', auth(), (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/dashboard/summary', auth(), (req, res) => {
  const { role, flatNo } = req.user;

  if (role === 'admin') {
    return res.json({
      totalMembers: db.prepare('SELECT COUNT(*) AS count FROM members').get().count,
      activeVisitors: db.prepare("SELECT COUNT(*) AS count FROM visitors WHERE status = 'Approved' AND exit_time IS NULL").get().count,
      pendingMaintenance: db.prepare("SELECT COUNT(*) AS count FROM maintenance WHERE status = 'Pending'").get().count,
      openComplaints: db.prepare("SELECT COUNT(*) AS count FROM complaints WHERE status != 'Resolved'").get().count,
      notices: db.prepare('SELECT COUNT(*) AS count FROM notices').get().count,
    });
  }

  if (role === 'guard') {
    return res.json({
      totalEntriesToday: db.prepare("SELECT COUNT(*) AS count FROM visitors WHERE date(entry_time) = date('now')").get().count,
      pendingApprovals: db.prepare("SELECT COUNT(*) AS count FROM visitors WHERE status = 'Pending'").get().count,
      activeVisitors: db.prepare("SELECT COUNT(*) AS count FROM visitors WHERE status = 'Approved' AND exit_time IS NULL").get().count,
    });
  }

  return res.json({
    pendingMaintenance: db.prepare("SELECT COUNT(*) AS count FROM maintenance WHERE flat_no = ? AND status = 'Pending'").get(flatNo).count,
    openComplaints: db.prepare("SELECT COUNT(*) AS count FROM complaints WHERE flat_no = ? AND status != 'Resolved'").get(flatNo).count,
    pendingVisitors: db.prepare("SELECT COUNT(*) AS count FROM visitors WHERE flat_no = ? AND status = 'Pending'").get(flatNo).count,
    notices: db.prepare("SELECT COUNT(*) AS count FROM notices WHERE audience IN ('All', 'Members')").get().count,
  });
});

app.get('/api/members', auth(['admin', 'member']), (req, res) => {
  if (req.user.role === 'member') {
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.user.memberId);
    return res.json(member ? [member] : []);
  }

  const members = db.prepare('SELECT * FROM members ORDER BY created_at DESC').all();
  return res.json(members);
});

app.post('/api/members', auth(['admin']), (req, res) => {
  const { name, email, mobileNo, flatNo, buildingName, ownerType } = req.body;

  if (!name || !email || !mobileNo || !flatNo || !buildingName || !ownerType) {
    return res.status(400).json({ message: 'All member fields are required' });
  }

  const result = db
    .prepare(`
      INSERT INTO members (name, email, mobile_no, flat_no, building_name, owner_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Active')
    `)
    .run(name, email, mobileNo, flatNo, buildingName, ownerType);

  const defaultPassword = bcrypt.hashSync('password123', 10);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, member_id)
    VALUES (?, ?, ?, 'member', ?)
  `).run(name, email, defaultPassword, result.lastInsertRowid);

  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(member);
});

app.get('/api/visitors', auth(['admin', 'guard', 'member']), (req, res) => {
  let visitors;

  if (req.user.role === 'member') {
    visitors = db
      .prepare('SELECT * FROM visitors WHERE flat_no = ? ORDER BY entry_time DESC')
      .all(req.user.flatNo);
  } else {
    visitors = db.prepare('SELECT * FROM visitors ORDER BY entry_time DESC').all();
  }

  return res.json(visitors);
});

app.post('/api/visitors', auth(['admin', 'guard']), (req, res) => {
  const { visitorName, mobileNo, purpose, flatNo, residentName } = req.body;

  if (!visitorName || !mobileNo || !purpose || !flatNo || !residentName) {
    return res.status(400).json({ message: 'All visitor fields are required' });
  }

  const result = db
    .prepare(`
      INSERT INTO visitors (visitor_name, mobile_no, purpose, flat_no, resident_name, status, entry_time, created_by)
      VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?)
    `)
    .run(visitorName, mobileNo, purpose, flatNo, residentName, new Date().toISOString(), req.user.id);

  const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(visitor);
});

app.patch('/api/visitors/:id/status', auth(['admin', 'member']), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(id);

  if (!visitor) {
    return res.status(404).json({ message: 'Visitor not found' });
  }

  if (req.user.role === 'member' && visitor.flat_no !== req.user.flatNo) {
    return res.status(403).json({ message: 'You can only update visitors for your flat' });
  }

  db.prepare('UPDATE visitors SET status = ?, approved_by = ? WHERE id = ?').run(status, req.user.id, id);
  return res.json(db.prepare('SELECT * FROM visitors WHERE id = ?').get(id));
});

app.patch('/api/visitors/:id/exit', auth(['admin', 'guard']), (req, res) => {
  const { id } = req.params;
  const visitor = db.prepare('SELECT * FROM visitors WHERE id = ?').get(id);

  if (!visitor) {
    return res.status(404).json({ message: 'Visitor not found' });
  }

  db.prepare('UPDATE visitors SET exit_time = ? WHERE id = ?').run(new Date().toISOString(), id);
  return res.json(db.prepare('SELECT * FROM visitors WHERE id = ?').get(id));
});

app.get('/api/maintenance', auth(['admin', 'member']), (req, res) => {
  const rows =
    req.user.role === 'member'
      ? db.prepare('SELECT * FROM maintenance WHERE flat_no = ? ORDER BY due_date ASC').all(req.user.flatNo)
      : db.prepare('SELECT * FROM maintenance ORDER BY due_date ASC').all();

  return res.json(rows);
});

app.post('/api/maintenance', auth(['admin']), (req, res) => {
  const { flatNo, title, amount, dueDate, notes } = req.body;

  if (!flatNo || !title || !amount || !dueDate) {
    return res.status(400).json({ message: 'Flat, title, amount, and due date are required' });
  }

  const result = db
    .prepare(`
      INSERT INTO maintenance (flat_no, title, amount, due_date, status, notes, created_by)
      VALUES (?, ?, ?, ?, 'Pending', ?, ?)
    `)
    .run(flatNo, title, Number(amount), dueDate, notes || '', req.user.id);

  return res.status(201).json(db.prepare('SELECT * FROM maintenance WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/maintenance/:id/pay', auth(['admin', 'member']), (req, res) => {
  const record = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(req.params.id);

  if (!record) {
    return res.status(404).json({ message: 'Maintenance record not found' });
  }

  if (req.user.role === 'member' && record.flat_no !== req.user.flatNo) {
    return res.status(403).json({ message: 'You can only pay your own flat maintenance' });
  }

  db.prepare("UPDATE maintenance SET status = 'Paid', paid_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
  return res.json(db.prepare('SELECT * FROM maintenance WHERE id = ?').get(req.params.id));
});

app.get('/api/complaints', auth(['admin', 'member']), (req, res) => {
  const rows =
    req.user.role === 'member'
      ? db.prepare('SELECT * FROM complaints WHERE flat_no = ? ORDER BY created_at DESC').all(req.user.flatNo)
      : db.prepare('SELECT * FROM complaints ORDER BY created_at DESC').all();

  return res.json(rows);
});

app.post('/api/complaints', auth(['member', 'admin']), (req, res) => {
  const { title, description, priority, flatNo } = req.body;
  const targetFlat = req.user.role === 'member' ? req.user.flatNo : flatNo;

  if (!title || !description || !targetFlat) {
    return res.status(400).json({ message: 'Title, description, and flat are required' });
  }

  const result = db
    .prepare(`
      INSERT INTO complaints (flat_no, title, description, priority, status, created_by)
      VALUES (?, ?, ?, ?, 'Open', ?)
    `)
    .run(targetFlat, title, description, priority || 'Medium', req.user.id);

  return res.status(201).json(db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid));
});

app.patch('/api/complaints/:id/status', auth(['admin']), (req, res) => {
  const { status } = req.body;
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id);

  if (!complaint) {
    return res.status(404).json({ message: 'Complaint not found' });
  }

  const resolvedAt = status === 'Resolved' ? new Date().toISOString() : null;
  db.prepare('UPDATE complaints SET status = ?, resolved_at = ? WHERE id = ?').run(status, resolvedAt, req.params.id);

  return res.json(db.prepare('SELECT * FROM complaints WHERE id = ?').get(req.params.id));
});

app.get('/api/notices', auth(['admin', 'member', 'guard']), (req, res) => {
  const rows =
    req.user.role === 'member'
      ? db.prepare("SELECT * FROM notices WHERE audience IN ('All', 'Members') ORDER BY created_at DESC").all()
      : req.user.role === 'guard'
        ? db.prepare("SELECT * FROM notices WHERE audience IN ('All', 'Guards') ORDER BY created_at DESC").all()
        : db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all();

  return res.json(rows);
});

app.post('/api/notices', auth(['admin']), (req, res) => {
  const { title, description, audience } = req.body;

  if (!title || !description || !audience) {
    return res.status(400).json({ message: 'Title, description, and audience are required' });
  }

  const result = db
    .prepare(`
      INSERT INTO notices (title, description, audience, created_by)
      VALUES (?, ?, ?, ?)
    `)
    .run(title, description, audience, req.user.id);

  return res.status(201).json(db.prepare('SELECT * FROM notices WHERE id = ?').get(result.lastInsertRowid));
});

if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Society Management API running on http://localhost:${PORT}`);
});
