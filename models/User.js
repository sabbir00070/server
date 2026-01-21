import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  chat_id: { type: String, unique: true },
  token: { type: String },

  coin: { type: Number, default: 0 },
  total_bom: { type: Number, default: 0 },
  rafer: { type: Number, default: 0 },

  isPremium: { type: Boolean, default: false },
  banned: { type: Boolean, default: false },

  register_date: { type: Date, default: Date.now }
});


export default mongoose.model("user", userSchema);