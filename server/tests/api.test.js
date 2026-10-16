import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
const { app } = await import("../src/index.js");
const { connectDB } = await import("../src/config/db.js");
const User = (await import("../src/models/User.js")).default;
const Document = (await import("../src/models/Document.js")).default;

describe("CollabSpace API Test Suite", () => {
  let ownerToken = "";
  let ownerUser = null;
  let viewerToken = "";
  let viewerUser = null;
  let createdDocId = "";

  const uniqueSuffix = Date.now();
  const ownerEmail = `owner_${uniqueSuffix}@example.com`;
  const viewerEmail = `viewer_${uniqueSuffix}@example.com`;

  before(async () => {
    await connectDB();
  });

  after(async () => {
    // Clean up created test data
    if (ownerUser) {
      await Document.deleteMany({ ownerId: ownerUser.id });
      await User.deleteOne({ _id: ownerUser.id });
    }
    if (viewerUser) {
      await User.deleteOne({ _id: viewerUser.id });
    }
    await mongoose.connection.close();
  });

  test("GET /api/health returns 200 and database connected", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.database, "connected");
  });

  describe("Authentication", () => {
    test("POST /api/auth/register validates payload fields", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "A", email: "invalid", password: "123" });

      assert.equal(res.status, 400);
    });

    test("POST /api/auth/register creates user and returns token", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test Owner",
          email: ownerEmail,
          password: "Password123!"
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.token);
      assert.equal(res.body.user.email, ownerEmail);
      ownerToken = res.body.token;
      ownerUser = res.body.user;
    });

    test("POST /api/auth/register rejects duplicate email with 409", async () => {
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Another User",
          email: ownerEmail,
          password: "Password123!"
        });

      assert.equal(res.status, 409);
    });

    test("POST /api/auth/login validates credentials", async () => {
      const badPass = await request(app)
        .post("/api/auth/login")
        .send({ email: ownerEmail, password: "WrongPassword" });
      assert.equal(badPass.status, 401);

      const goodPass = await request(app)
        .post("/api/auth/login")
        .send({ email: ownerEmail, password: "Password123!" });
      assert.equal(goodPass.status, 200);
      assert.ok(goodPass.body.token);
    });

    test("GET /api/auth/me requires valid token", async () => {
      const unauth = await request(app).get("/api/auth/me");
      assert.equal(unauth.status, 401);

      const invalid = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalidtoken");
      assert.equal(invalid.status, 401);

      const auth = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${ownerToken}`);
      assert.equal(auth.status, 200);
      assert.equal(auth.body.user.email, ownerEmail);
    });
  });

  describe("Document Management & Collaboration Permissions", () => {
    before(async () => {
      // Register a second user for collaboration testing
      const res = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Test Viewer",
          email: viewerEmail,
          password: "Password123!"
        });
      viewerToken = res.body.token;
      viewerUser = res.body.user;
    });

    test("POST /api/documents creates a new document as owner", async () => {
      const res = await request(app)
        .post("/api/documents")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ title: "My First Doc" });

      assert.equal(res.status, 201);
      assert.equal(res.body.document.title, "My First Doc");
      assert.equal(res.body.document.role, "owner");
      createdDocId = res.body.document.id;
    });

    test("GET /api/documents lists user's accessible documents", async () => {
      const res = await request(app)
        .get("/api/documents")
        .set("Authorization", `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.documents));
      assert.ok(res.body.documents.some((d) => d.id === createdDocId));
    });

    test("GET /api/documents/:id returns document details", async () => {
      const res = await request(app)
        .get(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.document.id, createdDocId);
    });

    test("PATCH /api/documents/:id updates title and content", async () => {
      const res = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          title: "Renamed Doc",
          content: "<p>Updated rich-text content</p>"
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.document.title, "Renamed Doc");
      assert.equal(res.body.document.content, "<p>Updated rich-text content</p>");
    });

    test("POST /api/documents/:id/share grants viewer role", async () => {
      const res = await request(app)
        .post(`/api/documents/${createdDocId}/share`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: viewerEmail,
          role: "viewer"
        });

      assert.equal(res.status, 200);
      assert.ok(
        res.body.document.collaborators.some(
          (c) => c.userId === viewerUser.id && c.role === "viewer"
        )
      );
    });

    test("Viewer can read but CANNOT edit document", async () => {
      // Read access should succeed
      const readRes = await request(app)
        .get(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`);
      assert.equal(readRes.status, 200);
      assert.equal(readRes.body.document.role, "viewer");

      // Edit access should be forbidden (403)
      const editRes = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ content: "Malicious modification" });
      assert.equal(editRes.status, 403);
    });

    test("Non-owner CANNOT delete document", async () => {
      const res = await request(app)
        .delete(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`);
      assert.equal(res.status, 403);
    });

    test("Non-owner CANNOT share document", async () => {
      const res = await request(app)
        .post(`/api/documents/${createdDocId}/share`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ email: "anyone@example.com", role: "editor" });
      assert.equal(res.status, 403);
    });

    test("Owner can upgrade collaborator to editor", async () => {
      const res = await request(app)
        .post(`/api/documents/${createdDocId}/share`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: viewerEmail,
          role: "editor"
        });

      assert.equal(res.status, 200);

      // Now editor can edit document
      const editRes = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ content: "<p>Collab edit by teammate</p>" });
      assert.equal(editRes.status, 200);
      assert.equal(editRes.body.document.content, "<p>Collab edit by teammate</p>");
    });

    test("Owner can delete document", async () => {
      const res = await request(app)
        .delete(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.message, "Document deleted");

      // Verify it no longer exists
      const checkRes = await request(app)
        .get(`/api/documents/${createdDocId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      assert.equal(checkRes.status, 404);
    });
  });
});
