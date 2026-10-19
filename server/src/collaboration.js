import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import * as Y from "yjs";
import { Server } from "@hocuspocus/server";
import Document from "./models/Document.js";

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

  return doc.collaborators.find(
    (item) => (item.userId?._id || item.userId).toString() === userId.toString()
  )?.role;
}

export const collaborationServer = Server.configure({
  port: Number(process.env.COLLAB_PORT) || 1234,
  address: process.env.COLLAB_HOST || "::",

  async onAuthenticate({ documentName, token, connection }) {
    if (!mongoose.isValidObjectId(documentName)) {
      throw new Error("Invalid document ID");
    }

    if (!token) {
      throw new Error("Authentication required");
    }

    let payload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw new Error("Invalid or expired token");
    }

    if (!payload.sub || !mongoose.isValidObjectId(payload.sub)) {
      throw new Error("Invalid user identity");
    }

    const doc = await Document.findById(documentName);

    if (!doc || !canAccess(doc, payload.sub)) {
      throw new Error("You cannot access this document");
    }

    // Hocuspocus enforces read-only access for this connection.
    connection.readOnly = roleFor(doc, payload.sub) === "viewer";
  },

  async onLoadDocument({ documentName, document }) {
    const doc = await Document.findById(documentName);

    if (!doc) {
      throw new Error("Document not found");
    }

    if (doc.collabState?.length) {
      Y.applyUpdate(document, new Uint8Array(doc.collabState));
      return;
    }

    // Migrate existing plain-text content into Tiptap's Yjs fragment.
    if (doc.content?.length) {
      const fragment = document.getXmlFragment("default");
      const paragraph = new Y.XmlElement("paragraph");
      const text = new Y.XmlText();

      text.insert(0, doc.content);
      paragraph.insert(0, [text]);
      fragment.insert(0, [paragraph]);
    }
  },

  async onStoreDocument({ documentName, document }) {
    if (!mongoose.isValidObjectId(documentName)) return;

    const state = Buffer.from(Y.encodeStateAsUpdate(document));

    await Document.updateOne(
      { _id: documentName },
      { $set: { collabState: state, updatedAt: new Date() } }
    );
  },
});
