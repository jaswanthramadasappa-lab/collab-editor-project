import { Router } from "express";
import mongoose from "mongoose";
import Document from "../models/Document.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

function canAccess(doc, userId) {
  const oId = (doc.ownerId?._id || doc.ownerId).toString();
  if (oId === userId.toString()) return true;
  return doc.collaborators.some(
    (item) => (item.userId?._id || item.userId).toString() === userId.toString()
  );
}

function roleFor(doc, userId) {
  const oId = (doc.ownerId?._id || doc.ownerId).toString();
  if (oId === userId.toString()) return "owner";
  const match = doc.collaborators.find(
    (item) => (item.userId?._id || item.userId).toString() === userId.toString()
  );
  return match?.role;
}

function safeDoc(doc, userId) {
  const ownerObj =
    doc.ownerId && typeof doc.ownerId === "object" && doc.ownerId.name
      ? { id: doc.ownerId._id.toString(), name: doc.ownerId.name, email: doc.ownerId.email }
      : null;

  return {
    id: doc._id.toString(),
    title: doc.title,
    content: doc.content || "",
    ownerId: (doc.ownerId?._id || doc.ownerId).toString(),
    owner: ownerObj,
    role: roleFor(doc, userId),
    collaborators: (doc.collaborators || []).map((item) => {
      const isPopulated = item.userId && typeof item.userId === "object" && item.userId._id;
      return {
        userId: (isPopulated ? item.userId._id : item.userId).toString(),
        name: isPopulated ? item.userId.name : undefined,
        email: isPopulated ? item.userId.email : undefined,
        role: item.role
      };
    }),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

router.get("/", async (req, res, next) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const docs = await Document.find({
      $or: [{ ownerId: userId }, { "collaborators.userId": userId }]
    })
      .populate("ownerId", "name email")
      .populate("collaborators.userId", "name email")
      .sort({ updatedAt: -1 })
      .limit(100);
    res.json({ documents: docs.map((doc) => safeDoc(doc, req.user.id)) });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const title =
      String(req.body.title || "Untitled document").trim().slice(0, 160) ||
      "Untitled document";
    const doc = await Document.create({ title, ownerId: req.user.id });
    res.status(201).json({ document: safeDoc(doc, req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }
    const doc = await Document.findById(req.params.id)
      .populate("ownerId", "name email")
      .populate("collaborators.userId", "name email");
    if (!doc || !canAccess(doc, req.user.id)) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.json({ document: safeDoc(doc, req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }
    const doc = await Document.findById(req.params.id);
    if (!doc || !canAccess(doc, req.user.id)) {
      return res.status(404).json({ message: "Document not found" });
    }
    const role = roleFor(doc, req.user.id);
    if (role === "viewer") {
      return res.status(403).json({ message: "Viewer access is read-only" });
    }
    if (Object.hasOwn(req.body, "title")) {
      const title = String(req.body.title).trim();
      if (!title || title.length > 160) {
        return res.status(400).json({ message: "Title must be 1–160 characters" });
      }
      doc.title = title;
    }
    if (Object.hasOwn(req.body, "content")) {
      if (typeof req.body.content !== "string" || req.body.content.length > 500000) {
        return res
          .status(400)
          .json({ message: "Content must be text up to 500,000 characters" });
      }
      doc.content = req.body.content;
    }
    await doc.save();
    await doc.populate("ownerId", "name email");
    await doc.populate("collaborators.userId", "name email");
    res.json({ document: safeDoc(doc, req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    if (!canAccess(doc, req.user.id)) {
      return res.status(404).json({ message: "Document not found" });
    }
    if ((doc.ownerId?._id || doc.ownerId).toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the owner can delete this document" });
    }
    await doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/share", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    if ((doc.ownerId?._id || doc.ownerId).toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the document owner can share it" });
    }
    const email = String(req.body.email || "").trim().toLowerCase();
    const role = req.body.role === "viewer" ? "viewer" : "editor";
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No registered user found with that email" });
    }
    if (user._id.toString() === req.user.id) {
      return res.status(400).json({ message: "You already own this document" });
    }
    const existing = doc.collaborators.find(
      (item) => (item.userId?._id || item.userId).toString() === user._id.toString()
    );
    if (existing) {
      existing.role = role;
    } else {
      doc.collaborators.push({ userId: user._id, role });
    }
    await doc.save();
    await doc.populate("ownerId", "name email");
    await doc.populate("collaborators.userId", "name email");
    res.json({
      document: safeDoc(doc, req.user.id),
      message: "Sharing permissions updated"
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/versions", async (_req, res) => {
  res.status(501).json({
    message: "Version history is planned for the next project milestone."
  });
});

export default router;
