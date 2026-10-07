const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 3000;
const bcrypt = require("bcrypt");
// استقبال بيانات JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل ملفات الموقع
app.use(express.static(__dirname));

// الاتصال بقاعدة بيانات لُقمة
const dbPath = path.join(__dirname, "luqma_new.db");
console.log("DATABASE PATH:", dbPath);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("Connected to LUQMA database ✓");
  }
});

// تفعيل العلاقات بين الجداول
db.run("PRAGMA foreign_keys = ON");
db.run(
  "ALTER TABLE profiles ADD COLUMN sugar_goal REAL DEFAULT 50",
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.error("SUGAR COLUMN ERROR:", err.message);
    } else {
      console.log("sugar_goal ready ✓");
    }
  }
);

db.run(
  "ALTER TABLE profiles ADD COLUMN favorite_vibe TEXT DEFAULT 'balanced'",
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.error("VIBE COLUMN ERROR:", err.message);
    } else {
      console.log("favorite_vibe ready ✓");
    }
  }
);
// اختبار السيرفر
app.get("/api/test", (req, res) => {
  res.json({
    message: "LUQMA backend is working!"
  });
});
// جلب جميع الأكلات من قاعدة البيانات
app.get("/api/foods", (req, res) => {
  db.all("SELECT * FROM foods ORDER BY id", [], (err, rows) => {
    if (err) {
      console.error("FOODS ERROR:", err.message);

      return res.status(500).json({
        error: err.message
      });
    }

    res.json(rows);
  });
});
// إضافة أكلة إلى My Day
app.post("/api/daily-meals", (req, res) => {
  const { user_id, food_id, quantity, meal_type, meal_date } = req.body;

  const sql = `
    INSERT INTO daily_meals
    (user_id, food_id, quantity, meal_type, meal_date)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [user_id, food_id, quantity, meal_type, meal_date],
    function (err) {
      if (err) {
        console.error("ADD MEAL ERROR:", err.message);
        return res.status(500).json({ error: err.message });
      }

      res.status(201).json({
        message: "Meal added successfully",
        id: this.lastID
      });
    }
  );
});
// جلب وجبات المستخدم
app.get("/api/daily-meals/:userId", (req, res) => {
  const userId = req.params.userId;
  const mealDate = req.query.date;

  let sql = `
    SELECT
      daily_meals.id,
      daily_meals.quantity,
      daily_meals.meal_type,
      daily_meals.meal_date,

      foods.id AS food_id,
      foods.name_en,
      foods.name_ar,
      foods.calories,
      foods.protein,
      foods.carbs,
      foods.fat,
      foods.sugar,
REPLACE(foods.image, 'images/', '') AS image
    FROM daily_meals

    JOIN foods
      ON daily_meals.food_id = foods.id

    WHERE daily_meals.user_id = ?
  `;

  const params = [userId];

  if (mealDate) {
    sql += ` AND daily_meals.meal_date = ?`;
    params.push(mealDate);
  }

  sql += ` ORDER BY daily_meals.id DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("GET MEALS ERROR:", err.message);
      return res.status(500).json({
        error: err.message
      });
    }

    res.json(rows);
  });
});

// تحديث بيانات الملف الشخصي
app.put("/api/profile/:userId", (req, res) => {
  const userId = req.params.userId;

  const {
    calorie_goal,
    protein_goal,
    carbs_goal,
    sugar_goal,
    favorite_vibe
  } = req.body;

  const sql = `
    UPDATE profiles
    SET
      calorie_goal = ?,
      protein_goal = ?,
      carbs_goal = ?,
      sugar_goal = ?,
      favorite_vibe = ?
    WHERE user_id = ?
  `;

  db.run(
    sql,
    [
      calorie_goal,
      protein_goal,
      carbs_goal,
      sugar_goal,
      favorite_vibe,
      userId
    ],
    function (err) {
      if (err) {
        console.error("PROFILE UPDATE ERROR:", err.message);
        return res.status(500).json({ error: err.message });
      }

      res.json({
        message: "Profile updated successfully"
      });
    }
  );
});


app.get("/api/profile/:userId", (req, res) => {
  const userId = req.params.userId;

  db.get(
    "SELECT * FROM profiles WHERE user_id = ?",
    [userId],
    (err, row) => {
      if (err) {
        console.error("PROFILE GET ERROR:", err.message);
        return res.status(500).json({ error: err.message });
      }

      if (!row) {
        return res.status(404).json({
          error: "Profile not found"
        });
      }

      res.json(row);
    }
  );
});

// SIGN UP
app.post("/api/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(400).json({
              error: "Email already exists"
            });
          }

          return res.status(500).json({ error: err.message });
        }

        const userId = this.lastID;

        db.run(
          `INSERT INTO profiles
           (user_id, display_name, calorie_goal, protein_goal,
            carbs_goal, fat_goal, sugar_goal, favorite_vibe)
           VALUES (?, ?, 2000, 100, 250, 70, 50, 'balanced')`,
          [userId, name],
          (profileErr) => {
            if (profileErr) {
              return res.status(500).json({
                error: profileErr.message
              });
            }

            res.status(201).json({
              message: "Account created",
              userId: userId
            });
          }
        );
      }
    );

  } catch (error) {
    res.status(500).json({ error: "Signup failed" });
  }
});


// LOGIN
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, user) => {

      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      // يدعم الحساب القديم مؤقتاً + الحسابات الجديدة المشفرة
      let passwordCorrect = false;

      if (user.password.startsWith("$2")) {
        passwordCorrect = await bcrypt.compare(
          password,
          user.password
        );
      } else {
        passwordCorrect = password === user.password;
      }

      if (!passwordCorrect) {
        return res.status(401).json({
          error: "Invalid email or password"
        });
      }

      res.json({
        message: "Login successful",
        userId: user.id
      });
    }
  );
});
app.delete("/api/daily-meals/:mealId", (req, res) => {
  const mealId = req.params.mealId;

  db.run(
    "DELETE FROM daily_meals WHERE id = ?",
    [mealId],
    function (err) {
      if (err) {
        console.error("DELETE MEAL ERROR:", err.message);
        return res.status(500).json({ error: err.message });
      }

      res.json({ message: "Meal deleted successfully" });
    }
  );
});



// تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`LUQMA server running on port ${PORT}`);
});