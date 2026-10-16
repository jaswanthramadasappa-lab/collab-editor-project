import mongoose from "mongoose";

const collaboratorSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["viewer", "editor"], default: "editor" }
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160, default: "Untitled document" },
content: { type: String, default: "" },

// Binary Yjs state used to restore collaborative edits
collabState: { type: Buffer, default: undefined },

ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    collaborators: { type: [collaboratorSchema], default: [] }
  },
  { timestamps: true }
);

documentSchema.index({ ownerId: 1, updatedAt: -1 });
export default mongoose.model("Document", documentSchema);
