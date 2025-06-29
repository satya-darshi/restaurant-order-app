const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const secretKey = "yourSecretKey";

require('dotenv').config();


const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Database Connection

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});


db.connect(err => {
    if (err) throw err;
    console.log("Connected to MySQL database");
});

// Admin Login API
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;

    db.query("SELECT * FROM admin_users WHERE username = ?", [username], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ message: "Invalid username or password" });

        const admin = results[0];
        bcrypt.compare(password, admin.password, (err, match) => {
            if (match) {
                const token = jwt.sign({ admin_id: admin.admin_id }, secretKey, { expiresIn: '2h' });
                res.json({ success: true, token });
            } else {
                res.status(401).json({ message: "Invalid credentials" });
            }
        });
    });
});

// Middleware to Protect Admin Routes
function verifyToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: "Access denied" });

    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) return res.status(403).json({ message: "Invalid token" });
        req.admin_id = decoded.admin_id;
        next();
    });
}

// Protect Admin Panel APIs
app.get('/admin/orders', verifyToken, (req, res) => {
    db.query("SELECT * FROM orders", (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

app.get('/menu-items', (req, res) => {
    db.query("SELECT * FROM menu_items", (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results); // Includes both available & disabled items
    });
});

app.get('/menu-items/customer', (req, res) => {
    db.query("SELECT * FROM menu_items WHERE availability = TRUE", (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Place an Order
app.post('/order', (req, res) => {
    const { user_id, order_type, total_cost, items } = req.body;

    db.query("INSERT INTO orders (user_id, order_type, total_cost, status) VALUES (?, ?, ?, 'Pending')",
        [user_id, order_type, total_cost], (err, result) => {
            if (err) return res.status(500).send(err);
            const orderId = result.insertId;

            // Add items to the order
            const orderItemsQuery = "INSERT INTO order_items (order_id, item_id, quantity, total_price) VALUES ?";
            const orderItemsValues = items.map(item => [orderId, item.item_id, item.quantity, item.quantity * item.price]);

            db.query(orderItemsQuery, [orderItemsValues], (err) => {
                if (err) return res.status(500).send(err);
                res.json({ order_id: orderId });
            });
        });
});

// Process Payment
app.post('/payment', (req, res) => {
    const { order_id, payment_method, payment_status } = req.body;
    
    // For online payments, we would typically integrate with a payment gateway here
    // For now, we'll simulate payment processing
    
    db.query("INSERT INTO payments (order_id, payment_method, payment_status) VALUES (?, ?, ?)",
        [order_id, payment_method, payment_status], (err, result) => {
            if (err) res.status(500).send(err);
            else {
                // For online orders, automatically update the order status based on payment
                if (payment_status === 'Success') {
                    db.query("UPDATE orders SET status = 'Pending' WHERE order_id = ?", [order_id]);
                } else {
                    db.query("UPDATE orders SET status = 'Cancelled' WHERE order_id = ?", [order_id]);
                }
                res.json({ success: true, order_id: order_id });
            }
        });
});

// Get specific order status
app.get('/orders/status/:order_id', (req, res) => {
    const { order_id } = req.params;
    db.query("SELECT status FROM orders WHERE order_id = ?", [order_id], (err, results) => {
        if (err) res.status(500).send(err);
        else if (results.length === 0) res.status(404).json({ message: "Order not found" });
        else res.json({ status: results[0].status });
    });
});

// Get Orders for a User
app.get('/orders/:user_id', (req, res) => {
    const { user_id } = req.params;
    db.query("SELECT * FROM orders WHERE user_id = ?", [user_id], (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Get Order Items
app.get('/order-items/:order_id', (req, res) => {
    const { order_id } = req.params;
    db.query("SELECT * FROM order_items WHERE order_id = ?", [order_id], (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Update Menu Item Availability
app.put('/menu-items/:item_id', (req, res) => {
    const { item_id } = req.params;
    const { availability } = req.body;
    db.query("UPDATE menu_items SET availability = ? WHERE item_id = ?", [availability, item_id], (err, result) => {
        if (err) res.status(500).send(err);
        else res.json({ success: true });
    });
});

// Get all orders
app.get('/orders', (req, res) => {
    db.query("SELECT * FROM orders", (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Update order status
app.put('/orders/:order_id', (req, res) => {
    const { order_id } = req.params;
    const { status } = req.body;
    db.query("UPDATE orders SET status = ? WHERE order_id = ?", [status, order_id], (err) => {
        if (err) res.status(500).send(err);
        else res.json({ success: true });
    });
});

// Get payment records
app.get('/payments', (req, res) => {
    db.query("SELECT * FROM payments", (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Get payments for a specific order
app.get('/payments/:order_id', (req, res) => {
    const { order_id } = req.params;
    db.query("SELECT * FROM payments WHERE order_id = ?", [order_id], (err, results) => {
        if (err) res.status(500).send(err);
        else res.json(results);
    });
});

// Start Server
app.listen(3000, () => console.log("Server running on port 3000"));