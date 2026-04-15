const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_ROOT =
  process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads", "bot-sources");

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDirSync(UPLOAD_ROOT);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDirSync(UPLOAD_ROOT);
    cb(null, UPLOAD_ROOT);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".pdf").toLowerCase();
    const safe = path
      .basename(file.originalname || "source", ext)
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 80);
    cb(null, `${Date.now()}_${safe}${ext}`);
  },
});

const uploadBotSourcePdf = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (ext !== ".pdf") {
      return cb(new Error("Seuls les fichiers PDF sont acceptés."));
    }
    return cb(null, true);
  },
});

module.exports = { uploadBotSourcePdf, UPLOAD_ROOT };

