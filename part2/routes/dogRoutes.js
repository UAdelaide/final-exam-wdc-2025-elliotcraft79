const express = require('express');
const router = express.Router();
const db = require('../models/db');

router.get('/mydogs', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    // see if it is in the database
    const [rows] = await db.query(`
      SELECT dog_id, name FROM Dogs
      WHERE owner_id = ?
    `, [req.session.user.user_id]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get dogs' });
  }
});

// GET a list of all dogs
app.get('/', async (req, res) => {
  try {
    // get all the dogs
    const [dogs] = await db.execute(`
      SELECT name AS dog_name, size, username as owner_username
      FROM Dogs INNER JOIN Users on owner_id = user_id
    `);
    res.json(dogs);
  } catch (err) {
    // something went wrong
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

module.exports = router;
