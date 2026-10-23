require("dotenv").config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const session = require("express-session");

const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 30 * 60 * 1000
    }
}));

// Serve website files from this project folder
app.get("/admin.html", requireAdmin, (req, res) => {
    res.sendFile(__dirname + "/admin.html");
});
app.use(express.static(__dirname));
console.log("Serving files from:", __dirname);
// Connect to MySQL

   const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "college_complaints"

});

db.connect((err) => {
    if (err) {
        console.log("MySQL connection failed:", err.message);
        return;
    }
    console.log("MySQL connected successfully!");
});

// Show the complaint form
app.get("/", (req, res) => {
     res.sendFile(path.join(__dirname, "index.html"));
});

// 
app.post("/admin/login", (req, res) => {
    const { username, password } = req.body;

    const adminUsername = process.env.ADMIN_USERNAME || "admin";
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({
            message: "Admin password is not configured on the server."
        });
    }

    if (username !== adminUsername || password !== adminPassword) {
        return res.status(401).json({
            message: "Incorrect username or password."
        });
    }

    req.session.isAdmin = true;

    res.json({
        message: "Login successful."
    });
});
function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin === true) {
        return next();
    }

    return res.status(401).json({
        message: "Please log in as admin first."
    });
}
app.post("/submit-complaint", (req, res) => {
    const {
        student_name,
        email,
        category,
        subject,
        description
    } = req.body;

    const sql = `
        INSERT INTO complaints
        (student_name, email, category, subject, description)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
        sql,
        [student_name, email, category, subject, description],
        (err, result) => {
            if (err) {
                console.error("Complaint database error:", err.message);
                return res.status(500).json({
                    message: "Failed to save complaint."
                });
            }

            res.status(201).json({
                message: "Complaint submitted successfully!",
                complaintId: result.insertId
            });
        }
    );
});
app.get("/complaint-status/:id", (req, res) => {
    const complaintId = Number(req.params.id);

    if (!Number.isInteger(complaintId) || complaintId < 1) {
        return res.status(400).json({
            message: "Please enter a valid Complaint ID."
        });
    }

    const sql = `
        SELECT id, subject, status, created_at
        FROM complaints
        WHERE id = ?
    `;

    db.query(sql, [complaintId], (err, results) => {
        if (err) {
            console.error("Status lookup error:", err.message);
            return res.status(500).json({
                message: "Could not check complaint status."
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                message: "Complaint ID not found."
            });
        }

        res.json(results[0]);
    });
});
// 
app.get("/admin/complaints",requireAdmin, (req, res) => {
    const sql = `
        SELECT id, student_name, category, subject, description, status
        FROM complaints
        ORDER BY created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Error loading complaints:", err.message);
            return res.status(500).json({
                message: "Could not load complaints."
            });
        }

        res.json(results);
    });
});

app.patch("/admin/complaints/:id/status",requireAdmin, (req, res) => {
    const complaintId = Number(req.params.id);
    const { status } = req.body;

    const allowedStatuses = ["Pending", "In Progress", "Resolved"];

    if (!Number.isInteger(complaintId) || complaintId < 1) {
        return res.status(400).json({
            message: "Invalid complaint ID."
        });
    }

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            message: "Invalid complaint status."
        });
    }

    const sql = "UPDATE complaints SET status = ? WHERE id = ?";

    db.query(sql, [status, complaintId], (err, result) => {
        if (err) {
            console.error("Error updating status:", err.message);
            return res.status(500).json({
                message: "Could not update complaint status."
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Complaint not found."
            });
        }

        res.json({
            message: "Complaint status updated successfully."
        });
    });
});
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
