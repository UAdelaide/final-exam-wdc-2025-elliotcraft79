var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

let db;

(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // Set your MySQL root password
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService',
      decimalNumbers: true
    });

    // Create all the tables if they don't exist
    await db.execute(`
        CREATE TABLE IF NOT EXISTS Users (
            user_id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role ENUM('owner', 'walker') NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS Dogs (
            dog_id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            name VARCHAR(50) NOT NULL,
            size ENUM('small', 'medium', 'large') NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS WalkRequests (
            request_id INT AUTO_INCREMENT PRIMARY KEY,
            dog_id INT NOT NULL,
            requested_time DATETIME NOT NULL,
            duration_minutes INT NOT NULL,
            location VARCHAR(255) NOT NULL,
            status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS WalkApplications (
            application_id INT AUTO_INCREMENT PRIMARY KEY,
            request_id INT NOT NULL,
            walker_id INT NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
            FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
            FOREIGN KEY (walker_id) REFERENCES Users(user_id),
            CONSTRAINT unique_application UNIQUE (request_id, walker_id)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS WalkRatings (
            rating_id INT AUTO_INCREMENT PRIMARY KEY,
            request_id INT NOT NULL,
            walker_id INT NOT NULL,
            owner_id INT NOT NULL,
            rating INT CHECK (rating BETWEEN 1 AND 5),
            comments TEXT,
            rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
            FOREIGN KEY (walker_id) REFERENCES Users(user_id),
            FOREIGN KEY (owner_id) REFERENCES Users(user_id),
            CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
        )
    `);

    // Insert data if table is empty
    let [rows] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO Users(username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('elliot', 'elliot@example.com', 'hashedpw', 'owner'),
        ('souljaboy', 'soulja@boy.tellem', 'yuuuuuuuu', 'walker')
      `);
    }

    [rows] = await db.execute('SELECT COUNT(*) AS count FROM Dogs');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO Dogs(owner_id, name, size) VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'elliot'), 'Okara', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'elliot'), 'Torus', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Scruffy', 'medium')
      `);
    }

    [rows] = await db.execute('SELECT COUNT(*) AS count FROM WalkRequests');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO WalkRequests(dog_id, requested_time, duration_minutes, location, status) VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Okara'), '2025-06-20 09:00:00', 40, 'Beach', 'completed'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Torus'), '2025-06-20 10:00:00', 30, 'Dog Park', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Scruffy'), '2025-06-10 08:00:00', 30, 'Town', 'cancelled')
      `);
    }

    [rows] = await db.execute('SELECT COUNT(*) AS count FROM WalkRatings');
    if (rows[0].count === 0) {
      await db.execute(`
        INSERT INTO WalkRatings(request_id, walker_id, owner_id, rating, comments) VALUES
        (1, 2, 1, 5, 'great'),
        (2, 2, 3, 3, 'meh')
      `);
    }
  } catch (err) {
    console.error('Error setting up database: ', err);
  }
})();

// GET a list of all dogs
app.get('/api/dogs', async (req, res) => {
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

// GET a list of all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    // get all open walk requests
    const [requests] = await db.execute(`
      SELECT request_id, Dogs.name as dog_name, requested_time,
      duration_minutes, location, username as owner_username
      FROM (WalkRequests INNER JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id)
      INNER JOIN Users ON Dogs.owner_id = Users.user_id
      WHERE status = 'open'
    `);
    res.json(requests);
  } catch (err) {
    // something went wrong
    res.status(500).json({ error: 'Failed to fetch open walk requests' });
  }
});

// GET a summary of all walkers
app.get('/api/walkers/summary', async (req, res) => {
  try {
    // get the summary of all walkers
    // note that the decimalNumbers option for mysql2 is enabled so that
    // decimal numbers are actually returned as numbers and not strings
    const [summary] = await db.execute(`
      SELECT username AS walker_username, COUNT(rating) AS total_ratings,
      ROUND(AVG(rating), 1) AS average_rating, COUNT(walker_id) AS completed_walks
      FROM Users LEFT JOIN WalkRatings ON user_id = walker_id
      WHERE role = 'walker'
      GROUP BY user_id
    `);
    res.json(summary);
  } catch (err) {
    // something went wrong
    res.status(500).json({ error: 'Failed to fetch walker summary' });
  }
});

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
