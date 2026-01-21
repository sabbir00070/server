import express from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import axios from "axios";
import cors from "cors";
import connectDB from "./config/db.js";
import User from "./models/User.js";
import Admin from "./models/Admin.js";
import Maintenance from "./models/Maintenance.js";

dotenv.config();
connectDB();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    req.user = jwt.verify(token, process.env.JWT_SEC);
    next();
  } catch {
    res.sendStatus(401);
  }
};

app.get("/api/login", async (req, res) => {
  try {
    const { chat_id, password } = req.query;

    if (!chat_id || !password) {
      return res.status(400).json({
        status: false,
        message: "Missing credentials"
      });
    }

    const admin = await Admin.findOne({ chat_id });
    if (!admin || admin.password !== password) {
      return res.status(401).json({
        status: false,
        message: "Invalid credentials"
      });
    }

    const token = jwt.sign(
      { id: admin._id, chat_id: admin.chat_id },
      process.env.JWT_SEC,
      { expiresIn: "1d" }
    );

    res.json({
      status: true,
      token,
      admin_id: admin._id
    });
  } catch {
    res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
});

app.post("/api/maintenance", auth, async (req, res) => {
  try {
    await Maintenance.findOneAndUpdate(
      {},
      {
        ...req.body,
        updated_at: new Date()
      },
      {
        new: true,
        upsert: true
      }
    );

    res.json({
      status: true,
      message: "Maintenance updated successfully"
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Failed to update maintenance"
    });
  }
});
app.get("/api/getUpdates", auth, async (req, res) => {
  const users = await Maintenance.find();
  res.json(users);
});



app.get("/api/admin/:id/profile", auth, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.id !== id) {
      return res.status(403).json({
        status: false,
        message: "Forbidden"
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({
        status: false,
        message: "Admin not found"
      });
    }

    const tg = await getTelegramData(admin.chat_id);

    res.json({
      status: true,
      chat_id: admin.chat_id,
      name: tg.name || "Admin",
      username: tg.username,
      imgUrl: tg.imgUrl
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
});

const tgCache = new Map();

const getTelegramData = async chatId => {
  if (tgCache.has(chatId)) return tgCache.get(chatId);

  let imgUrl = null;
  let name = null;
  let username = null;

  try {
    const chat = (
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
        params: { chat_id: chatId }
      })
    ).data.result;

    name = [chat.first_name, chat.last_name].filter(Boolean).join(" ");
    username = chat.username ? `@${chat.username}` : null;

    const photos = (
      await axios.get(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos`,
        { params: { user_id: chatId, limit: 1 } }
      )
    ).data.result.photos;

    if (photos.length) {
      const fileId = photos[0].pop().file_id;
      const file = (
        await axios.get(
          `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
          { params: { file_id: fileId } }
        )
      ).data.result.file_path;

      imgUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file}`;
    }
  } catch {}

  const data = { imgUrl, name, username };
  tgCache.set(chatId, data);
  return data;
};

const timeAgo = d => {
  const s = Math.floor((Date.now() - new Date(d)) / 1000);
  const t = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60]
  ];
  for (const [k, v] of t) {
    const n = Math.floor(s / v);
    if (n >= 1) return `${n} ${k}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
};

app.get("/api/users", auth, async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = 20;
  const skip = (page - 1) * limit;
  const q = req.query.q?.trim();

  const filter = q
    ? {
        $or: [
          { chat_id: q },
          { username: { $regex: q, $options: "i" } }
        ]
      }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ register_date: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter)
  ]);

  const data = await Promise.all(
    users.map(async u => ({
      ...u.toObject(),
      ...(await getTelegramData(u.chat_id)),
      time: timeAgo(u.register_date)
    }))
  );

  res.json({
    users: data,
    page,
    pages: Math.ceil(total / limit),
    total
  });
});

app.get("/api/users/:id", auth, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.sendStatus(404);

  const tg = await getTelegramData(user.chat_id);

  res.json({
    ...user.toObject(),
    ...tg,
    time: timeAgo(user.register_date)
  });
});

app.put("/api/users/:id", auth, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

app.get("/api/dashboard", auth, async (req, res) => {
  const total = await User.countDocuments();
  const banned = await User.countDocuments({ banned: true });
  const active = total - banned;

  res.json({
    total,
    active,
    banned,
    systemHealth: "Good"
  });
});

app.post("/api/users/:id/change_pass", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { CPassword, NPassword } = req.body;

    if (!CPassword || !NPassword) {
      return res.status(400).json({
        status: false,
        message: "All password fields are required"
      });
    }

    if (NPassword.length < 6) {
      return res.status(400).json({
        status: false,
        message: "Password must be at least 6 characters"
      });
    }

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({
        status: false,
        message: "Admin not found"
      });
    }

    if (admin.password !== CPassword) {
      return res.status(401).json({
        status: false,
        message: "Current password is incorrect"
      });
    }

    await Admin.findByIdAndUpdate(id, { password: NPassword });

    res.json({
      status: true,
      message: "Password updated successfully"
    });
  } catch {
    res.status(500).json({
      status: false,
      message: "Server error"
    });
  }
});

app.get("/api/latest_users", auth, async (req, res) => {
  try {
    const users = await User.find()
      .sort({ register_date: -1 })
      .limit(5);

    const data = await Promise.all(
      users.map(async u => ({
        ...u.toObject(),
        ...(await getTelegramData(u.chat_id)),
        time: timeAgo(u.register_date)
      }))
    );

    res.json(data);
  } catch {
    res.sendStatus(500);
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});