import mongoose from "mongoose";

const maintenanceSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      trim: true
    },
    message: {
      type: String,
      trim: true
    },
    start_time: Date,
    end_time: Date
  },
  {
    collection: "maintenance",
    timestamps: {
      createdAt: false,
      updatedAt: "updated_at"
    }
  }
);

export default mongoose.model("Maintenance", maintenanceSchema);