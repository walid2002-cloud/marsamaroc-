const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { randomUUID } = require("crypto");

const uploadDir =
  process.env.KB_UPLOAD_DIR ||
  path.join(__dirname, "..", "uploads", "knowledge");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  },
});

const allowedExt = new Set([".pdf", ".txt", ".docx"]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!allowedExt.has(ext)) {
    return cb(new Error("Format non supporté. Utilisez PDF, DOCX ou TXT."));
  }
  return cb(null, true);
};

const uploadKnowledgeDoc = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

module.exports = {
  uploadKnowledgeDoc,
  uploadDir,
};
