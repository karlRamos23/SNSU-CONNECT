require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/events', require('./routes/events'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request' : 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SNSU Connects running at http://localhost:${PORT}`);
  require('./services/scheduler').start();
});
