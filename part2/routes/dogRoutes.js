const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/mydogs', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    // see if it is in the database
    const [rows] = await db.query(`
      SELECT dog_id, name FROM Dogs
      WHERE owner_id = ?
    `, [req.session.user.user_id]);

    res.json({ dogs: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get dogs' });
  }
});

module.exports = router;
